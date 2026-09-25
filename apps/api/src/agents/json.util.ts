/**
 * Agents are told to end their output with a fenced ```json block. Native
 * --json-schema / --output-schema flags differ per CLI (and Claude Code has
 * none), so a fence is the only universal contract. These helpers recover it
 * even when the model wraps it in prose or emits slightly malformed output.
 */

/** Pull the last fenced ```json block, else the last balanced {...} object. */
export function extractJson<T = any>(text: string): T | null {
  if (!text) return null;

  const fences = [...text.matchAll(/```(?:json|jsonc)?\s*\n([\s\S]*?)```/g)];
  for (let i = fences.length - 1; i >= 0; i--) {
    const parsed = tryParse<T>(fences[i][1]);
    if (parsed !== null) return parsed;
  }

  // Fall back to scanning for a balanced object from each '{'.
  for (let i = text.indexOf('{'); i !== -1; i = text.indexOf('{', i + 1)) {
    const slice = balancedSlice(text, i);
    if (!slice) continue;
    const parsed = tryParse<T>(slice);
    if (parsed !== null) return parsed;
  }
  return null;
}

/** Strip the trailing ```json block so it never renders as page content. */
export function stripTrailingJsonFence(text: string): string {
  return text.replace(/\n?```(?:json|jsonc)?\s*\n[\s\S]*?```\s*$/, '').trimEnd();
}

function tryParse<T>(raw: string): T | null {
  const candidates = [raw, raw.trim(), repairTrailingCommas(raw)];
  for (const c of candidates) {
    try {
      return JSON.parse(c) as T;
    } catch {
      /* next */
    }
  }
  return null;
}

function repairTrailingCommas(raw: string): string {
  return raw.replace(/,\s*([}\]])/g, '$1');
}

function balancedSlice(text: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') inString = !inString;
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}
