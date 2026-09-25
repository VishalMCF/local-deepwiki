/**
 * Agents sometimes prefix an answer with a line about their own process
 * ("Now I have a complete picture of the imports."). The prompt forbids it; this
 * is the safety net. Only a single leading line is ever removed, and only when
 * it matches a narration opener and is followed by real content.
 */
const NARRATION =
  /^(?:now\s+i|i\s+(?:now\s+)?have|i've|i\s+have\s+now|let\s+me|based\s+on\s+(?:my|the)\s+(?:review|reading|analysis)|having\s+(?:read|reviewed)|after\s+(?:reading|reviewing)|here'?s\s+(?:what|the\s+answer)|ok(?:ay)?[,.]|alright[,.]|got\s+it[,.])\b/i;

export function cleanAnswer(text: string): string {
  const trimmed = text.trim();
  const lines = trimmed.split('\n');
  const first = lines[0].trim();

  // Never touch a heading, list item, table, code fence or citation line.
  if (/^(?:[#>\-*|`]|\d+[.)])/.test(first)) return trimmed;
  if (!NARRATION.test(first)) return trimmed;

  const rest = lines.slice(1).join('\n').trim();
  return rest || trimmed;
}
