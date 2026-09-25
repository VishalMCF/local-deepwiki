export interface ParsedCitation {
  path: string;
  startLine?: number;
  endLine?: number;
}

/**
 * Agents are instructed to end sections with a line like:
 *   Sources: src/server.go:264-326, README.md:5-7
 * and to write inline refs as `src/lib.go:33-47`. Both are harvested here so a
 * citation survives even when the model drifts from one convention.
 */
const SOURCES_LINE = /^[ \t]*Sources?:[ \t]*(.+)$/gim;
const REF = /([A-Za-z0-9_\-./]+\.[A-Za-z0-9]{1,10}|[A-Za-z0-9_\-./]*\/[A-Za-z0-9_\-.]+)(?::(\d+)(?:\s*[-–]\s*(\d+))?)?/g;

export function parseCitations(markdown: string): ParsedCitation[] {
  const found: ParsedCitation[] = [];

  for (const match of markdown.matchAll(SOURCES_LINE)) {
    collect(match[1], found);
  }
  // Inline backticked refs: `src/server.go:264-326`
  for (const match of markdown.matchAll(/`([^`\n]+:\d+(?:\s*[-–]\s*\d+)?)`/g)) {
    collect(match[1], found);
  }

  return dedupe(found);
}

function collect(segment: string, out: ParsedCitation[]) {
  for (const m of segment.matchAll(REF)) {
    const path = normalizePath(m[1]);
    if (!path || isNoise(path)) continue;
    out.push({
      path,
      startLine: m[2] ? Number(m[2]) : undefined,
      endLine: m[3] ? Number(m[3]) : m[2] ? Number(m[2]) : undefined,
    });
  }
}

function normalizePath(p: string): string {
  return p.replace(/^\.\//, '').replace(/^\/+/, '').trim();
}

/** Filter out things that look like paths but are prose ("e.g.", "vs.", URLs). */
function isNoise(p: string): boolean {
  if (p.length < 3) return true;
  if (/^https?:/.test(p)) return true;
  if (/^(e\.g|i\.e|etc|vs)\./i.test(p)) return true;
  return false;
}

function dedupe(items: ParsedCitation[]): ParsedCitation[] {
  const seen = new Map<string, ParsedCitation>();
  for (const c of items) {
    const key = `${c.path}:${c.startLine ?? ''}-${c.endLine ?? ''}`;
    if (!seen.has(key)) seen.set(key, c);
  }
  return [...seen.values()];
}

/**
 * Cross-check cited paths against the files the agent actually opened.
 * A citation the agent never read is suspect (hallucinated path), and is stored
 * with verified=false so the UI can mark it.
 */
export function verifyCitations(
  citations: ParsedCitation[],
  scannedFiles: string[],
): (ParsedCitation & { verified: boolean })[] {
  const scanned = scannedFiles.map((f) => normalizePath(f));
  return citations.map((c) => ({
    ...c,
    verified: scanned.some((s) => s === c.path || s.endsWith(`/${c.path}`) || c.path.endsWith(s)),
  }));
}
