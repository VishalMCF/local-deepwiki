import clsx from 'clsx';
import { AlertCircle, ArrowRight, FileCode2, GitBranch, Loader2, Plus, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { relativeTime } from '../lib/format';
import type { Repo } from '../lib/types';

export function RepoCard({ repo, onDelete }: { repo: Repo; onDelete: (repo: Repo) => void }) {
  const busy = repo.status === 'INDEXING' || repo.status === 'PENDING';

  return (
    <Link
      to={`/repo/${repo.slug}`}
      className="group relative flex h-[188px] flex-col rounded-xl border border-line bg-surface p-5 transition hover:border-faint"
    >
      <div className="flex items-start gap-2">
        <h3 className="truncate text-[19px] font-medium tracking-tight">{repo.name}</h3>
        <button
          onClick={(e) => {
            e.preventDefault();
            onDelete(repo);
          }}
          aria-label={`Remove ${repo.name}`}
          className="ml-auto grid size-7 shrink-0 place-items-center rounded-md text-faint opacity-0 transition hover:bg-elevated hover:text-danger group-hover:opacity-100"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <p className="mt-2 line-clamp-2 text-[14px] leading-relaxed text-muted">
        {repo.description ?? repo.path}
      </p>

      <div className="mt-auto flex items-center gap-3 text-[13px] text-faint">
        {busy ? (
          <span className="flex items-center gap-1.5 text-muted">
            <Loader2 size={13} className="animate-spin" />
            Indexing {repo.pageCount ? `${repo.readyCount}/${repo.pageCount}` : ''}
          </span>
        ) : repo.status === 'FAILED' ? (
          <span className="flex items-center gap-1.5 text-danger">
            <AlertCircle size={13} />
            Failed
          </span>
        ) : (
          <>
            {repo.language && <span>{repo.language}</span>}
            {repo.fileCount != null && (
              <span className="flex items-center gap-1">
                <FileCode2 size={13} />
                {repo.fileCount}
              </span>
            )}
            {repo.gitBranch && (
              <span className="flex items-center gap-1 truncate">
                <GitBranch size={13} />
                {repo.gitBranch}
              </span>
            )}
          </>
        )}

        <span
          className={clsx(
            'ml-auto grid size-9 place-items-center rounded-full border border-line transition',
            'group-hover:border-fg group-hover:bg-fg group-hover:text-canvas',
          )}
        >
          <ArrowRight size={16} />
        </span>
      </div>

      {repo.stale && repo.status === 'READY' && (
        <span className="absolute right-14 top-5 rounded-full border border-line bg-elevated px-2 py-0.5 text-[11px] text-muted">
          stale
        </span>
      )}
      {repo.indexedAt && !busy && (
        <span className="absolute left-5 top-[52px] hidden">{relativeTime(repo.indexedAt)}</span>
      )}
    </Link>
  );
}

export function AddRepoCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group flex h-[188px] flex-col rounded-xl border border-line bg-gradient-to-br from-accent/15 via-surface to-surface p-5 text-left transition hover:border-accent/60"
    >
      <Plus size={22} className="text-muted" />
      <span className="mt-3 text-[19px] font-medium tracking-tight">Add repo</span>
      <span className="mt-1 text-[13.5px] text-muted">Import a local directory</span>
      <span className="ml-auto mt-auto grid size-9 place-items-center rounded-full border border-line transition group-hover:border-fg group-hover:bg-fg group-hover:text-canvas">
        <ArrowRight size={16} />
      </span>
    </button>
  );
}
