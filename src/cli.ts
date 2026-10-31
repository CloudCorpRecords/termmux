#!/usr/bin/env node
/**
 * termmux CLI.
 *
 *   termmux mcp
 *   termmux list-sessions
 *   termmux create-session <name> [window] [start-dir]
 *   termmux kill-session <name>
 *   termmux list-windows <session>
 *   termmux capture <session> [pane]
 *   termmux send <session> <keys...>
 *   termmux --version
 *
 * Exit codes: 0 success, 1 tmux error, 2 usage error.
 */
import { TermMux, VERSION } from "./tmux.js";

function usage(): never {
  console.error(`Usage:
  termmux mcp
  termmux list-sessions
  termmux create-session <name> [window] [start-dir]
  termmux kill-session <name>
  termmux list-windows <session>
  termmux capture <session> [pane]
  termmux send <session> <keys...>
  termmux --version`);
  process.exit(2);
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "--version" || cmd === "-v") { console.log(VERSION); return; }
  if (cmd === "mcp") { await import("./mcp.js"); return; }
  if (!cmd) usage();
  try {
    const mux = new TermMux();
    if (cmd === "list-sessions") {
      for (const s of await mux.listSessions()) console.log(`${s.name}\t${s.windows} windows\t${s.attached ? "attached" : "detached"}`);
    } else if (cmd === "create-session") {
      const [name, win, dir] = rest; if (!name) usage();
      console.log((await mux.createSession(name, win, dir)).session_name);
    } else if (cmd === "kill-session") {
      const [name] = rest; if (!name) usage();
      await mux.killSession(name); console.log(`killed ${name}`);
    } else if (cmd === "list-windows") {
      const [name] = rest; if (!name) usage();
      for (const w of await mux.listWindows(name)) console.log(`${w.index}\t${w.name}${w.active ? " (active)" : ""}`);
    } else if (cmd === "capture") {
      const [name, pane] = rest; if (!name) usage();
      console.log((await mux.capturePane(name, pane)).text);
    } else if (cmd === "send") {
      const [name, ...keys] = rest; if (!name || keys.length === 0) usage();
      await mux.sendKeys(name, keys.join(" ")); console.log("sent");
    } else usage();
  } catch (err) {
    console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
void main();
