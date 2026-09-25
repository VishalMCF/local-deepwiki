import { Injectable, Logger } from '@nestjs/common';
import { JobKind, JobStatus, PageStatus, RepoStatus } from '@prisma/client';
import { AgentService } from '../agents/agent.service';
import { extractJson } from '../agents/json.util';
import { parseCitations, verifyCitations } from '../common/citations.util';
import { changedFiles, readGitInfo } from '../common/git.util';
import { runPool } from '../common/pool.util';
import { slugify } from '../common/slug.util';
import { EventsService } from '../events/events.service';
import { PrismaService } from '../prisma/prisma.service';
import { scanRepo } from '../repos/scanner.util';
import { outlinePrompt, pagePrompt, RepoFacts } from './prompts';

interface OutlineNode {
  slug?: string;
  title: string;
  summary?: string;
  hint?: string;
  children?: OutlineNode[];
}

interface OutlineResult {
  title?: string;
  description?: string;
  primaryLanguage?: string;
  pages: OutlineNode[];
}

@Injectable()
export class IndexerService {
  private readonly log = new Logger(IndexerService.name);
  /** repoId -> controller, so an in-flight index can be cancelled. */
  private readonly running = new Map<string, AbortController>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly agents: AgentService,
    private readonly events: EventsService,
  ) {}

  isRunning(repoId: string) {
    return this.running.has(repoId);
  }

  cancel(repoId: string) {
    this.running.get(repoId)?.abort();
    this.running.delete(repoId);
  }

  /** Kick off indexing without blocking the HTTP response. */
  start(repoId: string, presetKey?: string, mode: 'full' | 'refresh' = 'full') {
    if (this.running.has(repoId)) return;
    void this.index(repoId, presetKey, mode).catch((err) =>
      this.log.error(`index ${repoId} failed: ${err?.message}`, err?.stack),
    );
  }

  private emit(repoId: string, type: string, payload?: any) {
    this.events.emit(`repo:${repoId}`, type, payload);
  }

  async index(repoId: string, presetKey?: string, mode: 'full' | 'refresh' = 'full') {
    const repo = await this.prisma.repo.findUniqueOrThrow({ where: { id: repoId } });
    const abort = new AbortController();
    this.running.set(repoId, abort);

    try {
      await this.prisma.repo.update({
        where: { id: repoId },
        data: { status: RepoStatus.INDEXING, error: null },
      });
      this.emit(repoId, 'status', { status: 'INDEXING', mode });

      const preset = presetKey ?? repo.defaultPreset;
      const git = await readGitInfo(repo.path);

      const staleSlugs =
        mode === 'refresh' ? await this.findStalePages(repoId, repo.path, repo.indexedSha) : null;

      if (mode === 'full' || staleSlugs === null) {
        await this.buildOutline(repo.id, repo.path, repo.name, preset, abort.signal);
      }

      const pages = await this.prisma.wikiPage.findMany({
        where: {
          repoId,
          ...(staleSlugs ? { slug: { in: staleSlugs } } : {}),
        },
        orderBy: { order: 'asc' },
      });

      if (!pages.length) {
        this.emit(repoId, 'log', { message: 'No pages needed regeneration.' });
      }

      const allPages = await this.prisma.wikiPage.findMany({
        where: { repoId },
        orderBy: { order: 'asc' },
        select: { id: true, title: true, slug: true, parentId: true },
      });

      const concurrency = Number(process.env.INDEX_CONCURRENCY ?? 4);
      let done = 0;

      await runPool(pages, concurrency, async (page) => {
        if (abort.signal.aborted) return;
        await this.generatePage(repo, page, allPages, preset, abort.signal);
        done++;
        this.emit(repoId, 'progress', { done, total: pages.length });
      });

      await this.prisma.repo.update({
        where: { id: repoId },
        data: {
          status: RepoStatus.READY,
          indexedAt: new Date(),
          indexedSha: git.sha ?? null,
          headSha: git.sha ?? null,
          gitBranch: git.branch ?? null,
          gitRemote: git.remote ?? null,
        },
      });
      this.emit(repoId, 'status', { status: 'READY' });
    } catch (err: any) {
      const message = err?.message ?? String(err);
      await this.prisma.repo.update({
        where: { id: repoId },
        data: { status: RepoStatus.FAILED, error: message },
      });
      this.emit(repoId, 'status', { status: 'FAILED', error: message });
      throw err;
    } finally {
      this.running.delete(repoId);
      this.emit(repoId, 'done', {});
    }
  }

  // --- stage 1: outline -----------------------------------------------------

  private async buildOutline(
    repoId: string,
    repoPath: string,
    repoName: string,
    presetKey: string,
    signal: AbortSignal,
  ) {
    const job = await this.prisma.job.create({
      data: { repoId, kind: JobKind.OUTLINE, status: JobStatus.RUNNING, label: 'Outline', startedAt: new Date() },
    });
    this.emit(repoId, 'job', { id: job.id, kind: 'OUTLINE', status: 'RUNNING', label: 'Planning wiki outline' });

    const scan = await scanRepo(repoPath);
    const facts: RepoFacts = {
      name: repoName,
      path: repoPath,
      languages: scan.languages,
      entrypoints: [...scan.entrypoints, ...scan.manifests],
      topLevel: scan.topLevel,
      readmeExcerpt: scan.readmeExcerpt,
      fileCount: scan.fileCount,
    };

    const result = await this.agents.run(
      presetKey,
      { cwd: repoPath, prompt: outlinePrompt(facts), signal },
      (ev) => {
        if (ev.type === 'tool' && ev.path) this.emit(repoId, 'scanning', { path: ev.path });
      },
    );

    const outline = extractJson<OutlineResult>(result.text);
    if (!outline?.pages?.length) {
      await this.prisma.job.update({
        where: { id: job.id },
        data: { status: JobStatus.FAILED, error: 'outline agent returned no parseable JSON', finishedAt: new Date() },
      });
      throw new Error('Outline agent did not return a parseable page list.');
    }

    await this.prisma.repo.update({
      where: { id: repoId },
      data: {
        description: outline.description ?? undefined,
        language: outline.primaryLanguage ?? scan.primaryLanguage ?? undefined,
        fileCount: scan.fileCount,
      },
    });

    await this.persistOutline(repoId, outline.pages);

    await this.prisma.job.update({
      where: { id: job.id },
      data: { status: JobStatus.DONE, finishedAt: new Date() },
    });
    this.emit(repoId, 'outline', { count: await this.prisma.wikiPage.count({ where: { repoId } }) });
  }

  /** Replace the page tree, preserving content of pages whose slug is unchanged. */
  private async persistOutline(repoId: string, nodes: OutlineNode[]) {
    const existing = await this.prisma.wikiPage.findMany({ where: { repoId } });
    const bySlug = new Map(existing.map((p) => [p.slug, p]));
    const keep = new Set<string>();
    let order = 0;

    const upsert = async (node: OutlineNode, parentId: string | null) => {
      const slug = slugify(node.slug || node.title);
      keep.add(slug);
      const prior = bySlug.get(slug);
      const data = {
        repoId,
        parentId,
        slug,
        title: node.title,
        summary: node.summary ?? null,
        hint: node.hint ?? null,
        order: order++,
      };

      const page = prior
        ? await this.prisma.wikiPage.update({ where: { id: prior.id }, data })
        : await this.prisma.wikiPage.create({ data: { ...data, status: PageStatus.PENDING } });

      for (const child of node.children ?? []) await upsert(child, page.id);
    };

    for (const node of nodes) await upsert(node, null);

    const stale = existing.filter((p) => !keep.has(p.slug)).map((p) => p.id);
    if (stale.length) await this.prisma.wikiPage.deleteMany({ where: { id: { in: stale } } });
  }

  // --- stage 2: page generation --------------------------------------------

  private async generatePage(
    repo: { id: string; path: string; name: string },
    page: { id: string; title: string; summary: string | null; hint: string | null; parentId: string | null },
    allPages: { id: string; title: string; slug: string; parentId: string | null }[],
    presetKey: string,
    signal: AbortSignal,
  ) {
    const started = Date.now();
    const job = await this.prisma.job.create({
      data: {
        repoId: repo.id,
        kind: JobKind.PAGE,
        status: JobStatus.RUNNING,
        pageId: page.id,
        label: page.title,
        startedAt: new Date(),
      },
    });

    await this.prisma.wikiPage.update({
      where: { id: page.id },
      data: { status: PageStatus.GENERATING, error: null },
    });
    this.emit(repo.id, 'page', { pageId: page.id, title: page.title, status: 'GENERATING' });

    const parent = allPages.find((p) => p.id === page.parentId) ?? null;
    const children = allPages
      .filter((p) => p.parentId === page.id)
      .map((p) => ({ title: p.title, slug: p.slug }));
    const siblings = allPages
      .filter((p) => p.id !== page.id)
      .map((p) => ({ title: p.title, slug: p.slug }));

    try {
      const result = await this.agents.run(
        presetKey,
        {
          cwd: repo.path,
          prompt: pagePrompt({
            repoName: repo.name,
            repoPath: repo.path,
            title: page.title,
            summary: page.summary ?? undefined,
            hint: page.hint ?? undefined,
            siblings,
            children,
            parentTitle: parent?.title,
          }),
          signal,
        },
        (ev) => {
          if (ev.type === 'tool' && ev.path) {
            this.emit(repo.id, 'scanning', { pageId: page.id, path: ev.path });
          }
        },
      );

      const markdown = cleanMarkdown(result.text);
      const citations = verifyCitations(parseCitations(markdown), result.scannedFiles);

      await this.prisma.$transaction([
        this.prisma.citation.deleteMany({ where: { pageId: page.id } }),
        this.prisma.wikiPage.update({
          where: { id: page.id },
          data: {
            content: markdown,
            status: PageStatus.READY,
            error: null,
            scannedFiles: result.scannedFiles,
            presetKey,
            durationMs: Date.now() - started,
            generatedAt: new Date(),
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
        }),
        this.prisma.job.update({
          where: { id: job.id },
          data: { status: JobStatus.DONE, finishedAt: new Date() },
        }),
      ]);

      this.emit(repo.id, 'page', { pageId: page.id, title: page.title, status: 'READY' });
    } catch (err: any) {
      const message = err?.message ?? String(err);
      await this.prisma.wikiPage.update({
        where: { id: page.id },
        data: { status: PageStatus.FAILED, error: message },
      });
      await this.prisma.job.update({
        where: { id: job.id },
        data: { status: JobStatus.FAILED, error: message, finishedAt: new Date() },
      });
      this.emit(repo.id, 'page', { pageId: page.id, title: page.title, status: 'FAILED', error: message });
      this.log.warn(`page "${page.title}" failed: ${message}`);
    }
  }

  // --- refresh --------------------------------------------------------------

  /**
   * A page is stale when a file it cites (or read while being written) changed
   * since the last index. Returns null when a full rebuild is needed.
   */
  private async findStalePages(repoId: string, repoPath: string, indexedSha?: string | null) {
    if (!indexedSha) return null;
    const changed = await changedFiles(repoPath, indexedSha);
    if (!changed.length) return [];

    const pages = await this.prisma.wikiPage.findMany({
      where: { repoId },
      include: { citations: true },
    });
    if (!pages.length) return null;

    const stale = pages.filter((page) => {
      if (page.status !== PageStatus.READY) return true;
      const touched = new Set([...page.scannedFiles, ...page.citations.map((c) => c.path)]);
      return changed.some((f) => touched.has(f) || [...touched].some((t) => f.endsWith(t)));
    });

    this.emit(repoId, 'log', {
      message: `${changed.length} file(s) changed; regenerating ${stale.length} page(s).`,
    });
    return stale.map((p) => p.slug);
  }
}

/**
 * Strip stray outer code fences and any conversational preamble the agent emits
 * before the page itself ("Have enough. Writing the page now.").
 */
export function cleanMarkdown(text: string): string {
  let out = text.trim();

  const fenced = out.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/);
  if (fenced) out = fenced[1].trim();

  // The prompt requires the page to start with an H1, so anything before the
  // first one is chatter rather than content.
  const h1 = out.search(/^# .+$/m);
  if (h1 > 0) out = out.slice(h1);

  return out.trim();
}
