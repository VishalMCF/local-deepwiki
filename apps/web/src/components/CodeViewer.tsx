import clsx from 'clsx';
import { Check, Copy, FileCode2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { codeToTokens, type ThemedToken } from 'shiki';
import { api } from '../lib/api';
import { useTheme } from '../lib/theme';
import type { FileContent } from '../lib/types';

export interface CodeTarget {
  path: string;
  startLine?: number | null;
  endLine?: number | null;
}

/** Right-hand pane: the cited file, syntax highlighted, scrolled to the range. */
export function CodeViewer({
  repoSlug,
  repoName,
  target,
  onClose,
}: {
  repoSlug: string;
  repoName: string;
  target: CodeTarget;
  onClose?: () => void;
}) {
  const { theme } = useTheme();
  const [file, setFile] = useState<FileContent | null>(null);
  const [lines, setLines] = useState<ThemedToken[][] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setFile(null);
    setLines(null);
    setError(null);

    api
      .file(repoSlug, target.path)
      .then(async (f) => {
        if (cancelled) return;
        setFile(f);
        try {
          const { tokens } = await codeToTokens(f.content, {
            lang: f.language as any,
            theme: theme === 'dark' ? 'github-dark-default' : 'github-light',
          });
          if (!cancelled) setLines(tokens);
        } catch {
          if (!cancelled) setLines(null); // fall back to plain text
        }
      })
      .catch((err) => !cancelled && setError(err.message));

    return () => {
      cancelled = true;
    };
  }, [repoSlug, target.path, theme]);

  // Scroll the cited range into view once the file renders.
  useEffect(() => {
    if (!file || !target.startLine) return;
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-line="${target.startLine}"]`);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [file, lines, target.startLine]);

  const plainLines = useMemo(() => file?.content.split('\n') ?? [], [file]);
  const inRange = (n: number) =>
    target.startLine ? n >= target.startLine && n <= (target.endLine ?? target.startLine) : false;

  const copy = () => {
    if (!file) return;
    navigator.clipboard?.writeText(file.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-line bg-elevated">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-3 text-[13px]">
        <FileCode2 size={14} className="shrink-0 text-faint" />
        <span className="truncate text-muted">{repoName}</span>
        <span className="truncate font-mono font-medium">{target.path}</span>
        {target.startLine && (
          <span className="shrink-0 rounded bg-surface px-1.5 py-0.5 font-mono text-[11px] text-faint">
            {target.startLine}
            {target.endLine && target.endLine !== target.startLine ? `–${target.endLine}` : ''}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <button onClick={copy} aria-label="Copy file" className="grid size-7 place-items-center rounded text-faint hover:text-fg">
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
          {onClose && (
            <button onClick={onClose} aria-label="Close" className="grid size-7 place-items-center rounded text-faint hover:text-fg">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto font-mono text-[12.5px] leading-[1.6]">
        {error && <div className="p-4 text-danger">{error}</div>}
        {!file && !error && (
          <div className="space-y-2 p-4">
            {Array.from({ length: 14 }).map((_, i) => (
              <div key={i} className="skeleton h-3" style={{ width: `${45 + ((i * 13) % 50)}%` }} />
            ))}
          </div>
        )}
        {file && (
          <table className="w-full border-separate border-spacing-0">
            <tbody>
              {(lines ?? plainLines).map((line, i) => {
                const n = i + 1;
                const highlighted = inRange(n);
                return (
                  <tr key={n} data-line={n} className={clsx(highlighted && 'bg-accent/10')}>
                    <td
                      className={clsx(
                        'w-[1%] select-none whitespace-nowrap border-r border-line px-3 text-right align-top text-faint',
                        highlighted && 'border-r-accent/50 text-accent',
                      )}
                    >
                      {n}
                    </td>
                    <td className="whitespace-pre px-3 align-top">
                      {Array.isArray(line)
                        ? (line as ThemedToken[]).map((token, ti) => (
                            <span key={ti} style={{ color: token.color }}>
                              {token.content}
                            </span>
                          ))
                        : (line as string)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
