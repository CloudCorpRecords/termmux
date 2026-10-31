# termmux — Build Report

MCP Rebuild 100, Wave 1 Batch 5 (final Tier A batch). Clean-room
rebuild of the "tmux" target. tmux is a FILL-IN-style target for
this program: the 12-tool spec was defined for this program and
mapped onto the real tmux CLI; the fixture labels itself
accordingly. Local build only — nothing pushed or published.

Identity: repo `termmux`, npm `@reneturcios/termmux`,
MCP name `io.github.CloudCorpRecords/termmux`, version `0.1.0`.

## Files created (19/19 per TEMPLATE.md checklist)

- `package.json` — bin `termmux: dist/cli.js`, `mcpName` set
- `server.json` — description = **86 chars** (≤100 ✓, verified
  programmatically); npm entry carries `version: 0.1.0`; OCI entry
  `ghcr.io/cloudcorprecords/termmux:0.1.0` carries **no** `version`
  field (verified programmatically)
- `Dockerfile` — node:20-alpine two-stage, label
  `io.modelcontextprotocol.server.name="io.github.CloudCorpRecords/termmux"`.
  The base image bundles **no tmux binary** (see gaps)
- `tsconfig.json`, `.gitignore`, `LICENSE` (MIT), `README.md`,
  `CHANGELOG.md` (single 0.1.0 entry, 2026-10-26)
- `src/index.ts`, `src/cli.ts`, `src/mcp.ts`, `src/types.ts`,
  `src/tmux.ts` (core + execFile executor)
- `test/tmux.test.ts`
- `.github/workflows/{ci,publish,publish-container,registry-publish}.yml`

## Implementation notes

- Twelve MCP tools: `list_sessions`, `create_session`,
  `kill_session`, `list_windows`, `create_window`, `kill_window`,
  `list_panes`, `send_keys`, `capture_pane`, `rename_session`,
  `select_window`, `get_session_info`, each mapped to the real
  tmux CLI subcommand of the same meaning.
- **Low-level Server API** with explicit inputSchema literals (not
  McpServer+zod — standing rule). Zod validates `tools/call` args.
- **Real tmux via execFile argument arrays** (no shell) behind an
  injectable `TmuxExecutor`; unit tests use fakes. List operations
  return `[]` when tmux reports "no server running"; other
  operations surface tmux's own error text.
- **Bug found by live smoke and fixed:** this environment's tmux
  build sanitises tab characters in `-F` format output to `_`
  (verified byte-wise with `od -c`), which corrupted tab-separated
  parsing (window counts came back `NaN`). The format strings in
  `src/tmux.ts` now use `|` as the field separator, with an
  explanatory comment. Trade-off: session/window names containing
  `|` would misparse; tmux names with `|` are rare and the failure
  mode is visible, not silent. Tests were updated to pipe-separated
  fixtures and re-pass 13/13.

## Verification (exact outputs)

- Build: `tsc` exit 0; canonical `dist/` present with `.d.ts` /
  `.js.map`. (Mid-batch the VM write guard truncated an earlier
  dist; stock `tsc` was re-run after the guard lifted and parity +
  tests re-verified against the canonical dist.)
- Tests: `tsx --test` → tests 13, pass 13, fail 0.
- **Live tmux smoke (real, this VM, tmux 3.4):**
  `create-session` → `send-keys "echo hello-from-termmux"` →
  `capture-pane` returned `hello-from-termmux` → `kill-session`.
  After the separator fix: `create-session termmux-probe2` →
  `list-sessions` printed `termmux-probe2  1 windows  detached`
  (correct parse) → `kill-session` → `--version` → `0.1.0`.
- Parity: verdict **PASS**, parity_pct **100.0**, identical_tools
  **12/12**, schema_diffs {} (`parity-out/parity.json`, re-run
  2026-10-26T17:03:10Z against canonical dist). Original side:
  tools-file fixture `harness/fixtures/tmux-tools-original.json`
  (program-defined spec, labelled in its `_source`).

## Lockfile status

`package-lock.json` copied from pdfport with identity fields edited
(top-level `name`, root package `name`, bin key). Clean lockfile
regeneration is REQUIRED before publish — Blocker 3 in
SCOREBOARD.md. `node_modules` is a local `cp -a` copy; gitignored.

## Blockers / honest gaps

- The spec is program-defined (no original tmux MCP server was
  probed); parity proves the rebuild matches the defined spec.
  The underlying tmux behaviour, however, IS proven live (above).
- The container image bundles no tmux binary, so containerised
  termmux can only pass the initialize/usage smoke; real session
  operations need a host (or image) with tmux installed. Same class
  as repoport gap 10 / docbase gap 17.
- Pipe-separator trade-off for `-F` parsing, described above.
- mcpaudit / mcpvet / shipcheck pre-publish gate not run — publish
  wave scope, not claimed here.
