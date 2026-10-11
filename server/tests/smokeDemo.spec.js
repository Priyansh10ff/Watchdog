import "./helpers/env.js";
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { runDueChecks } from "../jobs/scheduler.js";
import { startDemoServer, startTestServer } from "./helpers/server.js";
import { installMemoryApp } from "./helpers/memoryApp.js";
import { listen, runScript, stopServer } from "./helpers/smoke.js";

const { default: app } = await import("../app.js");

describe("smoke test script with the demo target", () => {
  let target;
  let demo;
  let server;
  let memory;
  let ticker;

  before(async () => {
    target = await startTestServer();
    demo = await startDemoServer();
    memory = installMemoryApp({ fastMonitors: (monitor) => monitor.name === "Smoke demo" });
    server = await listen(app);
    ticker = setInterval(() => runDueChecks().catch(() => {}), 500);
  });

  after(async () => {
    clearInterval(ticker);
    await runDueChecks().catch(() => {});
    await stopServer(server);
    memory.restore();
    await target.close();
    await demo.close();
  });

  it("breaks the demo site, sees one incident opened and acknowledged, then sees it resolved with a duration", async () => {
    const base = `http://127.0.0.1:${server.address().port}`;
    const { code, output } = await runScript([base, `--target=${target.base}/ok`, `--demo=${demo.base}`], { SMOKE_COOLDOWN_MS: "10500" });

    assert.equal(code, 0, output);
    assert.match(output, /\[ ok \] The demo site wakes up and starts in the up state/);
    assert.match(output, /\[ ok \] A monitor for the demo site becomes up/);
    assert.match(output, /\[ ok \] Breaking the demo site opens exactly one incident\s+opened after \d+ s: Unexpected status 503/);
    assert.match(output, /\[ ok \] The incident can be acknowledged/);
    assert.match(output, /\[ ok \] Restoring the demo site resolves the incident with its duration\s+resolved after \d+ s, it lasted \d+ s/);
    assert.match(output, /Cleaned up: 3 monitor\(s\) deleted/);
    assert.equal(demo.state.mode, "up", "the demo site must be left in the up state");
    assert.equal(memory.db.incidents.length, 0, "deleting the monitors removes their incidents");
  });
});
