import { useEffect, useRef, useState } from 'react';
import type { Citation } from './types';

export interface ScanEntry {
  path: string;
  tool?: string;
  detail?: string;
}

export interface AnswerStream {
  scanned: ScanEntry[];
  text: string;
  citations: Citation[];
  done: boolean;
  error?: string;
}

const EMPTY: AnswerStream = { scanned: [], text: '', citations: [], done: false };

/** Live answer for one assistant message: scanning list, streamed text, result. */
export function useAnswerStream(messageId?: string | null): AnswerStream {
  const [state, setState] = useState<AnswerStream>(EMPTY);
  const seen = useRef(new Set<string>());

  useEffect(() => {
    if (!messageId) {
      setState(EMPTY);
      return;
    }
    seen.current = new Set();
    setState(EMPTY);

    const source = new EventSource(`/api/messages/${messageId}/stream`);

    source.onmessage = (event) => {
      let msg: any;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }

      setState((prev) => {
        switch (msg.type) {
          case 'tool': {
            if (!msg.path && !msg.detail) return prev;
            const key = `${msg.path ?? ''}|${msg.detail ?? ''}`;
            if (seen.current.has(key)) return prev;
            seen.current.add(key);
            return {
              ...prev,
              scanned: [...prev.scanned, { path: msg.path ?? msg.detail, tool: msg.tool, detail: msg.detail }],
            };
          }
          case 'text':
            return { ...prev, text: prev.text + (msg.text ?? '') };
          case 'done':
            return {
              ...prev,
              text: msg.content ?? prev.text,
              citations: msg.citations ?? [],
              done: true,
            };
          case 'error':
            return { ...prev, error: msg.message ?? 'Agent failed', done: true };
          default:
            return prev;
        }
      });

      if (msg.type === 'done' || msg.type === 'error') source.close();
    };

    source.onerror = () => {
      // EventSource retries on its own; only give up once the run finished.
      setState((prev) => (prev.done ? prev : prev));
    };

    return () => source.close();
  }, [messageId]);

  return state;
}

export interface IndexProgress {
  status?: string;
  done: number;
  total: number;
  current: string[];
  pages: { pageId: string; title: string; status: string }[];
  logs: string[];
  finished: boolean;
  error?: string;
}

const EMPTY_PROGRESS: IndexProgress = {
  done: 0,
  total: 0,
  current: [],
  pages: [],
  logs: [],
  finished: false,
};

/** Live indexing progress for a repo (status, outline, page, scanning, progress). */
export function useIndexProgress(repoId?: string | null, active = true): IndexProgress {
  const [state, setState] = useState<IndexProgress>(EMPTY_PROGRESS);

  useEffect(() => {
    if (!repoId || !active) return;
    setState(EMPTY_PROGRESS);
    const source = new EventSource(`/api/repos/${repoId}/events`);

    source.onmessage = (event) => {
      let msg: any;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }

      setState((prev) => {
        switch (msg.type) {
          case 'status':
            return { ...prev, status: msg.status, error: msg.error, finished: msg.status === 'READY' };
          case 'scanning':
            return { ...prev, current: [msg.path, ...prev.current.filter((p) => p !== msg.path)].slice(0, 8) };
          case 'progress':
            return { ...prev, done: msg.done, total: msg.total };
          case 'page': {
            const others = prev.pages.filter((p) => p.pageId !== msg.pageId);
            return { ...prev, pages: [...others, { pageId: msg.pageId, title: msg.title, status: msg.status }] };
          }
          case 'outline':
            return { ...prev, total: msg.count ?? prev.total };
          case 'log':
            return { ...prev, logs: [...prev.logs, msg.message].slice(-20) };
          case 'done':
            return { ...prev, finished: true };
          default:
            return prev;
        }
      });

      if (msg.type === 'done') source.close();
    };

    return () => source.close();
  }, [repoId, active]);

  return state;
}
