export function relativeTime(iso?: string | null): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function indexedLabel(iso?: string | null, sha?: string | null): string {
  if (!iso) return 'Not indexed yet';
  const date = new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return sha ? `Last indexed: ${date} (${sha})` : `Last indexed: ${date}`;
}

export function fileName(path: string): string {
  return path.split('/').pop() ?? path;
}

export function lineLabel(start?: number | null, end?: number | null): string | null {
  if (!start) return null;
  if (!end || end === start) return String(start);
  return `${start}–${end}`;
}
