# DeepWiki Local — design

Date: 2026-09-25

## Goal

Reproduce DeepWiki's experience — a generated, cited wiki plus a grounded chat —
for repositories cloned on the user's own machine, selected by directory path.

## Key decision: agents instead of RAG

The conventional build is chunk → embed → pgvector → retrieve → generate. This
design drops all of it. Headless coding agents (`claude -p`, `codex exec`,
`agy -p`) already do retrieval well: they grep, glob and read files on demand,
and their streamed tool calls state exactly which files they opened.

That telemetry is the product's most important feature — citations — obtained
for free. It also removes the embedding pipeline, the vector store, re-embedding
on change, and chunk-boundary tuning.

Trade-off: each question costs an agent invocation and a few seconds of file
reading, rather than a millisecond vector lookup. For a single-user local tool
that is the right side of the trade.

## Architecture

```
React (Vite :5173)  ──/api proxy──>  NestJS (:4000)  ──spawn──>  claude | codex | agy
        ▲                                  │                            │
        └────────── SSE ───────────────────┤                     (repo directory,
                                           │                      read-only tools)
                                      PostgreSQL
```

The API must run on the host, not in a container: the agent CLIs and their
credentials live there. Postgres is the only containerised piece.

### Agent abstraction

`AgentRunner` is the single interface; one adapter per CLI parses that CLI's
NDJSON dialect into a normalized event stream:

| Event | Meaning | UI |
|---|---|---|
| `session` | CLI conversation id | stored for thread follow-ups |
| `tool` | tool call, with `path` when it touches a file | "Scanning server.go" |
| `text` | incremental assistant output | streamed answer |
| `thinking` | reasoning, where exposed | (not surfaced) |
| `result` | final answer | persisted |
| `error` | terminal failure | error banner |

`claude` and `agy` share the Anthropic-style `stream-json` parser. `codex` has
its own parser accepting both the `{id,msg}` and `{type:'item.*',item}` envelopes,
with `--output-last-message` as an authoritative fallback for the final text.

Structured output is requested as a trailing fenced ```json block rather than via
each CLI's native schema flag, because Claude Code has none. `extractJson`
recovers it from fences or by scanning for a balanced object.

### Indexing pipeline

Staged, with a deterministic pre-pass:

1. **Scan** — walk the tree, count files, detect languages, find entrypoints and
   manifests, read the README. No agent cost.
2. **Outline agent** — one run, given the scan, returns a JSON page tree
   (5–9 top-level pages, ≤2 deep). Persisted as `WikiPage` rows in `PENDING`.
3. **Page agents** — one run per page, `INDEX_CONCURRENCY` at a time. Each writes
   markdown with mermaid diagrams and `Sources:` lines. Failure is isolated to
   that page; the rest of the wiki still completes.

Every stage emits SSE on `repo:<id>`, so the browser shows the outline forming
and pages landing one by one.

### Citations

Three independent captures, then a cross-check:

1. `Sources: path:12-48, other:5-7` lines the prompt requires after each section.
2. Inline backticked `path:264-326` references in the prose.
3. Tool-call telemetry: every file the agent actually opened.

Parsed refs are matched against (3). A citation with no matching read is stored
`verified: false` and rendered with a warning icon — cheap hallucination detection.

### Chat

A `Thread` holds ordered `Message` rows; the assistant message carries its
citations and the files scanned. The CLI's own session id is stored on the
thread, so follow-ups resume that conversation and keep the agent's context.

Answers stream through an in-memory `LiveMessage` buffer keyed by message id.
A client connecting late replays the buffer before joining the live stream, and
a client arriving after completion is served from the database. This removes the
race between "POST returns" and "EventSource connects".

### Refresh

Each index stores the git SHA. `stale` is computed by comparing it to live
`HEAD`. Refresh diffs `indexedSha..HEAD` and regenerates only pages whose cited
or scanned files appear in that diff.

## Data model

`Repo` → `WikiPage` (self-referencing tree) → `Citation`
`Repo` → `Thread` → `Message` → `Citation`
`Repo` → `Job` (one row per outline/page run, for history and debugging)
`AgentPreset` (the "Fast ▾" dropdown: cli + model + effort)

`Citation` is deliberately shared between pages and messages — the chip renders
identically in both places.

## Security

- Repositories are read-only: `--allowed-tools Read,Grep,Glob` (claude),
  `--sandbox read-only` (codex), `--sandbox` (agy).
- The file endpoint resolves each requested path against the repo root and
  rejects anything escaping it, with a 2 MB cap.
- Single-user, no auth. The API binds localhost and is not intended to be exposed.

## Deliberate omissions (YAGNI)

- No auth or multi-tenancy — it is a local tool.
- No Redis or BullMQ; a bounded in-process pool plus `Job` rows is enough for
  one machine.
- No filesystem watcher: background agent runs firing while you edit would be
  noisy and costly. Refresh is explicit.
- No wiki editing UI. The wiki is derived from code; edits belong in the code.
