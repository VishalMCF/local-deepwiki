import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import { AgentEvent, AgentRunner, PresetConfig, RunOptions } from './agent.types';
import { DEFAULT_PRESETS } from './presets';
import { AgyRunner } from './runners/agy.runner';
import { ClaudeRunner } from './runners/claude.runner';
import { CodexRunner } from './runners/codex.runner';

export interface AgentRunResult {
  text: string;
  sessionId?: string;
  scannedFiles: string[];
  durationMs: number;
  costUsd?: number;
}

@Injectable()
export class AgentService {
  private readonly log = new Logger(AgentService.name);
  private readonly runners: Record<string, AgentRunner>;

  constructor(
    private readonly prisma: PrismaService,
    claude: ClaudeRunner,
    codex: CodexRunner,
    agy: AgyRunner,
  ) {
    this.runners = { claude, codex, agy };
  }

  async listPresets(): Promise<(PresetConfig & { available: boolean; isDefault: boolean })[]> {
    const rows = await this.prisma.agentPreset.findMany({
      where: { enabled: true },
      orderBy: { order: 'asc' },
    });
    const source = rows.length ? rows : DEFAULT_PRESETS.map((p) => ({ ...p, enabled: true }));

    return Promise.all(
      source.map(async (p: any) => ({
        key: p.key,
        label: p.label,
        cli: p.cli,
        model: p.model ?? undefined,
        effort: p.effort ?? undefined,
        hint: p.hint ?? undefined,
        isDefault: Boolean(p.isDefault),
        available: (await this.runners[p.cli]?.isAvailable()) ?? false,
      })),
    );
  }

  async resolvePreset(key?: string): Promise<PresetConfig> {
    const presets = await this.listPresets();
    const wanted = key ? presets.find((p) => p.key === key) : undefined;
    if (wanted?.available) return wanted;

    if (wanted && !wanted.available) {
      this.log.warn(`preset "${key}" needs the "${wanted.cli}" CLI, which is not on PATH`);
    }
    const fallback = presets.find((p) => p.isDefault && p.available) ?? presets.find((p) => p.available);
    if (!fallback) {
      throw new BadRequestException(
        'No agent CLI available. Install at least one of: claude, codex, agy.',
      );
    }
    return fallback;
  }

  /** Stream normalized events for a prompt run under the given preset. */
  async *stream(
    presetKey: string | undefined,
    opts: Omit<RunOptions, 'model' | 'effort'>,
  ): AsyncGenerator<AgentEvent> {
    const preset = await this.resolvePreset(presetKey);
    const runner = this.runners[preset.cli];
    const timeoutMs = Number(process.env.AGENT_TIMEOUT_MS ?? 900_000);

    try {
      for await (const ev of runner.run({ ...opts, model: preset.model, effort: preset.effort, timeoutMs })) {
        // Agents report absolute paths; the UI and the file endpoint both work
        // in repo-relative terms, so normalize at this boundary.
        if (ev.type === 'tool' && ev.path) {
          const rel = toRepoRelative(opts.cwd, ev.path);
          yield rel ? { ...ev, path: rel } : { ...ev, path: undefined };
          continue;
        }
        yield ev;
      }
    } catch (err: any) {
      yield { type: 'error', message: err?.message ?? String(err) };
    }
  }

  /** Run to completion, collecting the final text and every file the agent read. */
  async run(
    presetKey: string | undefined,
    opts: Omit<RunOptions, 'model' | 'effort'>,
    onEvent?: (ev: AgentEvent) => void,
  ): Promise<AgentRunResult> {
    const startedAt = Date.now();
    const scanned = new Set<string>();
    let sessionId: string | undefined;
    let resultText = '';
    let streamedText = '';
    let costUsd: number | undefined;
    let error: string | undefined;

    for await (const ev of this.stream(presetKey, opts)) {
      onEvent?.(ev);
      switch (ev.type) {
        case 'session':
          sessionId = ev.sessionId;
          break;
        case 'tool':
          if (ev.path) scanned.add(ev.path);
          break;
        case 'text':
          streamedText += ev.text;
          break;
        case 'result':
          resultText = ev.text;
          costUsd = ev.costUsd;
          break;
        case 'error':
          error = ev.message;
          break;
      }
    }

    const text = (resultText || streamedText).trim();
    if (!text) throw new Error(error ?? 'agent returned no output');

    return {
      text,
      sessionId,
      scannedFiles: [...scanned],
      durationMs: Date.now() - startedAt,
      costUsd,
    };
  }
}

/**
 * Convert a path reported by an agent into a path relative to the repo root.
 * Returns null for the root itself and for anything outside the repo.
 */
export function toRepoRelative(root: string, path: string): string | null {
  if (!path) return null;
  const absolute = isAbsolute(path) ? resolve(path) : resolve(root, path);
  const base = resolve(root);
  if (absolute === base) return null;
  if (!absolute.startsWith(base + sep)) return null;
  const rel = relative(base, absolute);
  return rel && !rel.startsWith('..') ? rel : null;
}
