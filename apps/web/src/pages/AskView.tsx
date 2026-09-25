import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, ArrowLeft, Loader2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChatBar } from '../components/ChatBar';
import { CodeViewer, type CodeTarget } from '../components/CodeViewer';
import { Markdown } from '../components/Markdown';
import { ScanningPanel } from '../components/ScanningPanel';
import { SourceRow, type SourceRef } from '../components/SourceChip';
import { ThreadList } from '../components/ThreadList';
import { TopBar } from '../components/TopBar';
import { api } from '../lib/api';
import { useAnswerStream, type ScanEntry } from '../lib/sse';
import type { Citation, Message } from '../lib/types';

export function AskView() {
  const { slug = '', threadId } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [presetKey, setPresetKey] = useState('fast');
  const [pendingMessageId, setPendingMessageId] = useState<string | null>(null);
  const [codeTarget, setCodeTarget] = useState<CodeTarget | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const repo = useQuery({ queryKey: ['repo', slug], queryFn: () => api.getRepo(slug) });
  const presets = useQuery({ queryKey: ['presets'], queryFn: api.presets });
  const threads = useQuery({ queryKey: ['threads', slug], queryFn: () => api.threads(slug) });

  const thread = useQuery({
    queryKey: ['thread', threadId],
    queryFn: () => api.thread(threadId!),
    enabled: Boolean(threadId),
  });

  useEffect(() => {
    if (repo.data) setPresetKey(repo.data.defaultPreset);
  }, [repo.data?.defaultPreset]);

  // Attach to the newest answer that has not finished yet.
  useEffect(() => {
    const last = thread.data?.messages.at(-1);
    if (last?.role === 'ASSISTANT' && (last.status === 'PENDING' || last.status === 'STREAMING')) {
      setPendingMessageId(last.id);
    }
  }, [thread.data]);

  const stream = useAnswerStream(pendingMessageId);

  // When the stream completes, refetch so the answer is served from the DB.
  useEffect(() => {
    if (!stream.done || !pendingMessageId) return;
    setPendingMessageId(null);
    qc.invalidateQueries({ queryKey: ['thread', threadId] });
    qc.invalidateQueries({ queryKey: ['threads', slug] });
  }, [stream.done, pendingMessageId, qc, threadId, slug]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [thread.data?.messages.length, pendingMessageId]);

  const startThread = useMutation({
    mutationFn: (question: string) => api.ask(slug, question, presetKey),
    onSuccess: (res) => {
      setPendingMessageId(res.messageId);
      qc.invalidateQueries({ queryKey: ['threads', slug] });
      navigate(`/repo/${slug}/chat/${res.threadId}`);
    },
  });

  const followUp = useMutation({
    mutationFn: (question: string) => api.followUp(threadId!, question, presetKey),
    onSuccess: (res) => {
      setPendingMessageId(res.messageId);
      qc.invalidateQueries({ queryKey: ['thread', threadId] });
    },
  });

  const removeThread = useMutation({
    mutationFn: (id: string) => api.deleteThread(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['threads', slug] });
      if (id === threadId) navigate(`/repo/${slug}/chat`);
    },
  });

  const busy = Boolean(pendingMessageId) || startThread.isPending || followUp.isPending;
  const messages = thread.data?.messages ?? [];

  // While streaming, the right pane shows the scan list; afterwards, the code.
  const liveScan: ScanEntry[] = stream.scanned;
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'ASSISTANT');
  const rightPaneScan = pendingMessageId
    ? liveScan
    : (lastAssistant?.scannedFiles ?? []).map((path) => ({ path }));

  return (
    <div className="flex min-h-full flex-col">
      <TopBar subtitle={repo.data?.name} />

      <div className="page-frame mx-auto flex w-full max-w-[1900px] flex-1">
        <aside className="hidden w-[280px] shrink-0 md:block">
          <div className="sticky top-[70px] h-[calc(100vh-70px)]">
            <ThreadList
              repoSlug={slug}
              threads={threads.data ?? []}
              activeId={threadId}
              onDelete={(id) => removeThread.mutate(id)}
            />
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-6 pb-[200px] pt-8">
          <Link
            to={`/repo/${slug}`}
            className="mb-5 inline-flex items-center gap-1.5 text-[14px] text-muted transition hover:text-fg"
          >
            <ArrowLeft size={14} />
            {repo.data?.name ?? slug}
          </Link>

          {!threadId && !messages.length && (
            <EmptyState repoName={repo.data?.name ?? slug} />
          )}

          <div className="grid grid-cols-1 gap-8 xl:grid-cols-2">
            <div className="min-w-0 space-y-10">
              {messages.map((message, i) => (
                <Turn
                  key={message.id}
                  message={message}
                  repoSlug={slug}
                  streaming={message.id === pendingMessageId}
                  streamText={message.id === pendingMessageId ? stream.text : undefined}
                  streamError={message.id === pendingMessageId ? stream.error : undefined}
                  presetLabel={
                    presets.data?.find((p) => p.key === (message.presetKey ?? presetKey))?.label
                  }
                  onOpenSource={setCodeTarget}
                  isLast={i === messages.length - 1}
                />
              ))}
              <div ref={bottomRef} />
            </div>

            <div className="min-w-0 xl:sticky xl:top-[94px] xl:h-[calc(100vh-150px)]">
              {codeTarget ? (
                <CodeViewer
                  repoSlug={slug}
                  repoName={repo.data?.name ?? slug}
                  target={codeTarget}
                  onClose={() => setCodeTarget(null)}
                />
              ) : (
                (busy || rightPaneScan.length > 0) && (
                  <ScanningPanel entries={rightPaneScan} done={!pendingMessageId} />
                )
              )}
            </div>
          </div>
        </main>
      </div>

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-4 pb-5">
        <div className="pointer-events-auto mx-auto max-w-[1060px]">
          <ChatBar
            placeholder={threadId ? 'Ask a follow-up question' : `Ask about ${repo.data?.name ?? slug}`}
            presets={presets.data ?? []}
            presetKey={presetKey}
            onPresetChange={setPresetKey}
            busy={busy}
            autoFocus={!threadId}
            floating
            onSubmit={(q) => (threadId ? followUp.mutate(q) : startThread.mutate(q))}
          />
        </div>
      </div>
    </div>
  );
}

function Turn({
  message,
  repoSlug,
  streaming,
  streamText,
  streamError,
  presetLabel,
  onOpenSource,
  isLast,
}: {
  message: Message;
  repoSlug: string;
  streaming?: boolean;
  streamText?: string;
  streamError?: string;
  presetLabel?: string;
  onOpenSource: (target: CodeTarget) => void;
  isLast: boolean;
}) {
  const verified = useMemo(() => new Set(message.scannedFiles ?? []), [message.scannedFiles]);

  if (message.role === 'USER') {
    return (
      <div>
        <h1 className="text-[26px] font-semibold leading-tight tracking-tight">{message.content}</h1>
        {presetLabel && (
          <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-elevated px-2.5 py-1 text-[12px] text-muted">
            {presetLabel}
          </span>
        )}
      </div>
    );
  }

  const content = streaming ? (streamText ?? '') : message.content;
  const error = streamError ?? (message.status === 'FAILED' ? message.error : null);

  if (error) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2.5 text-[13px] text-danger">
        <AlertCircle size={15} className="mt-0.5 shrink-0" />
        <span>{error}</span>
      </div>
    );
  }

  if (!content) {
    return (
      <div className="space-y-2.5 rounded-xl bg-elevated/60 p-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="skeleton h-3.5" style={{ width: `${40 + ((i * 19) % 50)}%` }} />
        ))}
      </div>
    );
  }

  return (
    <div>
      <Markdown content={content} onOpenSource={onOpenSource} verifiedPaths={verified} />
      {streaming && (
        <span className="mt-2 inline-flex items-center gap-2 text-[13px] text-faint">
          <Loader2 size={13} className="animate-spin" />
          Thinking…
        </span>
      )}
      {!streaming && message.citations?.length > 0 && (
        <CitationFooter citations={message.citations} onOpen={onOpenSource} />
      )}
    </div>
  );
}

function CitationFooter({
  citations,
  onOpen,
}: {
  citations: Citation[];
  onOpen: (target: CodeTarget) => void;
}) {
  const sources: SourceRef[] = citations.map((c) => ({
    path: c.path,
    startLine: c.startLine,
    endLine: c.endLine,
    verified: c.verified,
  }));
  return (
    <div className="mt-5 border-t border-line-soft pt-4">
      <SourceRow sources={sources} onOpen={(s) => onOpen(s)} label="Cited sources:" />
    </div>
  );
}

function EmptyState({ repoName }: { repoName: string }) {
  const examples = [
    'What are the core packages used in this project?',
    'How does a request flow through the system end to end?',
    'Where is authentication enforced?',
    'If I want to learn from this codebase, what problems can be extracted from it?',
  ];
  return (
    <div className="max-w-xl py-10">
      <h1 className="text-[26px] font-semibold tracking-tight">Ask about {repoName}</h1>
      <p className="mt-2 text-[14.5px] text-muted">
        The agent reads the code on demand and cites the exact files and line ranges it used.
      </p>
      <ul className="mt-6 space-y-2">
        {examples.map((example) => (
          <li key={example} className="rounded-lg border border-line px-3.5 py-2.5 text-[13.5px] text-muted">
            {example}
          </li>
        ))}
      </ul>
    </div>
  );
}
