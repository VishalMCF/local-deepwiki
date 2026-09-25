import { ChevronRight } from 'lucide-react';
import type { ScanEntry } from '../lib/sse';
import { fileName } from '../lib/format';

/**
 * Right-hand pane while an answer is being produced: every file the agent opens
 * appears here in real time, which is what makes the retrieval legible.
 */
export function ScanningPanel({ entries, done }: { entries: ScanEntry[]; done?: boolean }) {
  if (!entries.length) {
    return (
      <div className="rounded-xl border border-line bg-surface p-4">
        <div className="space-y-2.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="skeleton h-3.5" style={{ width: `${30 + ((i * 17) % 45)}%` }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-line bg-surface">
      {entries.map((entry, i) => (
        <div
          key={`${entry.path}-${i}`}
          className="fade-up flex items-center gap-2 border-b border-line-soft px-4 py-2.5 text-[14px] last:border-b-0"
        >
          <ChevronRight size={14} className="shrink-0 text-faint" />
          <span className="truncate text-muted">
            {done ? 'Read' : 'Scanning'} {fileName(entry.path)}
          </span>
          {entry.detail && entry.detail !== entry.path && (
            <span className="ml-auto truncate font-mono text-[11.5px] text-faint">{entry.detail}</span>
          )}
          <span className="ml-auto h-px flex-1 bg-line-soft" />
        </div>
      ))}
    </div>
  );
}
