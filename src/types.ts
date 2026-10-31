/**
 * termmux types.
 *
 * The core talks to tmux only through the TmuxExecutor interface:
 * run an argument array (never a shell string) and get stdout back.
 * The default executor uses child_process.execFile on the real
 * `tmux` binary; tests inject a fake that records the argument
 * arrays and returns canned listings.
 */

/** Runs `tmux <args...>` and resolves with stdout. Throws on non-zero exit. */
export interface TmuxExecutor {
  run(args: string[]): Promise<string>;
}

export interface SessionInfo {
  name: string;
  windows: number;
  created: string;
  attached: boolean;
}

export interface WindowInfo {
  session: string;
  index: string;
  name: string;
  active: boolean;
}

export interface PaneInfo {
  session: string;
  window: string;
  index: string;
  active: boolean;
  width?: number;
  height?: number;
  command?: string;
}
