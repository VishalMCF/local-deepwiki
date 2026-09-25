# Bugs found and fixed

Every entry below was found by running the app against real repositories, not by
reading the code. The test repository was `geohot/minikeyvalue` at `451d248` —
the same commit DeepWiki itself indexed, so the output could be compared
side by side.

Each fix is covered by unit tests in `apps/api/test/parsers.test.ts` (40 tests).

---

## 1. Spawned agents inherited the host's Claude Code configuration

**Severity:** high — silently corrupted every generated page.

**Symptom.** Wiki prose and chat answers came back in a clipped, article-dropping
register ("Request body stream to disk direct, no buffering") instead of the
technical prose the prompt asks for.

**Cause.** `claude -p` is launched as a child process, so it loads the host
user's settings: `~/.claude` hooks, plugins and `CLAUDE.md`. A `SessionStart`
hook on the developer's machine was injecting a style instruction into every
agent run. Any host hook can do this — including one that injects instructions
into generated documentation.

**Fix.** Pass `--restricted`, which ignores user, project and local settings
files. `--bare` also isolates the run but disables keychain/OAuth auth, so the
agent fails with `Not logged in · Please run /login`; `--restricted` keeps auth
working and still removes command-running tools.

**Where:** `apps/api/src/agents/runners/claude.runner.ts` · commit `698203b`

**Still open:** `agy` exposes no equivalent flag, so the Agy Flash preset can
still pick up host hooks. The `claude` and `codex` presets are isolated.

---

## 2. Agents report absolute paths, the UI expects repo-relative ones

**Severity:** high — broke source chips and the code viewer.

**Symptom.** `scannedFiles` contained
`/private/tmp/.../fixture-kv/src/server.go` rather than `src/server.go`. The
"Relevant source files" chips rendered full absolute paths, and clicking one
returned 404: the file endpoint joins the requested path onto the repo root, so
an absolute path resolved to a directory that does not exist.

**Cause.** No normalisation between what the CLI reports and what the rest of
the system assumes.

**Fix.** `toRepoRelative` in `AgentService.stream()`, applied to every `tool`
event as it leaves the adapter — so live SSE events and the collected
`scannedFiles` are both relative. Paths outside the repo, and the repo root
itself, are dropped rather than passed through.

**Where:** `apps/api/src/agents/agent.service.ts` · commit `698203b`

---

## 3. Agent preamble leaked into page content

**Severity:** medium — visible on the rendered page.

**Symptom.** The generated Overview page began:

```
Have enough. Writing the page now.

# Overview
```

**Cause.** `cleanMarkdown` only stripped a preamble matching `here's` / `here is`.
Models narrate their process in many other ways.

**Fix.** The page prompt requires the page to start with an H1, so anything
before the first `^# ` is chatter by definition and is removed. Falls back to
leaving the text untouched when there is no H1, so a malformed page is never
emptied.

**Where:** `apps/api/src/wiki/indexer.service.ts` · commit `698203b`

---

## 4. Citations to extensionless files were silently dropped

**Severity:** medium — lost citations with no error.

**Symptom.** A page cited `volume:42-60` (minikeyvalue's nginx volume-server
shell script) and `Dockerfile:1-9`. Neither appeared in the citation list.

**Cause.** The citation regex required a path to contain a dot or a slash, to
avoid matching ordinary prose words. Extensionless top-level files satisfy
neither.

**Fix.** Split into two patterns. A token carrying line numbers is a path
regardless of shape (`volume:42-60`); a bare token with no line numbers must
still look like a path. Ranges already matched are excluded from the bare pass
so a path is not counted twice.

**Where:** `apps/api/src/common/citations.util.ts` · commit `698203b`

---

## 5. Grep-based answers had every citation flagged as hallucinated

**Severity:** high — the verification feature was worse than useless.

**Symptom.** Asking "what are the core packages of golang used in the project?"
produced a correct, well-cited answer in which **all 20 citations** were marked
`verified: false` and rendered with a warning icon.

**Cause.** Verification required the cited file to appear in `scannedFiles`. The
agent answered with one `Grep` over `src/`, so the only entry recorded was the
directory `src`. Every file citation under it failed the check.

**Fix.** A scanned directory now covers the files beneath it. An unrelated path
(`tools/s3test.py` against a scan of `src`) still fails, so genuinely fabricated
paths are still caught.

**Result:** the same question went from 20/20 unverified to 1/38.

**Where:** `apps/api/src/common/citations.util.ts` · commit `0e39ea5`

---

## 6. Chat answers opened with process narration

**Severity:** low — cosmetic, but visible above the fold.

**Symptom.** An answer began "Now I have a complete picture of the imports
across the Go source files." before the actual content.

**Cause.** Same class as bug 3, but chat answers never passed through any
cleanup, and unlike wiki pages they have no required opening structure to
anchor on.

**Fix.** Two layers. The ask prompt forbids narration explicitly. `cleanAnswer`
then removes at most one leading line, only when it matches a narration opener,
never when the line is a heading, list item, table row, code fence or citation,
and never when removing it would empty the answer.

**Where:** `apps/api/src/common/answer.util.ts`, `apps/api/src/chat/prompts.ts` ·
commit `0e39ea5`

---

## 7. Build output landed in the wrong directory

**Severity:** low — caught before release.

**Symptom.** `node dist/main.js` failed with `MODULE_NOT_FOUND`; the compiler had
emitted `dist/src/main.js`.

**Cause.** `tsconfig.json` included `prisma/**` (for the seed script), which
raised the inferred `rootDir` one level and shifted every emitted path.

**Fix.** A separate `tsconfig.build.json` including only `src/**`, which the Nest
CLI picks up automatically. The seed script still type-checks under the base
config.

**Where:** `apps/api/tsconfig.build.json` · commit `af2e0e2`

---

## Non-bugs worth recording

**`pkill -f "<full path>"` matched nothing.** The API was started as
`node dist/main.js` from its own directory, so the process's argv never contains
the absolute path. An old build kept serving requests and made a fix look like it
had failed. Kill by port (`lsof -ti tcp:4000`) instead.

**`--settings '{"hooks":{}}'` does not clear host hooks.** Settings passed this
way merge with the user's rather than replacing them, so plugin hooks survive.
This is why bug 1 needs `--restricted` rather than a settings override.
