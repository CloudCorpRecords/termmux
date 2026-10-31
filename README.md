# termmux

Drive local tmux from the command line or as a stdio MCP server.
List, create, rename and kill sessions; manage windows and panes;
send keys to a pane and capture its visible output.

Every operation runs the real `tmux` binary with an argument array
(execFile, never a shell string) behind an injectable executor, so
session names and key text are never reinterpreted as shell syntax.
Name a session that does not exist and you get tmux's own error
back. When no tmux server is running, list calls return empty
lists — the same empty world tmux reports.

## Install

```bash
npx -y @reneturcios/termmux mcp
```

Requires a `tmux` binary on the host (the container image bundles
none, so containerised runs report tmux unavailable).

## CLI

```bash
termmux mcp
termmux list-sessions
termmux create-session <name> [window] [start-dir]
termmux kill-session <name>
termmux list-windows <session>
termmux capture <session> [pane]
termmux send <session> <keys...>
termmux --version
```

Exit codes: 0 success, 1 tmux error, 2 usage error.

## MCP tools

| Tool | Purpose |
|---|---|
| `list_sessions` | List all tmux sessions |
| `create_session` | Create a new tmux session |
| `kill_session` | Kill a tmux session by name |
| `list_windows` | List the windows of a tmux session |
| `create_window` | Create a new window in a tmux session |
| `kill_window` | Kill a window in a tmux session |
| `list_panes` | List the panes of a tmux session, optionally of one window |
| `send_keys` | Send keys (a command line or key names) to a tmux pane |
| `capture_pane` | Capture the visible contents of a tmux pane as text |
| `rename_session` | Rename a tmux session |
| `select_window` | Select (activate) a window in a tmux session |
| `get_session_info` | Get details of one tmux session |

MCP client config:

```json
{
  "mcpServers": {
    "termmux": {
      "command": "npx",
      "args": ["-y", "@reneturcios/termmux", "mcp"]
    }
  }
}
```

## Docker

```bash
docker run -i ghcr.io/cloudcorprecords/termmux          # MCP server (tmux unavailable in-image)
docker run --rm ghcr.io/cloudcorprecords/termmux --version
```

## Development

```bash
npm install
npm run build
npm test
```

MIT license.
