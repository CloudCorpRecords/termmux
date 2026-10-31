import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TermMux } from "../src/tmux.js";
import type { TmuxExecutor } from "../src/types.js";

class FakeTmux implements TmuxExecutor {
  calls: string[][] = [];
  constructor(private readonly responses: Record<string, string> = {}) {}
  async run(args: string[]): Promise<string> {
    this.calls.push(args);
    const key = args[0];
    if (key in this.responses) return this.responses[key];
    if (key === "list-sessions") throw new Error("tmux list-sessions failed: no server running on /tmp/tmux-0/default");
    return "";
  }
}

const SESSIONS = "work|3|Mon Oct 26 09:00:00 2026|1\nplay|1|Mon Oct 26 08:00:00 2026|0\n";

describe("termmux core", () => {
  it("listSessions parses the pipe-separated format output", async () => {
    const mux = new TermMux(new FakeTmux({ "list-sessions": SESSIONS }));
    const sessions = await mux.listSessions();
    assert.equal(sessions.length, 2);
    assert.deepEqual(sessions[0], { name: "work", windows: 3, created: "Mon Oct 26 09:00:00 2026", attached: true });
    assert.equal(sessions[1].attached, false);
  });
  it("listSessions returns [] when no tmux server is running", async () => {
    const mux = new TermMux(new FakeTmux());
    assert.deepEqual(await mux.listSessions(), []);
  });
  it("createSession builds a detached new-session arg array, never a shell string", async () => {
    const fake = new FakeTmux(); const mux = new TermMux(fake);
    await mux.createSession("dev", "editor", "/home/user/proj");
    assert.deepEqual(fake.calls[0].slice(0, 4), ["new-session", "-d", "-s", "dev"]);
    assert.ok(fake.calls[0].includes("-n")); assert.ok(fake.calls[0].includes("editor"));
    assert.ok(fake.calls[0].includes("-c")); assert.ok(fake.calls[0].includes("/home/user/proj"));
  });
  it("createSession requires a name", async () => {
    const mux = new TermMux(new FakeTmux());
    await assert.rejects(() => mux.createSession(""), /session_name is required/);
  });
  it("killSession targets the named session", async () => {
    const fake = new FakeTmux(); const mux = new TermMux(fake);
    assert.deepEqual(await mux.killSession("dev"), { session_name: "dev", killed: true });
    assert.deepEqual(fake.calls[0], ["kill-session", "-t", "dev"]);
  });
  it("listWindows parses index, name and active flag", async () => {
    const mux = new TermMux(new FakeTmux({ "list-windows": "work|0|editor|1\nwork|1|shell|0\n" }));
    const wins = await mux.listWindows("work");
    assert.equal(wins.length, 2); assert.equal(wins[0].active, true); assert.equal(wins[1].name, "shell");
  });
  it("createWindow and killWindow build session:window targets", async () => {
    const fake = new FakeTmux(); const mux = new TermMux(fake);
    await mux.createWindow("work", "logs");
    assert.deepEqual(fake.calls[0], ["new-window", "-t", "work", "-n", "logs"]);
    await mux.killWindow("work", "logs");
    assert.deepEqual(fake.calls[1], ["kill-window", "-t", "work:logs"]);
  });
  it("listPanes parses pane geometry and command", async () => {
    const mux = new TermMux(new FakeTmux({ "list-panes": "work|editor|0|1|120|40|vim\n" }));
    const panes = await mux.listPanes("work", "editor");
    assert.equal(panes[0].width, 120); assert.equal(panes[0].command, "vim"); assert.equal(panes[0].active, true);
  });
  it("sendKeys appends Enter by default and targets a pane when given", async () => {
    const fake = new FakeTmux(); const mux = new TermMux(fake);
    await mux.sendKeys("work", "npm test", "1");
    assert.deepEqual(fake.calls[0], ["send-keys", "-t", "work.1", "npm test", "Enter"]);
    await mux.sendKeys("work", "C-c", undefined, false);
    assert.deepEqual(fake.calls[1], ["send-keys", "-t", "work", "C-c"]);
  });
  it("capturePane requests printed output and a negative scrollback when lines given", async () => {
    const fake = new FakeTmux({ "capture-pane": "hello pane\n" }); const mux = new TermMux(fake);
    const r = await mux.capturePane("work", undefined, 50);
    assert.equal(r.text, "hello pane");
    assert.ok(fake.calls[0].includes("-S")); assert.ok(fake.calls[0].includes("-50"));
  });
  it("renameSession and selectWindow build the right arg arrays", async () => {
    const fake = new FakeTmux(); const mux = new TermMux(fake);
    await mux.renameSession("old", "new");
    assert.deepEqual(fake.calls[0], ["rename-session", "-t", "old", "new"]);
    await mux.selectWindow("work", "logs");
    assert.deepEqual(fake.calls[1], ["select-window", "-t", "work:logs"]);
  });
  it("getSessionInfo finds a session and rejects an unknown one", async () => {
    const mux = new TermMux(new FakeTmux({ "list-sessions": SESSIONS }));
    assert.equal((await mux.getSessionInfo("play")).windows, 1);
    await assert.rejects(() => mux.getSessionInfo("nope"), /Session not found: nope/);
  });
  it("non-list calls surface tmux's own error (no fake success)", async () => {
    const mux = new TermMux(new FakeTmux({ "kill-session": "" }));
    // kill-session returns "" from the fake (success); use a failing executor instead:
    const failing = new TermMux({ async run() { throw new Error("tmux kill-session failed: can't find session: ghost"); } });
    await assert.rejects(() => failing.killSession("ghost"), /can't find session: ghost/);
    assert.ok(mux);
  });
});
