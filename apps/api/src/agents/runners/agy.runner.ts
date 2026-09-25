import { Injectable, Logger } from '@nestjs/common';
import { AgentEvent, AgentRunner, RunOptions } from '../agent.types';
import { commandExists, spawnLines } from './process.util';
import { parseStreamJsonLine } from './stream-json.parser';

/**
 * `agy` mirrors Claude Code's print-mode interface (-p, --output-format
 * stream-json, --add-dir, --conversation) so it reuses the same NDJSON parser.
 * Differences: resume flag is --conversation, and it has no --allowed-tools,
 * so read-only behaviour is enforced by the prompt plus --sandbox.
 */
@Injectable()
export class AgyRunner implements AgentRunner {
  readonly cli = 'agy';
  private readonly log = new Logger(AgyRunner.name);
  private available?: boolean;

  async isAvailable(): Promise<boolean> {
    if (this.available === undefined) this.available = await commandExists('agy');
    return this.available;
  }

  async *run(opts: RunOptions): AsyncGenerator<AgentEvent> {
    const args = ['-p', '--output-format', 'stream-json', '--add-dir', opts.cwd, '--sandbox'];
    if (opts.model) args.push('--model', opts.model);
    if (opts.effort) args.push('--effort', opts.effort);
    if (opts.resumeSessionId) args.push('--conversation', opts.resumeSessionId);

    this.log.debug(`agy ${args.join(' ')}`);

    for await (const { line } of spawnLines({
      cmd: 'agy',
      args: [...args, opts.prompt],
      cwd: opts.cwd,
      timeoutMs: opts.timeoutMs ?? 900_000,
      signal: opts.signal,
    })) {
      for (const ev of parseStreamJsonLine(line)) yield ev;
    }
  }
}
