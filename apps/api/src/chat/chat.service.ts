import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { MessageRole, MessageStatus } from '@prisma/client';
import { Observable, concat, from, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { AgentService } from '../agents/agent.service';
import { cleanAnswer } from '../common/answer.util';
import { parseCitations, verifyCitations } from '../common/citations.util';
import { PrismaService } from '../prisma/prisma.service';
import { askPrompt } from './prompts';
import { LiveMessage } from './live';

@Injectable()
export class ChatService {
  private readonly log = new Logger(ChatService.name);
  private readonly live = new Map<string, LiveMessage>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly agents: AgentService,
  ) {}

  async listThreads(repoId: string) {
    return this.prisma.thread.findMany({
      where: { repoId },
      orderBy: { updatedAt: 'desc' },
      include: {
        messages: {
          where: { role: MessageRole.USER },
          orderBy: { createdAt: 'asc' },
          take: 1,
          select: { content: true },
        },
        _count: { select: { messages: true } },
      },
    });
  }

  async getThread(threadId: string) {
    const thread = await this.prisma.thread.findUnique({
      where: { id: threadId },
      include: {
        repo: { select: { id: true, slug: true, name: true, path: true } },
        messages: {
          orderBy: { createdAt: 'asc' },
          include: { citations: { orderBy: { order: 'asc' } } },
        },
      },
    });
    if (!thread) throw new NotFoundException('Thread not found');
    return thread;
  }

  async deleteThread(threadId: string) {
    await this.prisma.thread.delete({ where: { id: threadId } });
    return { ok: true };
  }

  /** Create a thread with its first question and start answering. */
  async ask(repoId: string, question: string, presetKey?: string) {
    const repo = await this.prisma.repo.findUniqueOrThrow({ where: { id: repoId } });
    const thread = await this.prisma.thread.create({
      data: { repoId, title: titleFrom(question), presetKey: presetKey ?? repo.defaultPreset },
    });
    return this.appendTurn(thread.id, question, presetKey ?? repo.defaultPreset);
  }

  /** Add a follow-up question to an existing thread. */
  async followUp(threadId: string, question: string, presetKey?: string) {
    const thread = await this.prisma.thread.findUniqueOrThrow({ where: { id: threadId } });
    return this.appendTurn(threadId, question, presetKey ?? thread.presetKey);
  }

  private async appendTurn(threadId: string, question: string, presetKey: string) {
    const [userMessage, assistantMessage] = await this.prisma.$transaction([
      this.prisma.message.create({
        data: { threadId, role: MessageRole.USER, content: question, status: MessageStatus.COMPLETE },
      }),
      this.prisma.message.create({
        data: { threadId, role: MessageRole.ASSISTANT, content: '', status: MessageStatus.PENDING, presetKey },
      }),
    ]);

    void this.runAnswer(threadId, assistantMessage.id, question, presetKey).catch((err) =>
      this.log.error(`answer ${assistantMessage.id} failed: ${err?.message}`),
    );

    return { threadId, userMessageId: userMessage.id, messageId: assistantMessage.id };
  }

  /** SSE stream for one assistant message: buffered events first, then live. */
  stream(messageId: string): Observable<{ data: string }> {
    const live = this.live.get(messageId);
    if (!live) {
      return from(this.replayFinished(messageId)).pipe(map((data) => ({ data: JSON.stringify(data) })));
    }
    const buffered = from([...live.events]);
    const source = live.done ? buffered : concat(buffered, live.subject);
    return source.pipe(map((e) => ({ data: JSON.stringify(e) })));
  }

  /** A message that finished before the client connected replays as one event. */
  private async replayFinished(messageId: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: { citations: { orderBy: { order: 'asc' } } },
    });
    if (!message) return [{ type: 'error', message: 'Message not found' }];
    return [
      ...message.scannedFiles.map((path) => ({ type: 'tool', path })),
      message.status === 'FAILED'
        ? { type: 'error', message: message.error ?? 'failed' }
        : { type: 'done', content: message.content, citations: message.citations },
    ];
  }

  private async runAnswer(threadId: string, messageId: string, question: string, presetKey: string) {
    const live = new LiveMessage();
    this.live.set(messageId, live);
    const started = Date.now();

    try {
      const thread = await this.prisma.thread.findUniqueOrThrow({
        where: { id: threadId },
        include: {
          repo: true,
          messages: { orderBy: { createdAt: 'asc' }, where: { status: MessageStatus.COMPLETE } },
        },
      });

      const pages = await this.prisma.wikiPage.findMany({
        where: { repoId: thread.repoId },
        orderBy: { order: 'asc' },
        select: { title: true },
      });

      const history = thread.messages
        .filter((m) => m.id !== messageId && m.content)
        .slice(-6)
        .map((m) => ({ role: m.role, content: m.content }));

      await this.prisma.message.update({
        where: { id: messageId },
        data: { status: MessageStatus.STREAMING },
      });

      const prompt = askPrompt({
        repoName: thread.repo.name,
        repoPath: thread.repo.path,
        question,
        wikiOutline: pages.map((p) => p.title).join(', ') || 'none yet',
        history: history.slice(0, -1),
      });

      const result = await this.agents.run(
        presetKey,
        {
          cwd: thread.repo.path,
          prompt,
          // Resuming keeps the CLI's own context across follow-ups in a thread.
          resumeSessionId: thread.sessionId ?? undefined,
        },
        (ev) => {
          if (ev.type === 'tool') live.push({ type: 'tool', tool: ev.tool, path: ev.path, detail: ev.detail });
          else if (ev.type === 'text') live.push({ type: 'text', text: ev.text });
          else if (ev.type === 'thinking') live.push({ type: 'thinking', text: ev.text });
        },
      );

      const answer = cleanAnswer(result.text);
      const citations = verifyCitations(parseCitations(answer), result.scannedFiles);

      const saved = await this.prisma.message.update({
        where: { id: messageId },
        data: {
          content: answer,
          status: MessageStatus.COMPLETE,
          scannedFiles: result.scannedFiles,
          sessionId: result.sessionId ?? null,
          durationMs: Date.now() - started,
          citations: {
            create: citations.map((c, i) => ({
              path: c.path,
              startLine: c.startLine ?? null,
              endLine: c.endLine ?? null,
              verified: c.verified,
              order: i,
            })),
          },
        },
        include: { citations: { orderBy: { order: 'asc' } } },
      });

      await this.prisma.thread.update({
        where: { id: threadId },
        data: { sessionId: result.sessionId ?? thread.sessionId, updatedAt: new Date() },
      });

      live.push({ type: 'done', content: saved.content, citations: saved.citations });
    } catch (err: any) {
      const message = err?.message ?? String(err);
      await this.prisma.message.update({
        where: { id: messageId },
        data: { status: MessageStatus.FAILED, error: message },
      });
      live.push({ type: 'error', message });
    } finally {
      // Keep the buffer briefly so a slow client can still replay from memory.
      setTimeout(() => this.live.delete(messageId), 60_000).unref?.();
    }
  }
}

function titleFrom(question: string): string {
  const clean = question.trim().replace(/\s+/g, ' ');
  return clean.length > 72 ? `${clean.slice(0, 72)}…` : clean;
}
