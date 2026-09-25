import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useMemo, type ReactNode } from 'react';
import { Mermaid } from './Mermaid';
import { SourceChip, SourceRow, type SourceRef } from './SourceChip';

const REF = /^([A-Za-z0-9_\-./]+\.[A-Za-z0-9]{1,10}):(\d+)(?:\s*[-–]\s*(\d+))?$/;

export function headingId(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

export interface Heading {
  depth: number;
  text: string;
  id: string;
}

/** Headings for the "On this page" rail, read straight from the markdown. */
export function extractHeadings(markdown?: string | null): Heading[] {
  if (!markdown) return [];
  const out: Heading[] = [];
  let inFence = false;

  for (const line of markdown.split('\n')) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = /^(#{1,3})\s+(.*)$/.exec(line);
    if (!m) continue;
    const text = m[2].replace(/[*_`]/g, '').trim();
    if (!text) continue;
    out.push({ depth: m[1].length, text, id: headingId(text) });
  }
  return out;
}

/** Flatten a react-markdown children tree back into plain text. */
function toText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(toText).join('');
  const el = node as any;
  if (el?.props?.children !== undefined) return toText(el.props.children);
  return '';
}

function parseSourcesLine(text: string): SourceRef[] | null {
  const m = /^\s*Sources?:\s*(.+)$/i.exec(text);
  if (!m) return null;
  const refs: SourceRef[] = [];
  for (const part of m[1].split(/[,;]/)) {
    const token = part.trim().replace(/^`|`$/g, '');
    if (!token) continue;
    const ref = REF.exec(token);
    if (ref) {
      refs.push({ path: ref[1], startLine: Number(ref[2]), endLine: ref[3] ? Number(ref[3]) : Number(ref[2]) });
    } else if (/[./]/.test(token) && token.length > 2) {
      refs.push({ path: token });
    }
  }
  return refs.length ? refs : null;
}

export function Markdown({
  content,
  onOpenSource,
  verifiedPaths,
}: {
  content: string;
  onOpenSource?: (source: SourceRef) => void;
  /** Paths the agent actually read; anything else renders with a warning icon. */
  verifiedPaths?: Set<string>;
}) {
  const isVerified = useMemo(
    () => (path: string) =>
      verifiedPaths ? [...verifiedPaths].some((p) => p === path || p.endsWith(`/${path}`) || path.endsWith(p)) : true,
    [verifiedPaths],
  );

  return (
    <div className="prose-wiki">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h1 id={headingId(toText(children))}>{children}</h1>,
          h2: ({ children }) => <h2 id={headingId(toText(children))}>{children}</h2>,
          h3: ({ children }) => <h3 id={headingId(toText(children))}>{children}</h3>,

          // A "Sources: a.go:1-2, b.go:5" paragraph becomes a row of chips.
          p: ({ children }) => {
            const sources = parseSourcesLine(toText(children));
            if (sources) {
              return (
                <SourceRow
                  sources={sources.map((s) => ({ ...s, verified: isVerified(s.path) }))}
                  onOpen={onOpenSource}
                />
              );
            }
            return <p>{children}</p>;
          },

          code: ({ className, children, ...props }) => {
            const text = String(children ?? '').replace(/\n$/, '');
            const lang = /language-(\w+)/.exec(className ?? '')?.[1];

            if (lang === 'mermaid') return <Mermaid chart={text} />;

            // Inline `src/server.go:264-326` becomes a clickable citation.
            if (!className) {
              const ref = REF.exec(text.trim());
              if (ref) {
                const source: SourceRef = {
                  path: ref[1],
                  startLine: Number(ref[2]),
                  endLine: ref[3] ? Number(ref[3]) : Number(ref[2]),
                  verified: isVerified(ref[1]),
                };
                return <SourceChip source={source} onOpen={onOpenSource} compact />;
              }
              return <code {...props}>{children}</code>;
            }
            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },

          a: ({ href, children }) => {
            const external = href?.startsWith('http');
            return (
              <a href={href} {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}>
                {children}
              </a>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
