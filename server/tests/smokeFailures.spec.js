import "./helpers/env.js";
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { freePort, startTestServer } from "./helpers/server.js";
import { installMemoryApp } from "./helpers/memoryApp.js";
import { listen, runScript, stopServer } from "./helpers/smoke.js";

const { default: app } = await import("../app.js");

describe("smoke test script when something is wrong", () => {
  let target;
  let server;
  let memory;

  before(async () => {
    target = await startTestServer();
    memory = installMemoryApp();
    server = await listen(app);
  });

  after(async () => {
    await stopServer(server);
    memory.restore();
    await target.close();
  });

  it("fails clearly when nothing runs the checks, and still cleans up", async () => {
    memory.controls.claimsDisabled = true;

    const base = `http://127.0.0.1:${server.address().port}`;
    const { code, output } = await runScript([base, `--target=${target.base}/ok`], { SMOKE_CHECK_TIMEOUT_MS: "3500", SMOKE_COOLDOWN_MS: "0" });

    memory.controls.claimsDisabled = false;

    assert.equal(code, 1, output);
    assert.match(output, /\[FAIL\] The server checks it by itself.*no check in 4 s\. Is the server asleep, or is DISABLE_SCHEDULER set\?/);
    assert.match(output, /Failed:\n  - The server checks it by itself/);
    assert.match(output, /Cleaned up: 2 monitor\(s\) deleted/);
  });

  it("fails and says so when the app is not reachable", async () => {
    const port = await freePort();
    const { code, output } = await runScript([`http://127.0.0.1:${port}`]);

    assert.equal(code, 1, output);
    assert.match(output, /\[FAIL\] API answers the health check/);
    assert.match(output, /\d+ failed/);
  });

  it("reports a site that blocks the checker, naming the monitored address", async () => {
    const base = `http://127.0.0.1:${server.address().port}`;
    const { code, output } = await runScript([base, `--target=${target.base}/error`], { SMOKE_COOLDOWN_MS: "0", SMOKE_CHECK_TIMEOUT_MS: "15000" });

    assert.equal(code, 1, output);
    assert.match(output, /\[FAIL\] The server checks it by itself.*the monitor is (unknown|up|down)/);
  });

  it("prints how to use it when no address is given", async () => {
    const { code, output } = await runScript([]);

    assert.equal(code, 1);
    assert.match(output, /Usage: node scripts\/smokeTest\.mjs <address>/);
    assert.match(output, /--target/);
    assert.match(output, /--demo/);
  });
});
