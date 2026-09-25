export type RepoStatus = 'PENDING' | 'INDEXING' | 'READY' | 'FAILED';
export type PageStatus = 'PENDING' | 'GENERATING' | 'READY' | 'FAILED';

export interface Repo {
  id: string;
  slug: string;
  name: string;
  path: string;
  description?: string | null;
  language?: string | null;
  fileCount?: number | null;
  gitBranch?: string | null;
  gitRemote?: string | null;
  indexedAt?: string | null;
  indexedShortSha?: string | null;
  shortSha?: string | null;
  isGitRepo: boolean;
  stale: boolean;
  status: RepoStatus;
  error?: string | null;
  defaultPreset: string;
  pageCount: number;
  readyCount: number;
  threadCount: number;
  indexing: boolean;
}

export interface PageNode {
  id: string;
  slug: string;
  title: string;
  summary?: string;
  status: PageStatus;
  order: number;
  children: PageNode[];
}

export interface Citation {
  id: string;
  path: string;
  startLine?: number | null;
  endLine?: number | null;
  verified: boolean;
  order: number;
}

export interface WikiPage {
  id: string;
  slug: string;
  title: string;
  summary?: string | null;
  content?: string | null;
  status: PageStatus;
  error?: string | null;
  scannedFiles: string[];
  generatedAt?: string | null;
  citations: Citation[];
}

export interface Preset {
  key: string;
  label: string;
  cli: string;
  model?: string;
  effort?: string;
  hint?: string;
  available: boolean;
  isDefault: boolean;
}

export interface Message {
  id: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  status: 'PENDING' | 'STREAMING' | 'COMPLETE' | 'FAILED';
  presetKey?: string | null;
  scannedFiles: string[];
  error?: string | null;
  createdAt: string;
  citations: Citation[];
}

export interface Thread {
  id: string;
  repoId: string;
  title: string;
  presetKey: string;
  createdAt: string;
  updatedAt: string;
  repo?: { id: string; slug: string; name: string; path: string };
  messages: Message[];
  _count?: { messages: number };
}

export interface FileContent {
  path: string;
  language: string;
  size: number;
  lineCount: number;
  content: string;
}

export interface Job {
  id: string;
  kind: 'OUTLINE' | 'PAGE' | 'REFRESH';
  status: 'QUEUED' | 'RUNNING' | 'DONE' | 'FAILED' | 'CANCELLED';
  label?: string | null;
  error?: string | null;
  createdAt: string;
}
