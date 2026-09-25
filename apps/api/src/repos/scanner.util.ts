import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, extname, join, relative } from 'node:path';

const IGNORED_DIRS = new Set([
  '.git', 'node_modules', 'dist', 'build', 'out', 'target', 'vendor', '.next', '.nuxt',
  '.venv', 'venv', '__pycache__', '.pytest_cache', 'coverage', '.turbo', '.cache',
  '.idea', '.vscode', 'Pods', 'DerivedData', '.gradle', 'bin', 'obj',
]);

const LANG_BY_EXT: Record<string, string> = {
  '.ts': 'TypeScript', '.tsx': 'TypeScript', '.js': 'JavaScript', '.jsx': 'JavaScript',
  '.mjs': 'JavaScript', '.cjs': 'JavaScript', '.go': 'Go', '.py': 'Python', '.rb': 'Ruby',
  '.rs': 'Rust', '.java': 'Java', '.kt': 'Kotlin', '.swift': 'Swift', '.c': 'C', '.h': 'C',
  '.cc': 'C++', '.cpp': 'C++', '.hpp': 'C++', '.cs': 'C#', '.php': 'PHP', '.scala': 'Scala',
  '.ex': 'Elixir', '.exs': 'Elixir', '.dart': 'Dart', '.sh': 'Shell', '.sql': 'SQL',
  '.vue': 'Vue', '.svelte': 'Svelte', '.m': 'Objective-C', '.zig': 'Zig', '.lua': 'Lua',
};

const ENTRYPOINT_NAMES = [
  'main.go', 'main.py', 'main.rs', 'main.ts', 'main.js', 'index.ts', 'index.js',
  'app.ts', 'app.py', 'server.go', 'server.ts', 'cmd', 'src/main.rs', '__main__.py',
];

const MANIFESTS = [
  'package.json', 'go.mod', 'Cargo.toml', 'pyproject.toml', 'requirements.txt',
  'pom.xml', 'build.gradle', 'Gemfile', 'composer.json', 'Makefile', 'Dockerfile',
];

export interface RepoScan {
  fileCount: number;
  languages: string[];
  primaryLanguage?: string;
  topLevel: string[];
  entrypoints: string[];
  manifests: string[];
  readmeExcerpt?: string;
}

/**
 * Cheap deterministic pre-pass: gives the outline agent a map of the repo so it
 * spends its budget reading code rather than rediscovering the directory tree.
 */
export async function scanRepo(root: string, maxFiles = 20_000): Promise<RepoScan> {
  const extCounts = new Map<string, number>();
  const entrypoints: string[] = [];
  const manifests: string[] = [];
  let fileCount = 0;

  async function walk(dir: string, depth: number) {
    if (fileCount >= maxFiles || depth > 12) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.github') continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        await walk(full, depth + 1);
      } else if (entry.isFile()) {
        fileCount++;
        const rel = relative(root, full);
        const ext = extname(entry.name).toLowerCase();
        if (LANG_BY_EXT[ext]) extCounts.set(ext, (extCounts.get(ext) ?? 0) + 1);
        if (ENTRYPOINT_NAMES.includes(entry.name) && entrypoints.length < 12) entrypoints.push(rel);
        if (MANIFESTS.includes(entry.name) && manifests.length < 12) manifests.push(rel);
      }
    }
  }

  await walk(root, 0);

  const byCount = [...extCounts.entries()].sort((a, b) => b[1] - a[1]);
  const languages: string[] = [];
  for (const [ext] of byCount) {
    const lang = LANG_BY_EXT[ext];
    if (lang && !languages.includes(lang)) languages.push(lang);
    if (languages.length >= 5) break;
  }

  const topLevel = await readTopLevel(root);
  const readmeExcerpt = await readReadme(root);

  return {
    fileCount,
    languages,
    primaryLanguage: languages[0],
    topLevel,
    entrypoints,
    manifests,
    readmeExcerpt,
  };
}

async function readTopLevel(root: string): Promise<string[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    return entries
      .filter((e) => !e.name.startsWith('.') && !IGNORED_DIRS.has(e.name))
      .slice(0, 40)
      .map((e) => (e.isDirectory() ? `${e.name}/` : e.name));
  } catch {
    return [];
  }
}

async function readReadme(root: string): Promise<string | undefined> {
  for (const name of ['README.md', 'readme.md', 'README.rst', 'README.txt', 'README']) {
    try {
      const text = await readFile(join(root, name), 'utf8');
      return text.slice(0, 2500);
    } catch {
      /* next */
    }
  }
  return undefined;
}

/** Validate a user-supplied directory path before importing it. */
export async function validateRepoPath(path: string): Promise<{ ok: boolean; reason?: string }> {
  try {
    const st = await stat(path);
    if (!st.isDirectory()) return { ok: false, reason: 'Path is not a directory' };
    return { ok: true };
  } catch (err: any) {
    if (err?.code === 'ENOENT') return { ok: false, reason: 'Directory does not exist' };
    if (err?.code === 'EACCES') return { ok: false, reason: 'Permission denied' };
    return { ok: false, reason: err?.message ?? 'Cannot read directory' };
  }
}

export function repoNameFromPath(path: string): string {
  return basename(path.replace(/\/+$/, '')) || 'repo';
}
