# DeepWiki Local

A DeepWiki-style wiki and chat for repositories **already cloned on your machine**.
Point it at a directory, and it generates a structured wiki with diagrams and
cited sources, then lets you ask questions about the code and get answers that
link to exact files and line ranges.

No embeddings, no vector database. Retrieval is done by headless coding agents
(`claude`, `codex`, `agy`), which read the repository directly and report the
files they opened — that telemetry is what produces the citations.

## Stack

| Layer | Choice |
|---|---|
| Web | React 19, Vite, TypeScript, Tailwind v4, TanStack Query, react-markdown, mermaid, shiki |
| API | NestJS 11, Prisma 6, SSE for streaming |
| DB | PostgreSQL 16 (Docker) |
| Agents | `claude`, `codex`, `agy` CLIs in headless mode |

## Requirements

- Node 20+, pnpm 9+
- Docker (for Postgres only)
- At least one agent CLI on your `PATH`, already authenticated:
  - [`claude`](https://claude.com/claude-code) — used by the **Fast** and **Deep** presets
  - `codex` — used by the **Codex** preset
  - `agy` — used by the **Agy Flash** preset

The API spawns these CLIs as child processes on the host, so it must run
outside Docker where their credentials live.

## Setup

```bash
pnpm install
pnpm db:up                       # Postgres on :5433
pnpm --filter api prisma:push    # create tables
pnpm --filter api seed           # seed agent presets
pnpm dev                         # api :4000, web :5173
```

Open http://localhost:5173.

## Using it

1. **Add repo** → paste an absolute path (`~` works), pick the agent preset, import.
2. The outline agent explores the repo and returns a page tree; page agents then
   write each page in parallel. Pages appear in the nav as they finish.
3. Open a page: prose, mermaid diagrams, tables, and a `Sources:` chip row under
   every section. Click a chip to open that file at the cited lines.
4. Ask a question in the composer. The right pane shows each file the agent opens
   in real time; the answer arrives with inline `path:line` citations.
5. Conversations are saved per repo and listed in the left rail of the ask view.

## How it works

```
POST /api/repos { path }
  → scan (deterministic): file count, languages, entrypoints, README
  → outline agent  → JSON page tree           → WikiPage rows (PENDING)
  → page agents    → markdown + Sources lines → parallel pool of N (INDEX_CONCURRENCY)
        every tool call the agent makes is streamed to the browser over SSE
  → citations parsed from the markdown, cross-checked against files actually read
```

Citations are captured three ways, so one drifting convention does not lose them:

1. `Sources: path:12-48` lines the prompt asks for after every section.
2. Inline backticked `path:264-326` refs inside the prose.
3. Tool-call telemetry — every file the agent actually opened.

A cited path that never appears in (3) is stored with `verified: false` and
rendered with a warning icon, which catches hallucinated file paths.

## Refreshing

Each index records the git SHA. When `HEAD` moves, the wiki shows a
**Refresh this wiki** card. *Refresh changed pages* diffs `indexedSha..HEAD` and
regenerates only the pages whose cited or scanned files changed; *Rebuild all*
regenerates everything.

## Agent presets

Edit the `AgentPreset` table (or `apps/api/src/agents/presets.ts` and re-seed) to
change which CLI, model and effort each dropdown entry maps to.

| Preset | CLI | Model |
|---|---|---|
| Fast | `claude` | `claude-sonnet-5`, low effort |
| Deep | `claude` | `claude-opus-5`, high effort |
| Codex | `codex` | CLI default, medium effort |
| Agy Flash | `agy` | CLI default, low effort |

Presets whose CLI is missing from `PATH` are shown greyed out, and the API falls
back to the default available preset rather than failing.

## Configuration

`apps/api/.env`:

| Variable | Default | Meaning |
|---|---|---|
| `DATABASE_URL` | `postgresql://deepwiki:deepwiki@localhost:5433/deepwiki` | Postgres connection |
| `PORT` | `4000` | API port |
| `WEB_ORIGIN` | `http://localhost:5173` | CORS origin |
| `INDEX_CONCURRENCY` | `4` | Parallel page-generation agents |
| `AGENT_TIMEOUT_MS` | `900000` | Hard timeout per agent run |

## Safety

Imported repositories are read-only. The Claude runner passes
`--allowed-tools Read,Grep,Glob`, the Codex runner uses `--sandbox read-only`,
and `agy` runs with `--sandbox`. The file endpoint resolves every requested path
against the repo root and rejects anything that escapes it.
