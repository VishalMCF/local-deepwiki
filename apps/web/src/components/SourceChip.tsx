import { AlertTriangle, FileCode2 } from 'lucide-react';
import clsx from 'clsx';
import { fileName, lineLabel } from '../lib/format';

export interface SourceRef {
  path: string;
  startLine?: number | null;
  endLine?: number | null;
  verified?: boolean;
}

/**
 * The `README.md 5-7` pill used under every section. Clicking opens the file in
 * the code viewer at the cited range.
 */
export function SourceChip({
  source,
  onOpen,
  compact,
}: {
  source: SourceRef;
  onOpen?: (source: SourceRef) => void;
  compact?: boolean;
}) {
  const lines = lineLabel(source.startLine, source.endLine);
  const unverified = source.verified === false;

  return (
    <button
      type="button"
      onClick={() => onOpen?.(source)}
      title={unverified ? `${source.path} — not opened by the agent while writing this` : source.path}
      className={clsx(
        'inline-flex max-w-full items-center gap-0 overflow-hidden rounded-md border border-line bg-elevated text-left align-middle transition hover:border-accent/60',
        compact ? 'text-[11.5px]' : 'text-[12.5px]',
      )}
    >
      <span className={clsx('flex items-center gap-1.5 truncate px-2', compact ? 'py-0.5' : 'py-1')}>
        {unverified ? (
          <AlertTriangle size={12} className="shrink-0 text-danger" />
        ) : (
          <FileCode2 size={12} className="shrink-0 text-faint" />
        )}
        <span className="truncate font-mono">{compact ? fileName(source.path) : source.path}</span>
      </span>
      {lines && (
        <span
          className={clsx(
            'shrink-0 border-l border-line bg-surface px-1.5 font-mono text-faint',
            compact ? 'py-0.5' : 'py-1',
          )}
        >
          {lines}
        </span>
      )}
    </button>
  );
}

export function SourceRow({
  sources,
  onOpen,
  label = 'Sources:',
}: {
  sources: SourceRef[];
  onOpen?: (source: SourceRef) => void;
  label?: string;
}) {
  if (!sources.length) return null;
  return (
    <div className="my-4 flex flex-wrap items-center gap-2">
      <span className="text-[13px] text-muted">{label}</span>
      {sources.map((s, i) => (
        <SourceChip key={`${s.path}-${s.startLine}-${i}`} source={s} onOpen={onOpen} />
      ))}
    </div>
  );
}
