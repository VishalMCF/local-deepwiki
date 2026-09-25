import type { FileContent, Job, PageNode, Preset, Repo, Thread, WikiPage } from './types';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `${res.status} ${res.statusText}`);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export const api = {
  listRepos: () => request<Repo[]>('/api/repos'),
  getRepo: (slug: string) => request<Repo>(`/api/repos/${slug}`),
  addRepo: (path: string, presetKey?: string) =>
    request<Repo>('/api/repos', { method: 'POST', body: JSON.stringify({ path, presetKey }) }),
  deleteRepo: (id: string) => request<{ ok: true }>(`/api/repos/${id}`, { method: 'DELETE' }),
  refreshRepo: (id: string, mode: 'full' | 'refresh' = 'refresh', presetKey?: string) =>
    request<{ ok: true }>(`/api/repos/${id}/refresh`, {
      method: 'POST',
      body: JSON.stringify({ mode, presetKey }),
    }),
  cancelIndex: (id: string) => request<{ ok: true }>(`/api/repos/${id}/cancel`, { method: 'POST' }),

  wikiTree: (slug: string) => request<PageNode[]>(`/api/repos/${slug}/wiki/tree`),
  wikiPage: (slug: string, pageSlug: string) =>
    request<WikiPage>(`/api/repos/${slug}/wiki/pages/${pageSlug}`),
  jobs: (slug: string) => request<Job[]>(`/api/repos/${slug}/wiki/jobs`),

  file: (slug: string, path: string) =>
    request<FileContent>(`/api/repos/${slug}/file?path=${encodeURIComponent(path)}`),

  presets: () => request<Preset[]>('/api/presets'),

  threads: (slug: string) => request<Thread[]>(`/api/repos/${slug}/threads`),
  thread: (id: string) => request<Thread>(`/api/threads/${id}`),
  deleteThread: (id: string) => request<{ ok: true }>(`/api/threads/${id}`, { method: 'DELETE' }),
  ask: (slug: string, question: string, presetKey?: string) =>
    request<{ threadId: string; messageId: string }>(`/api/repos/${slug}/threads`, {
      method: 'POST',
      body: JSON.stringify({ question, presetKey }),
    }),
  followUp: (threadId: string, question: string, presetKey?: string) =>
    request<{ threadId: string; messageId: string }>(`/api/threads/${threadId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ question, presetKey }),
    }),
};
