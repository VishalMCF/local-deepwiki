import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Loader2, MessageSquare, PencilLine } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { ChatBar } from '../components/ChatBar';
import { CodeViewer, type CodeTarget } from '../components/CodeViewer';
import { IndexingOverlay } from '../components/IndexingOverlay';
import { Markdown, extractHeadings } from '../components/Markdown';
import { RefreshCard } from '../components/RefreshCard';
import { RelevantSources } from '../components/RelevantSources';
import { TocPanel } from '../components/TocPanel';
import { TopBar } from '../components/TopBar';
import { WikiSidebar } from '../components/WikiSidebar';
import { api } from '../lib/api';
import { useIndexProgress } from '../lib/sse';

export function RepoWiki() {
  const { slug = '', pageSlug } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [codeTarget, setCodeTarget] = useState<CodeTarget | null>(null);
  const [presetKey, setPresetKey] = useState<string>('fast');

  const repo = useQuery({
    queryKey: ['repo', slug],
    queryFn: () => api.getRepo(slug),
    refetchInterval: (q) => (q.state.data?.status === 'INDEXING' ? 4000 : false),
  });

  const tree = useQuery({
    queryKey: ['tree', slug],
    queryFn: () => api.wikiTree(slug),
    enabled: Boolean(repo.data),
    refetchInterval: repo.data?.status === 'INDEXING' ? 4000 : false,
  });

  const presets = useQuery({ queryKey: ['presets'], queryFn: api.presets });

  const indexing = repo.data?.status === 'INDEXING' || repo.data?.status === 'PENDING';
  const progress = useIndexProgress(repo.data?.id, indexing);

  useEffect(() => {
    if (repo.data) setPresetKey(repo.data.defaultPreset);
  }, [repo.data?.defaultPreset]);

  // Indexing just finished: pull the finished pages in.
  useEffect(() => {
    if (progress.finished) {
      qc.invalidateQueries({ queryKey: ['repo', slug] });
      qc.invalidateQueries({ queryKey: ['tree', slug] });
    }
  }, [progress.finished, qc, slug]);

  const firstSlug = tree.data?.[0]?.slug;
  const activeSlug = pageSlug ?? firstSlug;

  const page = useQuery({
    queryKey: ['page', slug, activeSlug],
    queryFn: () => api.wikiPage(slug, activeSlug!),
    enabled: Boolean(activeSlug),
    refetchInterval: (q) => (q.state.data?.status === 'GENERATING' ? 4000 : false),
  });

  const refresh = useMutation({
    mutationFn: (mode: 'refresh' | 'full') => api.refreshRepo(repo.data!.id, mode, presetKey),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['repo', slug] }),
  });

  const ask = useMutation({
    mutationFn: (question: string) => api.ask(slug, question, presetKey),
    onSuccess: (res) => navigate(`/repo/${slug}/chat/${res.threadId}`),
  });

  const headings = useMemo(() => extractHeadings(page.data?.content), [page.data?.content]);
  const verifiedPaths = useMemo(
    () => new Set(page.data?.scannedFiles ?? []),
    [page.data?.scannedFiles],
  );

  if (repo.isError) return <NotFound slug={slug} />;

  if (!repo.data) {
    return (
      <div className="min-h-full">
        <TopBar />
        <div className="grid h-[60vh] place-items-center text-muted">
          <Loader2 className="animate-spin" />
        </div>
      </div>
    );
  }

  if (indexing && !tree.data?.length) {
    return (
      <div className="min-h-full">
        <TopBar subtitle={repo.data.name} />
        <IndexingOverlay repoName={repo.data.name} progress={progress} />
      </div>
    );
  }

  if (!pageSlug && firstSlug) return <Navigate to={`/repo/${slug}/${firstSlug}`} replace />;

  return (
    <div className="min-h-full">
      <TopBar
        subtitle={repo.data.name}
        right={
          <Link
            to={`/repo/${slug}/chat`}
            className="flex h-9 items-center gap-2 rounded-lg border border-line px-3.5 text-[13.5px] text-muted transition hover:text-fg"
          >
            <MessageSquare size={15} />
            Conversations
            {repo.data.threadCount > 0 && (
              <span className="rounded-full bg-elevated px-1.5 text-[11.5px]">{repo.data.threadCount}</span>
            )}
          </Link>
        }
      />

      <div className="page-frame mx-auto flex max-w-[1900px]">
        <aside className="hidden w-[300px] shrink-0 lg:block">
          <div className="sticky top-[70px] h-[calc(100vh-70px)]">
            <WikiSidebar repo={repo.data} tree={tree.data ?? []} />
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-6 pb-[220px] pt-9 xl:px-12">
          <div className="mx-auto max-w-[820px]">
            {repo.data.status === 'READY' && (
              <RefreshCard repo={repo.data} onRefresh={(m) => refresh.mutate(m)} busy={refresh.isPending} />
            )}

            {page.data?.status === 'GENERATING' && (
              <div className="mb-6 flex items-center gap-2 text-[13.5px] text-muted">
                <Loader2 size={14} className="animate-spin" />
                Writing this page…
              </div>
            )}

            {page.data?.status === 'FAILED' && (
              <div className="mb-6 flex items-start gap-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2.5 text-[13px] text-danger">
                <AlertCircle size={15} className="mt-0.5 shrink-0" />
                <span>{page.data.error ?? 'Generation failed.'}</span>
              </div>
            )}

            {page.data?.scannedFiles?.length ? (
              <RelevantSources paths={page.data.scannedFiles} onOpen={(s) => setCodeTarget(s)} />
            ) : null}

            {page.data?.content ? (
              <Markdown
                content={page.data.content}
                onOpenSource={(s) => setCodeTarget(s)}
                verifiedPaths={verifiedPaths}
              />
            ) : (
              <PageSkeleton />
            )}
          </div>
        </main>

        <aside className="hidden w-[300px] shrink-0 px-6 pt-9 xl:block">
          <TocPanel headings={headings} />
        </aside>
      </div>

      {/* Floating composer, as in the reference UI. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-4 pb-5">
        <div className="pointer-events-auto mx-auto max-w-[1060px]">
          <ChatBar
            placeholder={`Ask about ${repo.data.name}`}
            presets={presets.data ?? []}
            presetKey={presetKey}
            onPresetChange={setPresetKey}
            onSubmit={(q) => ask.mutate(q)}
            busy={ask.isPending}
            floating
          />
        </div>
      </div>

      {codeTarget && (
        <div className="fixed inset-y-0 right-0 z-40 w-full max-w-[720px] p-4 pt-[86px]">
          <CodeViewer
            repoSlug={slug}
            repoName={repo.data.name}
            target={codeTarget}
            onClose={() => setCodeTarget(null)}
          />
        </div>
      )}
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="space-y-3">
      <div className="skeleton h-8 w-1/3" />
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="skeleton h-4" style={{ width: `${55 + ((i * 17) % 42)}%` }} />
      ))}
    </div>
  );
}

function NotFound({ slug }: { slug: string }) {
  return (
    <div className="min-h-full">
      <TopBar />
      <div className="mx-auto max-w-lg px-6 py-24 text-center">
        <PencilLine className="mx-auto mb-4 text-faint" />
        <h1 className="text-[22px] font-semibold">No wiki for “{slug}”</h1>
        <Link to="/" className="mt-4 inline-block text-[14px] text-accent underline underline-offset-4">
          Back to repositories
        </Link>
      </div>
    </div>
  );
}
