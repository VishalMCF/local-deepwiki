import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import type { IndexProgress } from '../lib/sse';
import { fileName } from '../lib/format';

/** Shown while a repo's wiki is being generated for the first time. */
export function IndexingOverlay({ repoName, progress }: { repoName: string; progress: IndexProgress }) {
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="mx-auto max-w-2xl px-6 py-20">
      <div className="flex items-center gap-3">
        <Loader2 size={20} className="animate-spin text-muted" />
        <h1 className="text-[24px] font-semibold tracking-tight">Generating wiki for {repoName}</h1>
      </div>

      <p className="mt-2 text-[14px] text-muted">
        {progress.total
          ? `Writing pages — ${progress.done} of ${progress.total} done.`
          : 'Planning the outline: the agent is reading the repository.'}
      </p>

      {progress.total > 0 && (
        <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-elevated">
          <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
      )}

      {progress.current.length > 0 && (
        <div className="mt-7 rounded-xl border border-line bg-surface">
          {progress.current.map((path) => (
            <div key={path} className="fade-up border-b border-line-soft px-4 py-2.5 text-[13.5px] text-muted last:border-b-0">
              Scanning {fileName(path)}
            </div>
          ))}
        </div>
      )}

      {progress.pages.length > 0 && (
        <ul className="mt-6 space-y-1.5">
          {progress.pages.map((page) => (
            <li key={page.pageId} className="flex items-center gap-2 text-[13.5px]">
              {page.status === 'READY' && <CheckCircle2 size={14} className="text-success" />}
              {page.status === 'FAILED' && <XCircle size={14} className="text-danger" />}
              {page.status === 'GENERATING' && <Loader2 size={14} className="animate-spin text-faint" />}
              <span className={page.status === 'READY' ? 'text-fg' : 'text-muted'}>{page.title}</span>
            </li>
          ))}
        </ul>
      )}

      {progress.logs.map((log, i) => (
        <p key={i} className="mt-3 text-[12.5px] text-faint">
          {log}
        </p>
      ))}

      {progress.error && (
        <p className="mt-6 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-[13px] text-danger">
          {progress.error}
        </p>
      )}
    </div>
  );
}
