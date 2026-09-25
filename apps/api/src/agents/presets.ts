import { PresetConfig } from './agent.types';

/**
 * The "Fast v" dropdown in the chat bar. Each preset collapses a CLI, a model
 * and a reasoning effort into one user-facing choice. Seeded into the DB so
 * they can be edited without a redeploy.
 */
export const DEFAULT_PRESETS: (PresetConfig & { order: number; isDefault?: boolean })[] = [
  {
    key: 'fast',
    label: 'Fast',
    cli: 'claude',
    model: 'claude-sonnet-5',
    effort: 'low',
    hint: 'Sonnet 5 · quick answers',
    order: 0,
    isDefault: true,
  },
  {
    key: 'deep',
    label: 'Deep',
    cli: 'claude',
    model: 'claude-opus-5',
    effort: 'high',
    hint: 'Opus 5 · thorough, multi-file reasoning',
    order: 1,
  },
  {
    key: 'codex',
    label: 'Codex',
    cli: 'codex',
    model: undefined,
    effort: 'medium',
    hint: 'OpenAI Codex CLI',
    order: 2,
  },
  {
    key: 'agy-flash',
    label: 'Agy Flash',
    cli: 'agy',
    model: undefined,
    effort: 'low',
    hint: 'Antigravity · fastest, cheapest',
    order: 3,
  },
];
