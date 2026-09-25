import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AgentEvent, AgentRunner, RunOptions } from '../agent.types';
import { commandExists, spawnLines } from './process.util';

/**
 * `codex exec --json` emits JSONL whose envelope has changed across releases
 * ({id,msg:{type}} in older builds, {type:'item.*',item} in newer ones), so the
 * parser accepts both. --output-last-message also writes the final answer to a
 * file, which is used as the authoritative result even if streaming shapes drift.
 */
@Injectable()
export class CodexRunner implements AgentRunner {
  readonly cli = 'codex';
  private readonly log = new Logger(CodexRunner.name);
  private available?: boolean;

  async isAvailable(): Promise<boolean> {
    if (this.available === undefined) this.available = await commandExists('codex');
    return this.available;
  }

  async *run(opts: RunOptions): AsyncGenerator<AgentEvent> {
    const dir = await mkdtemp(join(tmpdir(), 'deepwiki-codex-'));
    const lastMessageFile = join(dir, `${randomUUID()}.txt`);

    const args = [
      'exec',
      '--json',
      '-C',
      opts.cwd,
      '--sandbox',
      'read-only',
      '--skip-git-repo-check',
      '-o',
      lastMessageFile,
    ];
    if (opts.model) args.push('-m', opts.model);
    if (opts.effort) args.push('-c', `model_reasoning_effort="${opts.effort}"`);

    // `codex exec resume <id>` continues a session; the subcommand goes first.
    const argv = opts.resumeSessionId
      ? ['exec', 'resume', opts.resumeSessionId, ...args.slice(1)]
      : args;

    this.log.debug(`codex ${argv.join(' ')}`);

    let streamedResult = '';
    let sawResult = false;

    try {
      for await (const { line } of spawnLines({
        cmd: 'codex',
        args: argv,
        cwd: opts.cwd,
        timeoutMs: opts.timeoutMs ?? 900_000,
        signal: opts.signal,
        stdin: opts.prompt,
      })) {
        for (const ev of parseCodexLine(line)) {
          if (ev.type === 'result') {
            sawResult = true;
            streamedResult = ev.text || streamedResult;
            continue; // emit result once, after reading the last-message file
          }
          if (ev.type === 'text') streamedResult += ev.text;
          yield ev;
        }
      }

      const fileText = await readFile(lastMessageFile, 'utf8').catch(() => '');
      const finalText = fileText.trim() || streamedResult;
      if (!finalText && !sawResult) {
        yield { type: 'error', message: 'codex produced no output' };
      } else {
        yield { type: 'result', text: finalText };
      }
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

export function parseCodexLine(line: string): AgentEvent[] {
  let raw: any;
  try {
    raw = JSON.parse(line);
  } catch {
    return [];
  }
  const out: AgentEvent[] = [];

  const sessionId = raw.session_id ?? raw.thread_id ?? raw.msg?.session_id ?? raw.item?.thread_id;
  if (sessionId) out.push({ type: 'session', sessionId: String(sessionId) });

  // Newer envelope: {type: "item.completed", item: {...}}
  if (typeof raw.type === 'string' && raw.type.startsWith('item.') && raw.item) {
    out.push(...fromItem(raw.item, raw.type));
    return out;
  }

  const msg = raw.msg ?? raw;
  switch (msg.type) {
    case 'agent_message_delta':
      if (msg.delta) out.push({ type: 'text', text: msg.delta });
      break;
    case 'agent_message':
      if (msg.message) out.push({ type: 'result', text: msg.message });
      break;
    case 'agent_reasoning_delta':
      if (msg.delta) out.push({ type: 'thinking', text: msg.delta });
      break;
    case 'agent_reasoning':
      if (msg.text) out.push({ type: 'thinking', text: msg.text });
      break;
    case 'exec_command_begin': {
      const cmd = Array.isArray(msg.command) ? msg.command.join(' ') : String(msg.command ?? '');
      out.push({ type: 'tool', tool: 'Bash', path: filePathFromCommand(cmd), detail: cmd.slice(0, 120) });
      break;
    }
    case 'mcp_tool_call_begin':
      out.push({ type: 'tool', tool: msg.invocation?.tool ?? 'mcp', detail: msg.invocation?.server });
      break;
    case 'web_search_begin':
      out.push({ type: 'tool', tool: 'WebSearch', detail: msg.query });
      break;
    case 'error':
    case 'stream_error':
      out.push({ type: 'error', message: msg.message ?? 'codex error' });
      break;
    case 'task_complete':
      if (msg.last_agent_message) out.push({ type: 'result', text: msg.last_agent_message });
      break;
  }
  return out;
}

function fromItem(item: any, envelope: string): AgentEvent[] {
  const started = envelope === 'item.started';
  switch (item.type) {
    case 'agent_message':
      return started ? [] : [{ type: 'result', text: item.text ?? '' }];
    case 'reasoning':
      return item.text ? [{ type: 'thinking', text: item.text }] : [];
    case 'command_execution': {
      if (!started) return [];
      const cmd = String(item.command ?? '');
      return [{ type: 'tool', tool: 'Bash', path: filePathFromCommand(cmd), detail: cmd.slice(0, 120) }];
    }
    case 'file_change':
      return started ? [{ type: 'tool', tool: 'Edit', path: item.path }] : [];
    case 'error':
      return [{ type: 'error', message: item.message ?? 'codex error' }];
    default:
      return [];
  }
}

/**
 * Codex reads files through shell commands, so the "Scanning ..." path has to be
 * recovered from the command line itself.
 */
export function filePathFromCommand(cmd: string): string | undefined {
  if (!cmd) return undefined;
  const tokens = cmd.split(/\s+/).filter(Boolean);
  const readers = new Set(['cat', 'head', 'tail', 'sed', 'bat', 'less', 'nl', 'wc']);
  const isReader = tokens.some((t) => readers.has(t.replace(/^.*\//, '')));
  for (const token of tokens.slice(1)) {
    const clean = token.replace(/^['"]|['"]$/g, '');
    if (clean.startsWith('-')) continue;
    if (!/[./]/.test(clean)) continue;
    if (/\.[a-zA-Z0-9]{1,8}$/.test(clean) || (isReader && clean.includes('/'))) return clean;
  }
  return undefined;
}
