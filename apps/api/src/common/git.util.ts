import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

export interface GitInfo {
  isRepo: boolean;
  sha?: string;
  shortSha?: string;
  branch?: string;
  remote?: string;
}

export async function readGitInfo(cwd: string): Promise<GitInfo> {
  const run = async (args: string[]) => {
    try {
      const { stdout } = await exec('git', args, { cwd, timeout: 10_000 });
      return stdout.trim();
    } catch {
      return '';
    }
  };

  const inside = await run(['rev-parse', '--is-inside-work-tree']);
  if (inside !== 'true') return { isRepo: false };

  const sha = await run(['rev-parse', 'HEAD']);
  return {
    isRepo: true,
    sha: sha || undefined,
    shortSha: sha ? sha.slice(0, 7) : undefined,
    branch: (await run(['rev-parse', '--abbrev-ref', 'HEAD'])) || undefined,
    remote: (await run(['config', '--get', 'remote.origin.url'])) || undefined,
  };
}

/** Files changed between two commits, used to decide which wiki pages are stale. */
export async function changedFiles(cwd: string, fromSha: string, toSha = 'HEAD'): Promise<string[]> {
  try {
    const { stdout } = await exec('git', ['diff', '--name-only', `${fromSha}..${toSha}`], {
      cwd,
      timeout: 20_000,
      maxBuffer: 10 * 1024 * 1024,
    });
    return stdout.split('\n').map((l) => l.trim()).filter(Boolean);
  } catch {
    return [];
  }
}
