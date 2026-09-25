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

/**
 * Two shapes of reference:
 *  - with line numbers, any token is a path (catches extensionless files such
 *    as `volume`, `Dockerfile`, `Makefile`): `volume:42-60`
 *  - without line numbers, the token must look like a path (have an extension
 *    or a slash), or prose would match.
 */
const REF_WITH_LINES = /([A-Za-z0-9_\-./]+):(\d+)(?:\s*[-–]\s*(\d+))?/g;
const REF_BARE = /([A-Za-z0-9_\-./]+\.[A-Za-z0-9]{1,10}|[A-Za-z0-9_\-./]*\/[A-Za-z0-9_\-.]+)/g;

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
  const consumed: [number, number][] = [];

  for (const m of segment.matchAll(REF_WITH_LINES)) {
    const path = normalizePath(m[1]);
    if (!path || isNoise(path)) continue;
    consumed.push([m.index!, m.index! + m[0].length]);
    out.push({
      path,
      startLine: Number(m[2]),
      endLine: m[3] ? Number(m[3]) : Number(m[2]),
    });
  }

  for (const m of segment.matchAll(REF_BARE)) {
    const start = m.index!;
    // Skip tokens already captured as part of a path:line reference.
    if (consumed.some(([from, to]) => start >= from && start < to)) continue;
    const path = normalizePath(m[1]);
    if (!path || isNoise(path)) continue;
    out.push({ path });
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
 * Cross-check cited paths against what the agent actually opened. A citation the
 * agent never touched is suspect (hallucinated path) and is stored with
 * verified=false so the UI can mark it.
 *
 * A Grep or Glob reports the directory it searched rather than each file it
 * matched, so a scanned directory counts as covering the files beneath it —
 * otherwise a perfectly sound answer built from one `grep -r src/` would have
 * every citation flagged.
 */
export function verifyCitations(
  citations: ParsedCitation[],
  scannedFiles: string[],
): (ParsedCitation & { verified: boolean })[] {
  const scanned = scannedFiles.map((f) => normalizePath(f));
  return citations.map((c) => ({ ...c, verified: covers(scanned, c.path) }));
}

function covers(scanned: string[], path: string): boolean {
  return scanned.some((s) => {
    if (!s) return false;
    if (s === path) return true;
    // Same file reached by a longer or shorter prefix.
    if (s.endsWith(`/${path}`) || path.endsWith(`/${s}`)) return true;
    // A searched directory covers everything under it.
    if (!s.includes('.') && path.startsWith(`${s}/`)) return true;
    return false;
  });
}
