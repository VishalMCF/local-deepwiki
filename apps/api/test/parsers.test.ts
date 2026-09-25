import { describe, expect, it } from 'vitest';
import { extractJson, stripTrailingJsonFence } from '../src/agents/json.util';
import { filePathFromCommand, parseCodexLine } from '../src/agents/runners/codex.runner';
import { parseStreamJsonLine } from '../src/agents/runners/stream-json.parser';
import { parseCitations, verifyCitations } from '../src/common/citations.util';
import { toRepoRelative } from '../src/agents/agent.service';
import { cleanMarkdown } from '../src/wiki/indexer.service';

describe('extractJson', () => {
  it('reads a fenced json block surrounded by prose', () => {
    const text = 'Here is the outline.\n\n```json\n{"pages":[{"title":"Overview"}]}\n```\n';
    expect(extractJson(text)).toEqual({ pages: [{ title: 'Overview' }] });
  });

  it('prefers the last fence when the model emits several', () => {
    const text = '```json\n{"a":1}\n```\ntext\n```json\n{"a":2}\n```';
    expect(extractJson<{ a: number }>(text)?.a).toBe(2);
  });

  it('falls back to a balanced object with no fence', () => {
    expect(extractJson('result: {"ok": true} done')).toEqual({ ok: true });
  });

  it('repairs trailing commas', () => {
    expect(extractJson('```json\n{"a":1,}\n```')).toEqual({ a: 1 });
  });

  it('returns null when there is no json', () => {
    expect(extractJson('no structured output here')).toBeNull();
  });

  it('strips the trailing fence from page markdown', () => {
    const md = '# Page\n\nBody text.\n\n```json\n{"sources":[]}\n```';
    expect(stripTrailingJsonFence(md)).toBe('# Page\n\nBody text.');
  });
});

describe('parseCitations', () => {
  it('reads a Sources line', () => {
    const cites = parseCitations('Sources: src/server.go:264-326, README.md:5-7');
    expect(cites).toEqual([
      { path: 'src/server.go', startLine: 264, endLine: 326 },
      { path: 'README.md', startLine: 5, endLine: 7 },
    ]);
  });

  it('reads inline backticked refs', () => {
    const cites = parseCitations('The handler lives in `src/lib.go:33-47` and is short.');
    expect(cites[0]).toEqual({ path: 'src/lib.go', startLine: 33, endLine: 47 });
  });

  it('treats a single line number as a one-line range', () => {
    expect(parseCitations('Sources: main.go:12')[0]).toEqual({
      path: 'main.go',
      startLine: 12,
      endLine: 12,
    });
  });

  it('deduplicates identical refs', () => {
    const md = 'Sources: a.go:1-2\n\nSources: a.go:1-2';
    expect(parseCitations(md)).toHaveLength(1);
  });

  it('ignores urls and prose that looks like a path', () => {
    const cites = parseCitations('Sources: https://example.com/x.go:1-2, e.g. something');
    expect(cites.every((c) => !c.path.startsWith('http'))).toBe(true);
  });

  it('marks a citation unverified when the agent never opened that file', () => {
    const cites = parseCitations('Sources: src/real.go:1-2, src/ghost.go:9-10');
    const verified = verifyCitations(cites, ['src/real.go']);
    expect(verified.find((c) => c.path === 'src/real.go')?.verified).toBe(true);
    expect(verified.find((c) => c.path === 'src/ghost.go')?.verified).toBe(false);
  });
});

describe('parseStreamJsonLine', () => {
  it('maps a tool_use block to a scanning event', () => {
    const line = JSON.stringify({
      type: 'assistant',
      session_id: 's1',
      message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: '/repo/src/a.go' } }] },
    });
    const events = parseStreamJsonLine(line);
    expect(events).toContainEqual({ type: 'session', sessionId: 's1' });
    expect(events).toContainEqual({ type: 'tool', tool: 'Read', path: '/repo/src/a.go' });
  });

  it('maps partial text deltas', () => {
    const line = JSON.stringify({
      type: 'stream_event',
      event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'hel' } },
    });
    expect(parseStreamJsonLine(line)).toEqual([{ type: 'text', text: 'hel' }]);
  });

  it('maps a success result', () => {
    const line = JSON.stringify({ type: 'result', subtype: 'success', result: 'answer' });
    expect(parseStreamJsonLine(line)[0]).toMatchObject({ type: 'result', text: 'answer' });
  });

  it('maps a non-success result to an error', () => {
    const line = JSON.stringify({ type: 'result', subtype: 'error_max_turns' });
    expect(parseStreamJsonLine(line)[0].type).toBe('error');
  });

  it('ignores non-json noise on stdout', () => {
    expect(parseStreamJsonLine('Loading plugins...')).toEqual([]);
  });
});

describe('parseCodexLine', () => {
  it('handles the {id,msg} envelope', () => {
    const line = JSON.stringify({ id: '0', msg: { type: 'agent_message_delta', delta: 'hi' } });
    expect(parseCodexLine(line)).toEqual([{ type: 'text', text: 'hi' }]);
  });

  it('handles the item.completed envelope', () => {
    const line = JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'done' } });
    expect(parseCodexLine(line)).toEqual([{ type: 'result', text: 'done' }]);
  });

  it('turns a shell read into a scanning event', () => {
    const line = JSON.stringify({ msg: { type: 'exec_command_begin', command: ['sed', '-n', '1,40p', 'src/server.go'] } });
    expect(parseCodexLine(line)[0]).toMatchObject({ type: 'tool', path: 'src/server.go' });
  });
});

describe('filePathFromCommand', () => {
  it('finds the file in a read command', () => {
    expect(filePathFromCommand('cat src/store.go')).toBe('src/store.go');
  });
  it('skips flags', () => {
    expect(filePathFromCommand('head -n 40 internal/db.rs')).toBe('internal/db.rs');
  });
  it('returns undefined when there is no file', () => {
    expect(filePathFromCommand('go build ./...')).toBeUndefined();
  });
});

describe('toRepoRelative', () => {
  const root = '/repo';
  it('relativises an absolute path inside the repo', () => {
    expect(toRepoRelative(root, '/repo/src/a.go')).toBe('src/a.go');
  });
  it('keeps an already-relative path', () => {
    expect(toRepoRelative(root, 'src/a.go')).toBe('src/a.go');
  });
  it('drops the repo root itself', () => {
    expect(toRepoRelative(root, '/repo')).toBeNull();
  });
  it('drops paths outside the repo', () => {
    expect(toRepoRelative(root, '/etc/passwd')).toBeNull();
  });
});

describe('cleanMarkdown', () => {
  it('drops a conversational preamble before the first heading', () => {
    const out = cleanMarkdown('Have enough. Writing the page now.\n\n# Overview\n\nBody.');
    expect(out).toBe('# Overview\n\nBody.');
  });

  it('unwraps a page the agent wrapped in a markdown fence', () => {
    expect(cleanMarkdown('```markdown\n# Title\n\nBody.\n```')).toBe('# Title\n\nBody.');
  });

  it('leaves a well-formed page untouched', () => {
    const md = '# Title\n\nBody with a # hash inside.';
    expect(cleanMarkdown(md)).toBe(md);
  });
});

describe('extensionless citation paths', () => {
  it('captures a file with no extension when line numbers are present', () => {
    const cites = parseCitations('Sources: volume:42-60, Dockerfile:1-9');
    expect(cites).toContainEqual({ path: 'volume', startLine: 42, endLine: 60 });
    expect(cites).toContainEqual({ path: 'Dockerfile', startLine: 1, endLine: 9 });
  });

  it('still rejects bare prose words with no line numbers', () => {
    const cites = parseCitations('Sources: something, other');
    expect(cites).toHaveLength(0);
  });

  it('does not double-count the path part of a path:line ref', () => {
    expect(parseCitations('Sources: src/main.go:10-20')).toEqual([
      { path: 'src/main.go', startLine: 10, endLine: 20 },
    ]);
  });
});
