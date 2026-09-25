import { spawn } from 'node:child_process';
import * as readline from 'node:readline';

export interface SpawnStreamOptions {
  cmd: string;
  args: string[];
  cwd: string;
  timeoutMs: number;
  signal?: AbortSignal;
  /** Text written to the child's stdin, then closed. */
  stdin?: string;
  env?: NodeJS.ProcessEnv;
}

export interface LineEvent {
  stream: 'stdout' | 'stderr';
  line: string;
}

export class AgentProcessError extends Error {
  constructor(message: string, readonly code?: number, readonly stderr?: string) {
    super(message);
    this.name = 'AgentProcessError';
  }
}

/**
 * Spawn a CLI and yield its output line by line. Applies a hard timeout and
 * honours an AbortSignal so an in-flight agent run dies with its HTTP request.
 */
export async function* spawnLines(opts: SpawnStreamOptions): AsyncGenerator<LineEvent> {
  const child = spawn(opts.cmd, opts.args, {
    cwd: opts.cwd,
    env: { ...process.env, ...opts.env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  if (opts.stdin !== undefined) {
    child.stdin.write(opts.stdin);
  }
  child.stdin.end();

  const stderrChunks: string[] = [];
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (d: string) => {
    stderrChunks.push(d);
    if (stderrChunks.length > 400) stderrChunks.shift();
  });

  const timer = setTimeout(() => child.kill('SIGKILL'), opts.timeoutMs);
  const onAbort = () => child.kill('SIGKILL');
  opts.signal?.addEventListener('abort', onAbort, { once: true });

  const exited = new Promise<number>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => resolve(code ?? 0));
  });

  const rl = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });

  try {
    for await (const line of rl) {
      if (line.trim()) yield { stream: 'stdout', line };
    }
    const code = await exited;
    if (code !== 0) {
      const stderr = stderrChunks.join('').trim();
      throw new AgentProcessError(
        `${opts.cmd} exited with code ${code}${stderr ? `: ${stderr.slice(-1200)}` : ''}`,
        code,
        stderr,
      );
    }
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onAbort);
    rl.close();
    if (child.exitCode === null) child.kill('SIGKILL');
  }
}

/** True when `cmd` resolves on PATH. */
export async function commandExists(cmd: string): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = spawn(process.platform === 'win32' ? 'where' : 'which', [cmd], {
      stdio: 'ignore',
    });
    probe.on('error', () => resolve(false));
    probe.on('close', (code) => resolve(code === 0));
  });
}
