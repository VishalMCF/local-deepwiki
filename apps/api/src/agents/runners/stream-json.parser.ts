import { AgentEvent } from '../agent.types';

/**
 * Parser for the Anthropic-style `--output-format stream-json` NDJSON dialect,
 * shared by the `claude` and `agy` CLIs (agy mirrors Claude Code's print-mode
 * flags and event shapes).
 */
export function parseStreamJsonLine(line: string): AgentEvent[] {
  let msg: any;
  try {
    msg = JSON.parse(line);
  } catch {
    return []; // non-JSON noise on stdout
  }
  const out: AgentEvent[] = [];

  if (msg.session_id) out.push({ type: 'session', sessionId: msg.session_id });

  switch (msg.type) {
    case 'system':
      break;

    case 'assistant': {
      for (const block of msg.message?.content ?? []) {
        if (block.type === 'text' && block.text) {
          out.push({ type: 'text', text: block.text });
        } else if (block.type === 'thinking' && block.thinking) {
          out.push({ type: 'thinking', text: block.thinking });
        } else if (block.type === 'tool_use') {
          out.push({ type: 'tool', tool: block.name, ...describeTool(block.name, block.input) });
        }
      }
      break;
    }

    // Emitted with --include-partial-messages: token-level deltas.
    case 'stream_event': {
      const ev = msg.event;
      if (ev?.type === 'content_block_delta') {
        if (ev.delta?.type === 'text_delta' && ev.delta.text) {
          out.push({ type: 'text', text: ev.delta.text });
        } else if (ev.delta?.type === 'thinking_delta' && ev.delta.thinking) {
          out.push({ type: 'thinking', text: ev.delta.thinking });
        }
      }
      break;
    }

    case 'result': {
      if (msg.subtype && msg.subtype !== 'success') {
        out.push({ type: 'error', message: msg.error ?? msg.result ?? `agent result: ${msg.subtype}` });
      } else {
        out.push({
          type: 'result',
          text: typeof msg.result === 'string' ? msg.result : '',
          costUsd: msg.total_cost_usd,
          durationMs: msg.duration_ms,
        });
      }
      break;
    }
  }
  return out;
}

/** Map a tool call to the file path shown in the "Scanning ..." panel. */
export function describeTool(name: string, input: any): { path?: string; detail?: string } {
  if (!input) return {};
  const path: string | undefined =
    input.file_path ?? input.filePath ?? input.path ?? input.notebook_path ?? undefined;
  if (path) return { path };

  if (input.pattern) {
    return { path: input.path || input.glob || undefined, detail: String(input.pattern) };
  }
  if (input.command) return { detail: String(input.command).slice(0, 120) };
  if (input.query) return { detail: String(input.query).slice(0, 120) };
  return {};
}
