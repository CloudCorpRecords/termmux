/**
 * termmux core: the twelve tmux tools.
 *
 * Every operation builds an argument array for the real tmux CLI
 * (list-sessions, new-session, kill-session, list-windows,
 * new-window, kill-window, list-panes, send-keys, capture-pane,
 * rename-session, select-window, display-message) and runs it
 * through the injectable TmuxExecutor - execFile semantics, no
 * shell, so session names and keys can never be reinterpreted as
 * shell syntax. Listings are parsed from tmux's -F format strings.
 *
 * When no tmux server is running, tmux's own "no server running"
 * stderr is surfaced: list calls return empty lists (matching how
 * tmux itself reports an empty world to scripts that check), and
 * every other call fails with tmux's message.
 */
import { execFile } from "node:child_process";
import type { PaneInfo, SessionInfo, TmuxExecutor, WindowInfo } from "./types.js";

export const VERSION = "0.1.0";

export class ExecFileTmuxExecutor implements TmuxExecutor {
  async run(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile("tmux", args, { timeout: 15000 }, (err, stdout, stderr) => {
        if (err) {
          const msg = (stderr || "").trim() || err.message;
          reject(new Error(`tmux ${args[0]} failed: ${msg}`));
          return;
        }
        resolve(stdout);
      });
    });
  }
}

// Field separator is "|" on purpose: some tmux builds sanitise
// control characters (including tab) in -F format output to "_",
// which corrupts tab-separated parsing. A pipe is printable and
// survives; session/window names containing "|" are the known
// trade-off.
const SESSION_FMT = "#{session_name}|#{session_windows}|#{session_created_string}|#{session_attached}";
const WINDOW_FMT = "#{session_name}|#{window_index}|#{window_name}|#{window_active}";
const PANE_FMT = "#{session_name}|#{window_name}|#{pane_index}|#{pane_active}|#{pane_width}|#{pane_height}|#{pane_current_command}";

function isNoServer(err: unknown): boolean {
  return err instanceof Error && /no server running|no current session|can't find session/i.test(err.message);
}

export class TermMux {
  private readonly exec: TmuxExecutor;
  constructor(exec: TmuxExecutor = new ExecFileTmuxExecutor()) { this.exec = exec; }

  /** Build the pane target string "session:window.pane" parts. */
  private target(session: string, window?: string, pane?: string): string {
    let t = session;
    if (window) t += `:${window}`;
    if (pane) t += `.${pane}`;
    return t;
  }

  async listSessions(): Promise<SessionInfo[]> {
    try {
      const out = await this.exec.run(["list-sessions", "-F", SESSION_FMT]);
      return out.split("\n").filter(Boolean).map((line) => {
        const [name, windows, created, attached] = line.split("|");
        return { name, windows: Number(windows), created, attached: attached === "1" };
      });
    } catch (err) { if (isNoServer(err)) return []; throw err; }
  }

  async createSession(name: string, windowName?: string, startDirectory?: string): Promise<{ session_name: string }> {
    if (!name) throw new Error("session_name is required");
    const args = ["new-session", "-d", "-s", name];
    if (windowName) args.push("-n", windowName);
    if (startDirectory) args.push("-c", startDirectory);
    await this.exec.run(args);
    return { session_name: name };
  }

  async killSession(name: string): Promise<{ session_name: string; killed: true }> {
    await this.exec.run(["kill-session", "-t", name]);
    return { session_name: name, killed: true };
  }

  async listWindows(session: string): Promise<WindowInfo[]> {
    try {
      const out = await this.exec.run(["list-windows", "-t", session, "-F", WINDOW_FMT]);
      return out.split("\n").filter(Boolean).map((line) => {
        const [sess, index, name, active] = line.split("|");
        return { session: sess, index, name, active: active === "1" };
      });
    } catch (err) { if (isNoServer(err)) return []; throw err; }
  }

  async createWindow(session: string, windowName: string, startDirectory?: string): Promise<{ session_name: string; window_name: string }> {
    const args = ["new-window", "-t", session, "-n", windowName];
    if (startDirectory) args.push("-c", startDirectory);
    await this.exec.run(args);
    return { session_name: session, window_name: windowName };
  }

  async killWindow(session: string, windowName: string): Promise<{ session_name: string; window_name: string; killed: true }> {
    await this.exec.run(["kill-window", "-t", this.target(session, windowName)]);
    return { session_name: session, window_name: windowName, killed: true };
  }

  async listPanes(session: string, windowName?: string): Promise<PaneInfo[]> {
    try {
      const args = ["list-panes", "-t", this.target(session, windowName), "-F", PANE_FMT];
      const out = await this.exec.run(args);
      return out.split("\n").filter(Boolean).map((line) => {
        const [sess, win, index, active, width, height, command] = line.split("|");
        return {
          session: sess, window: win, index, active: active === "1",
          width: width ? Number(width) : undefined,
          height: height ? Number(height) : undefined,
          command: command || undefined,
        };
      });
    } catch (err) { if (isNoServer(err)) return []; throw err; }
  }

  async sendKeys(session: string, keys: string, paneTarget?: string, pressEnter = true): Promise<{ session_name: string; keys: string }> {
    if (!keys) throw new Error("keys is required");
    const args = ["send-keys", "-t", this.target(session, undefined, paneTarget), keys];
    if (pressEnter) args.push("Enter");
    await this.exec.run(args);
    return { session_name: session, keys };
  }

  async capturePane(session: string, paneTarget?: string, lines?: number): Promise<{ session_name: string; text: string }> {
    const args = ["capture-pane", "-p", "-t", this.target(session, undefined, paneTarget)];
    if (lines !== undefined) args.push("-S", String(-Math.abs(lines)));
    const out = await this.exec.run(args);
    return { session_name: session, text: out.replace(/\n$/, "") };
  }

  async renameSession(session: string, newName: string): Promise<{ session_name: string; new_name: string }> {
    await this.exec.run(["rename-session", "-t", session, newName]);
    return { session_name: session, new_name: newName };
  }

  async selectWindow(session: string, windowName: string): Promise<{ session_name: string; window_name: string }> {
    await this.exec.run(["select-window", "-t", this.target(session, windowName)]);
    return { session_name: session, window_name: windowName };
  }

  async getSessionInfo(session: string): Promise<SessionInfo> {
    const sessions = await this.listSessions();
    const found = sessions.find((s) => s.name === session);
    if (!found) throw new Error(`Session not found: ${session}`);
    return found;
  }
}
