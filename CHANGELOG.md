# Changelog

## 0.1.0 (2026-10-26)

- First release: twelve tmux tools (sessions, windows, panes,
  send-keys, capture) over the real tmux CLI via an injectable
  execFile executor; argument arrays only, never shell strings.
- One bin serves the CLI and a stdio MCP server (`mcp` subcommand).
