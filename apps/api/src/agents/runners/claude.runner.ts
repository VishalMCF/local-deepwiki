import { Injectable, Logger } from '@nestjs/common';
import { AgentEvent, AgentRunner, RunOptions } from '../agent.types';
import { commandExists, spawnLines } from './process.util';
import { parseStreamJsonLine } from './stream-json.parser';

/** Tools the agent may use. Read-only: the wiki must never mutate the repo. */
const READ_ONLY_TOOLS = ['Read', 'Grep', 'Glob'];

@Injectable()
export class ClaudeRunner implements AgentRunner {
  readonly cli = 'claude';
  private readonly log = new Logger(ClaudeRunner.name);
  private available?: boolean;

  async isAvailable(): Promise<boolean> {
    if (this.available === undefined) this.available = await commandExists('claude');
    return this.available;
  }

  async *run(opts: RunOptions): AsyncGenerator<AgentEvent> {
    const args = [
      '-p',
      // --restricted ignores the host's user/project settings files, so personal
      // hooks and plugins cannot change the wiki's voice or inject instructions
      // into generated pages. Unlike --bare it keeps keychain/OAuth auth working.
      '--restricted',
      '--output-format',
      'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--add-dir',
      opts.cwd,
      '--allowed-tools',
      READ_ONLY_TOOLS.join(','),
      '--permission-mode',
      'default',
    ];
    if (opts.model) args.push('--model', opts.model);
    if (opts.effort) args.push('--effort', opts.effort);
    if (opts.resumeSessionId) args.push('--resume', opts.resumeSessionId);

    this.log.debug(`claude ${args.join(' ')}`);

    // Prompt goes over stdin so it is never subject to argv length limits.
    for await (const { line } of spawnLines({
      cmd: 'claude',
      args,
      cwd: opts.cwd,
      timeoutMs: opts.timeoutMs ?? 900_000,
      signal: opts.signal,
      stdin: opts.prompt,
    })) {
      for (const ev of parseStreamJsonLine(line)) yield ev;
    }
  }
}
