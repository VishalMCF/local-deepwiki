import { Loader2, RefreshCw, X } from 'lucide-react';
import { useState } from 'react';
import type { Repo } from '../lib/types';

/**
 * The "Refresh this wiki" card. Appears when the checkout has moved past the
 * commit the wiki was generated from.
 */
export function RefreshCard({
  repo,
  onRefresh,
  busy,
}: {
  repo: Repo;
  onRefresh: (mode: 'refresh' | 'full') => void;
  busy?: boolean;
}) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed || repo.status === 'INDEXING') return null;

  const stale = repo.stale;

  return (
    <div className="mb-8 rounded-xl border border-line bg-surface p-4">
      <div className="flex items-start">
        <h3 className="text-[15px] font-semibold">
          {stale ? 'This wiki is out of date' : 'Refresh this wiki'}
        </h3>
        <button
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          className="ml-auto text-faint hover:text-fg"
        >
          <X size={15} />
        </button>
      </div>

      <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
        {stale
          ? `Indexed at ${repo.indexedShortSha}; HEAD is now ${repo.shortSha}. Only pages whose sources changed are regenerated.`
          : 'Regenerate pages from the current working tree.'}
      </p>

      <div className="mt-3 flex gap-2">
        <button
          onClick={() => onRefresh('refresh')}
          disabled={busy}
          className="flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-[13px] font-medium text-accent-fg transition hover:opacity-90 disabled:opacity-50"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          Refresh changed pages
        </button>
        <button
          onClick={() => onRefresh('full')}
          disabled={busy}
          className="rounded-lg border border-line px-3 py-2 text-[13px] text-muted transition hover:text-fg disabled:opacity-50"
        >
          Rebuild all
        </button>
      </div>
    </div>
  );
}
