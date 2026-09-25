/**
 * Normalized event stream emitted by every AgentRunner, whatever CLI is underneath.
 * The UI consumes only these shapes.
 */
export type AgentEvent =
  /** Session id from the CLI, so follow-up turns can resume the same conversation. */
  | { type: 'session'; sessionId: string }
  /** A tool call started. `path` is set for file-touching tools -> "Scanning server.go". */
  | { type: 'tool'; tool: string; path?: string; detail?: string }
  /** Incremental assistant text. */
  | { type: 'text'; text: string }
  /** Model reasoning, if the CLI exposes it. */
  | { type: 'thinking'; text: string }
  /** Terminal success. `text` is the full final answer. */
  | { type: 'result'; text: string; costUsd?: number; durationMs?: number }
  /** Terminal failure. */
  | { type: 'error'; message: string };

export interface RunOptions {
  /** Repo directory the agent is allowed to read. */
  cwd: string;
  prompt: string;
  model?: string;
  effort?: string;
  /** Resume a prior CLI conversation (follow-up questions in a thread). */
  resumeSessionId?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface AgentRunner {
  readonly cli: string;
  isAvailable(): Promise<boolean>;
  run(opts: RunOptions): AsyncGenerator<AgentEvent>;
}

export interface PresetConfig {
  key: string;
  label: string;
  cli: string;
  model?: string;
  effort?: string;
  hint?: string;
}
