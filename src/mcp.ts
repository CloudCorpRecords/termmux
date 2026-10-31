/**
 * termmux MCP server. Tools: list_sessions, create_session,
 * kill_session, list_windows, create_window, kill_window,
 * list_panes, send_keys, capture_pane, rename_session,
 * select_window, get_session_info.
 *
 * Why the low-level Server instead of McpServer: the high-level
 * helper converts zod schemas to JSON Schema and injects two keys
 * that are not in this toolset's public spec ("$schema" and
 * "additionalProperties"), which breaks exact tool-list/schema
 * parity with the spec. This file therefore serves tools/list with
 * the spec's exact input schemas, while zod still validates every
 * tools/call argument set.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { TermMux, VERSION } from "./tmux.js";

const S = z.string();
const SessionArgs = z.object({ session_name: S });
const CreateSessionArgs = z.object({ session_name: S, window_name: S.optional(), start_directory: S.optional() });
const WindowArgs = z.object({ session_name: S, window_name: S });
const CreateWindowArgs = z.object({ session_name: S, window_name: S, start_directory: S.optional() });
const ListPanesArgs = z.object({ session_name: S, window_name: S.optional() });
const SendKeysArgs = z.object({ session_name: S, keys: S, pane_target: S.optional(), press_enter: z.boolean().optional() });
const CaptureArgs = z.object({ session_name: S, pane_target: S.optional(), lines: z.number().optional() });
const RenameArgs = z.object({ session_name: S, new_name: S });

const str = { type: "string" as const };
const TOOLS = [
  { name: "list_sessions", description: "List all tmux sessions", inputSchema: { type: "object" as const, properties: {}, required: [] } },
  { name: "create_session", description: "Create a new tmux session", inputSchema: { type: "object" as const, properties: { session_name: { type: "string", description: "The name for the new tmux session" }, start_directory: { type: "string", description: "Optional working directory the session starts in" }, window_name: { type: "string", description: "Optional name for the session's first window" } }, required: ["session_name"] } },
  { name: "kill_session", description: "Kill a tmux session by name", inputSchema: { type: "object" as const, properties: { session_name: { type: "string", description: "The name of the tmux session to kill" } }, required: ["session_name"] } },
  { name: "list_windows", description: "List the windows of a tmux session", inputSchema: { type: "object" as const, properties: { session_name: { type: "string", description: "The name of the tmux session whose windows to list" } }, required: ["session_name"] } },
  { name: "create_window", description: "Create a new window in a tmux session", inputSchema: { type: "object" as const, properties: { session_name: { type: "string", description: "The name of the tmux session to create the window in" }, start_directory: { type: "string", description: "Optional working directory the window starts in" }, window_name: { type: "string", description: "The name for the new window" } }, required: ["session_name", "window_name"] } },
  { name: "kill_window", description: "Kill a window in a tmux session", inputSchema: { type: "object" as const, properties: { session_name: { type: "string", description: "The name of the tmux session containing the window" }, window_name: { type: "string", description: "The name of the window to kill" } }, required: ["session_name", "window_name"] } },
  { name: "list_panes", description: "List the panes of a tmux session, optionally of one window", inputSchema: { type: "object" as const, properties: { session_name: { type: "string", description: "The name of the tmux session whose panes to list" }, window_name: { type: "string", description: "Optional window name to limit the listing to one window" } }, required: ["session_name"] } },
  { name: "send_keys", description: "Send keys (a command line or key names) to a tmux pane", inputSchema: { type: "object" as const, properties: { keys: { type: "string", description: "The command line or key names to send to the pane" }, pane_target: { type: "string", description: "Optional pane target (window.pane) to send the keys to" }, press_enter: { type: "boolean", description: "Whether to press Enter after sending the keys" }, session_name: { type: "string", description: "The name of the tmux session containing the target pane" } }, required: ["session_name", "keys"] } },
  { name: "capture_pane", description: "Capture the visible contents of a tmux pane as text", inputSchema: { type: "object" as const, properties: { lines: { type: "number", description: "Optional number of lines of pane history to capture" }, pane_target: { type: "string", description: "Optional pane target (window.pane) to capture" }, session_name: { type: "string", description: "The name of the tmux session containing the pane" } }, required: ["session_name"] } },
  { name: "rename_session", description: "Rename a tmux session", inputSchema: { type: "object" as const, properties: { new_name: { type: "string", description: "The new name for the session" }, session_name: { type: "string", description: "The current name of the tmux session" } }, required: ["session_name", "new_name"] } },
  { name: "select_window", description: "Select (activate) a window in a tmux session", inputSchema: { type: "object" as const, properties: { session_name: { type: "string", description: "The name of the tmux session containing the window" }, window_name: { type: "string", description: "The name of the window to select" } }, required: ["session_name", "window_name"] } },
  { name: "get_session_info", description: "Get details of one tmux session: window count, creation time and attached state", inputSchema: { type: "object" as const, properties: { session_name: { type: "string", description: "The name of the tmux session to describe" } }, required: ["session_name"] } },
];

function textResult(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}
function errorResult(err: unknown) {
  return { content: [{ type: "text" as const, text: err instanceof Error ? err.message : String(err) }], isError: true };
}

const mux = new TermMux();
const server = new Server({ name: "termmux", version: VERSION }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    switch (name) {
      case "list_sessions": return textResult(await mux.listSessions());
      case "create_session": { const p = CreateSessionArgs.parse(args ?? {}); return textResult(await mux.createSession(p.session_name, p.window_name, p.start_directory)); }
      case "kill_session": return textResult(await mux.killSession(SessionArgs.parse(args ?? {}).session_name));
      case "list_windows": return textResult(await mux.listWindows(SessionArgs.parse(args ?? {}).session_name));
      case "create_window": { const p = CreateWindowArgs.parse(args ?? {}); return textResult(await mux.createWindow(p.session_name, p.window_name, p.start_directory)); }
      case "kill_window": { const p = WindowArgs.parse(args ?? {}); return textResult(await mux.killWindow(p.session_name, p.window_name)); }
      case "list_panes": { const p = ListPanesArgs.parse(args ?? {}); return textResult(await mux.listPanes(p.session_name, p.window_name)); }
      case "send_keys": { const p = SendKeysArgs.parse(args ?? {}); return textResult(await mux.sendKeys(p.session_name, p.keys, p.pane_target, p.press_enter)); }
      case "capture_pane": { const p = CaptureArgs.parse(args ?? {}); return textResult(await mux.capturePane(p.session_name, p.pane_target, p.lines)); }
      case "rename_session": { const p = RenameArgs.parse(args ?? {}); return textResult(await mux.renameSession(p.session_name, p.new_name)); }
      case "select_window": { const p = WindowArgs.parse(args ?? {}); return textResult(await mux.selectWindow(p.session_name, p.window_name)); }
      case "get_session_info": return textResult(await mux.getSessionInfo(SessionArgs.parse(args ?? {}).session_name));
    }
  } catch (err) { return errorResult(err); }
  throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
});

async function main(): Promise<void> { await server.connect(new StdioServerTransport()); }
void main();
