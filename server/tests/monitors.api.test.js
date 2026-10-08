import "./helpers/env.js";
import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import Monitor from "../models/monitor.model.js";
import CheckResult from "../models/checkResult.model.js";
import Incident from "../models/incident.model.js";
import StatusPage from "../models/statusPage.model.js";
import statusCache from "../utils/statusCache.js";
import { asUser, chain, cookieFor, createStubs, oid } from "./helpers/stubs.js";
import { useMemoryStores } from "./helpers/memory.js";
import { startTestServer } from "./helpers/server.js";

const { default: app } = await import("../app.js");

const userId = oid();
const cookie = cookieFor(userId);
const stubs = createStubs();

let server;
let memory;
let owned;
let created;
let findCalls;
let claimCalls;
let count;

const doc = (extra = {}) => {
  const monitor = {
    _id: oid(),
    user: userId,
    name: "Site",
    url: "https://example.com/",
    method: "GET",
    intervalMinutes: 1,
    timeoutMs: 10000,
    expectedStatusCodes: [200],
    keyword: "",
    failureThreshold: 3,
    isActive: true,
    status: "up",
    consecutiveFailures: 0,
    saves: 0,
    deleted: false,
    ...extra,
  };

  monitor.save = async () => {
    monitor.saves += 1;
  };
  monitor.deleteOne = async () => {
    monitor.deleted = true;
  };
  monitor.toJSON = () => {
    const { save, deleteOne, toJSON, ...plain } = monitor;
    return plain;
  };

  return monitor;
};

const api = {
  get: (path) => request(app).get(path).set("Cookie", cookie),
  post: (path, body) => request(app).post(path).set("Cookie", cookie).send(body),
  patch: (path, body) => request(app).patch(path).set("Cookie", cookie).send(body),
  delete: (path) => request(app).delete(path).set("Cookie", cookie),
};

before(async () => {
  server = await startTestServer();
});

after(async () => {
  await server.close();
});

beforeEach(() => {
  server.reset();
  owned = [];
  created = [];
  findCalls = [];
  claimCalls = [];
  count = 0;
  memory = useMemoryStores();

  stubs.stub(Monitor, "findOne", async (query) => {
    findCalls.push(query);
    return owned.find((m) => String(m._id) === String(query._id) && String(m.user) === String(query.user)) || null;
  });
  stubs.stub(Monitor, "countDocuments", async () => count);
  stubs.stub(Monitor, "create", async (data) => {
    const monitor = { _id: oid(), ...data, encryptedHeaders: "" };
    created.push(data);
    return { ...monitor, toObject: () => ({ ...monitor }) };
  });
  stubs.stub(Monitor, "findOneAndUpdate", async (filter) => {
    claimCalls.push(filter);
    return null;
  });
  stubs.stub(CheckResult, "deleteMany", async () => ({}));
  stubs.stub(Incident, "deleteMany", async () => ({}));
  stubs.stub(StatusPage, "find", () => chain([]));
  stubs.stub(StatusPage, "updateMany", async () => ({}));
  asUserRestore = asUser({ _id: userId, name: "Tester", email: "t@example.com" });
});

let asUserRestore;

afterEach(() => {
  memory.restore();
  stubs.restore();
  asUserRestore();
});

describe("every monitor route needs a login", () => {
  const id = oid();
  const routes = [
    ["get", "/api/monitors"],
    ["post", "/api/monitors"],
    ["get", `/api/monitors/${id}`],
    ["patch", `/api/monitors/${id}`],
    ["patch", `/api/monitors/${id}/toggle`],
    ["get", `/api/monitors/${id}/results`],
    ["get", `/api/monitors/${id}/incidents`],
    ["post", `/api/monitors/${id}/check`],
    ["delete", `/api/monitors/${id}`],
    ["get", "/api/incidents"],
    ["get", `/api/incidents/${id}`],
    ["patch", `/api/incidents/${id}/acknowledge`],
  ];

  for (const [method, path] of routes) {
    it(`${method.toUpperCase()} ${path.replace(String(id), ":id")}`, async () => {
      const res = await request(app)[method](path);

      assert.equal(res.status, 401);
      assert.equal(res.body.success, false);
    });
  }
});

describe("creating a monitor: validation", () => {
  const base = { name: "Shop", url: "https://shop.example.com" };

  const cases = [
    ["no body", {}, "Name and URL are required"],
    ["no name", { url: "https://a.example.com" }, "Name and URL are required"],
    ["no url", { name: "x" }, "Name and URL are required"],
    ["a name that is not a string", { ...base, name: { $ne: null } }, "Name must be 1 to 60 characters"],
    ["a name of spaces", { ...base, name: "    " }, "Name must be 1 to 60 characters"],
    ["a name over 60 characters", { ...base, name: "x".repeat(61) }, "Name must be 1 to 60 characters"],
    ["a url that is an object", { ...base, url: { $gt: "" } }, "Invalid input"],
    ["a url that is not a URL", { ...base, url: "not a url" }, "Invalid URL"],
    ["a url with a different scheme", { ...base, url: "ftp://example.com" }, "URL must start with http:// or https://"],
    ["a url with credentials", { ...base, url: "https://user:pw@example.com" }, "Do not put credentials in the URL"],
    ["a method that is not GET or HEAD", { ...base, method: "POST" }, "Method must be GET or HEAD"],
    ["a lowercase method", { ...base, method: "get" }, "Method must be GET or HEAD"],
    ["an interval of 0", { ...base, intervalMinutes: 0 }, "Interval must be a whole number between 1 and 60 minutes"],
    ["an interval of 61", { ...base, intervalMinutes: 61 }, "Interval must be a whole number between 1 and 60 minutes"],
    ["an interval of 1.5", { ...base, intervalMinutes: 1.5 }, "Interval must be a whole number between 1 and 60 minutes"],
    ["an interval sent as text", { ...base, intervalMinutes: "5" }, "Interval must be a whole number between 1 and 60 minutes"],
    ["an interval that is an object", { ...base, intervalMinutes: { $gt: 0 } }, "Interval must be a whole number between 1 and 60 minutes"],
    ["a timeout of 999", { ...base, timeoutMs: 999 }, "Timeout must be between 1000 and 30000 ms"],
    ["a timeout of 30001", { ...base, timeoutMs: 30001 }, "Timeout must be between 1000 and 30000 ms"],
    ["a threshold of 0", { ...base, failureThreshold: 0 }, "Failure threshold must be between 1 and 10"],
    ["a threshold of 11", { ...base, failureThreshold: 11 }, "Failure threshold must be between 1 and 10"],
    ["no status codes", { ...base, expectedStatusCodes: [] }, "Expected status codes must be 1 to 20 numbers between 100 and 599"],
    ["21 status codes", { ...base, expectedStatusCodes: Array.from({ length: 21 }, (_, i) => 200 + i) }, "Expected status codes must be 1 to 20 numbers between 100 and 599"],
    ["a status code of 99", { ...base, expectedStatusCodes: [99] }, "Expected status codes must be 1 to 20 numbers between 100 and 599"],
    ["a status code of 600", { ...base, expectedStatusCodes: [600] }, "Expected status codes must be 1 to 20 numbers between 100 and 599"],
    ["a status code sent as text", { ...base, expectedStatusCodes: ["200"] }, "Expected status codes must be 1 to 20 numbers between 100 and 599"],
    ["status codes that are not a list", { ...base, expectedStatusCodes: 200 }, "Expected status codes must be 1 to 20 numbers between 100 and 599"],
    ["a keyword over 100 characters", { ...base, keyword: "k".repeat(101) }, "Keyword must be 100 characters or less"],
    ["a keyword that is not a string", { ...base, keyword: 5 }, "Invalid input"],
    ["a keyword with the HEAD method", { ...base, method: "HEAD", keyword: "hello" }, "Keyword check needs the GET method"],
  ];

  for (const [label, body, message] of cases) {
    it(`rejects ${label}`, async () => {
      const res = await api.post("/api/monitors", body);

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.equal(res.body.message, message);
      assert.equal(created.length, 0);
    });
  }

  it("refuses private and local addresses in production", async () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    try {
      for (const url of ["http://localhost:4000", "http://127.0.0.1", "http://10.0.0.5", "http://169.254.169.254/latest/meta-data"]) {
        const res = await api.post("/api/monitors", { ...base, url });

        assert.equal(res.status, 400, url);
        assert.equal(res.body.message, "Private and local addresses are not allowed");
      }

      assert.equal(created.length, 0);
    } finally {
      process.env.NODE_ENV = original;
    }
  });
});

describe("creating a monitor: rules and results", () => {
  it("fills in defaults and normalises the URL and name", async () => {
    const res = await api.post("/api/monitors", { name: "  Shop  ", url: " https://Shop.Example.com " });

    assert.equal(res.status, 201);
    assert.equal(res.body.message, "Monitor created");
    assert.deepEqual(created[0], {
      user: userId,
      name: "Shop",
      url: "https://shop.example.com/",
      method: "GET",
      intervalMinutes: 1,
      timeoutMs: 10000,
      expectedStatusCodes: [200],
      keyword: "",
      failureThreshold: 3,
    });
  });

  it("keeps the values the user chose", async () => {
    await api.post("/api/monitors", {
      name: "API",
      url: "https://api.example.com/health",
      method: "HEAD",
      intervalMinutes: 15,
      timeoutMs: 5000,
      expectedStatusCodes: [200, 401, 403],
      failureThreshold: 5,
    });

    assert.equal(created[0].method, "HEAD");
    assert.equal(created[0].intervalMinutes, 15);
    assert.equal(created[0].timeoutMs, 5000);
    assert.deepEqual(created[0].expectedStatusCodes, [200, 401, 403]);
    assert.equal(created[0].failureThreshold, 5);
  });

  it("ignores fields the user must not set, such as owner, status and headers", async () => {
    await api.post("/api/monitors", {
      name: "Shop",
      url: "https://shop.example.com",
      user: String(oid()),
      status: "down",
      isActive: false,
      consecutiveFailures: 99,
      encryptedHeaders: "x",
      nextCheckAt: "2000-01-01",
      _id: String(oid()),
    });

    assert.equal(String(created[0].user), String(userId));
    assert.deepEqual(Object.keys(created[0]).sort(), [
      "expectedStatusCodes",
      "failureThreshold",
      "intervalMinutes",
      "keyword",
      "method",
      "name",
      "timeoutMs",
      "url",
      "user",
    ]);
  });

  it("allows a 20th monitor but refuses a 21st", async () => {
    count = 19;
    assert.equal((await api.post("/api/monitors", { name: "n", url: "https://a.example.com" })).status, 201);

    count = 20;
    const res = await api.post("/api/monitors", { name: "n", url: "https://b.example.com" });

    assert.equal(res.status, 403);
    assert.equal(res.body.message, "You can have at most 20 monitors");
    assert.equal(created.length, 1);
  });

  it("refuses a URL the user already monitors", async () => {
    Monitor.create = async () => {
      throw Object.assign(new Error("dup"), { code: 11000 });
    };

    const res = await api.post("/api/monitors", { name: "n", url: "https://a.example.com" });

    assert.equal(res.status, 409);
    assert.equal(res.body.message, "You are already monitoring this URL");
  });

  it("never returns the encrypted headers", async () => {
    const res = await api.post("/api/monitors", { name: "n", url: "https://a.example.com" });

    assert.equal(res.body.monitor.encryptedHeaders, undefined);
  });

  it("starts a first check straight away", async () => {
    const res = await api.post("/api/monitors", { name: "n", url: "https://a.example.com" });
    await new Promise((resolve) => setTimeout(resolve, 20));

    assert.equal(claimCalls.length, 1);
    assert.equal(String(claimCalls[0]._id), String(res.body.monitor._id));
  });
});

describe("reading monitors", () => {
  it("returns the list newest first with recent checks and 24 hour uptime", async () => {
    const a = doc({ name: "A" });
    const b = doc({ name: "B" });

    stubs.stub(Monitor, "find", () => ({ sort: async () => [a, b] }));
    stubs.stub(CheckResult, "find", (query) => {
      const rows = Array.from({ length: 30 }, (_, i) => ({ isUp: true, responseTimeMs: 100 + i, checkedAt: new Date(Date.now() - i * 60000) }));
      return chain(String(query.monitor) === String(a._id) ? rows : []);
    });
    stubs.stub(CheckResult, "aggregate", async () => [{ _id: a._id, total: 38, up: 37 }]);

    const res = await api.get("/api/monitors");

    assert.equal(res.status, 200);
    assert.equal(res.body.count, 2);
    assert.equal(res.body.monitors[0].recentChecks.length, 24);
    assert.ok(new Date(res.body.monitors[0].recentChecks[0].checkedAt) < new Date(res.body.monitors[0].recentChecks[23].checkedAt));
    assert.equal(res.body.monitors[0].uptime24h, 97.4);
    assert.deepEqual(res.body.monitors[1].recentChecks, []);
    assert.equal(res.body.monitors[1].uptime24h, null);
  });

  it("returns an empty list for a new user", async () => {
    stubs.stub(Monitor, "find", () => ({ sort: async () => [] }));

    const res = await api.get("/api/monitors");

    assert.equal(res.status, 200);
    assert.deepEqual(res.body.monitors, []);
  });

  it("returns one monitor the user owns, looked up with the user's id", async () => {
    const monitor = doc();
    owned.push(monitor);

    const res = await api.get(`/api/monitors/${monitor._id}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.monitor.name, "Site");
    assert.equal(String(findCalls[0].user), String(userId));
  });

  it("answers 404 for another user's monitor, exactly as for a missing one", async () => {
    owned.push(doc({ user: oid() }));
    const other = owned[0];

    const theirs = await api.get(`/api/monitors/${other._id}`);
    const missing = await api.get(`/api/monitors/${oid()}`);

    assert.equal(theirs.status, 404);
    assert.deepEqual(theirs.body, missing.body);
    assert.equal(theirs.body.message, "Monitor not found");
  });

  it("answers 404 for an id that is not an id, without querying the database", async () => {
    for (const id of ["abc", "123", "undefined", "%7B%22%24ne%22%3Anull%7D"]) {
      const res = await api.get(`/api/monitors/${id}`);

      assert.equal(res.status, 404, id);
    }

    assert.equal(findCalls.length, 0);
  });
});

describe("updating a monitor", () => {
  it("changes only the fields that were sent", async () => {
    const monitor = doc();
    owned.push(monitor);

    const res = await api.patch(`/api/monitors/${monitor._id}`, { name: "Renamed", failureThreshold: 5 });

    assert.equal(res.status, 200);
    assert.equal(res.body.message, "Monitor updated");
    assert.equal(monitor.name, "Renamed");
    assert.equal(monitor.failureThreshold, 5);
    assert.equal(monitor.intervalMinutes, 1);
    assert.equal(monitor.saves, 1);
    assert.equal(monitor.nextCheckAt, undefined);
  });

  it("checks again straight away when the interval changes", async () => {
    const monitor = doc();
    owned.push(monitor);
    const before = Date.now();

    await api.patch(`/api/monitors/${monitor._id}`, { intervalMinutes: 17 });

    assert.equal(monitor.intervalMinutes, 17);
    assert.ok(monitor.nextCheckAt.getTime() >= before);
    assert.ok(monitor.nextCheckAt.getTime() <= Date.now());
  });

  it("never changes the URL", async () => {
    const monitor = doc();
    owned.push(monitor);

    const res = await api.patch(`/api/monitors/${monitor._id}`, { url: "https://evil.example.com", name: "x" });

    assert.equal(res.status, 200);
    assert.equal(monitor.url, "https://example.com/");
  });

  it("never changes the owner, status or active flag", async () => {
    const monitor = doc();
    const owner = monitor.user;
    owned.push(monitor);

    await api.patch(`/api/monitors/${monitor._id}`, { name: "x", user: String(oid()), status: "down", isActive: false, consecutiveFailures: 50 });

    assert.equal(monitor.user, owner);
    assert.equal(monitor.status, "up");
    assert.equal(monitor.isActive, true);
    assert.equal(monitor.consecutiveFailures, 0);
  });

  it("refuses an empty update and an update of only the URL", async () => {
    const monitor = doc();
    owned.push(monitor);

    for (const body of [{}, { url: "https://other.example.com" }, { unknown: 1 }]) {
      const res = await api.patch(`/api/monitors/${monitor._id}`, body);

      assert.equal(res.status, 400);
      assert.equal(res.body.message, "Nothing to update");
    }

    assert.equal(monitor.saves, 0);
  });

  it("validates every field it is given", async () => {
    const monitor = doc();
    owned.push(monitor);

    for (const [body, message] of [
      [{ name: "" }, "Name must be 1 to 60 characters"],
      [{ intervalMinutes: 0 }, "Interval must be a whole number between 1 and 60 minutes"],
      [{ timeoutMs: 50000 }, "Timeout must be between 1000 and 30000 ms"],
      [{ failureThreshold: 20 }, "Failure threshold must be between 1 and 10"],
      [{ expectedStatusCodes: [] }, "Expected status codes must be 1 to 20 numbers between 100 and 599"],
      [{ method: "PUT" }, "Method must be GET or HEAD"],
    ]) {
      const res = await api.patch(`/api/monitors/${monitor._id}`, body);

      assert.equal(res.status, 400);
      assert.equal(res.body.message, message);
    }

    assert.equal(monitor.saves, 0);
  });

  it("refuses to combine a keyword with the HEAD method in either order", async () => {
    const withKeyword = doc({ keyword: "hello" });
    const withHead = doc({ method: "HEAD" });
    owned.push(withKeyword, withHead);

    const first = await api.patch(`/api/monitors/${withKeyword._id}`, { method: "HEAD" });
    const second = await api.patch(`/api/monitors/${withHead._id}`, { keyword: "hello" });

    assert.equal(first.status, 400);
    assert.equal(second.status, 400);
    assert.equal(first.body.message, "Keyword check needs the GET method");
  });

  it("can clear the keyword", async () => {
    const monitor = doc({ keyword: "hello" });
    owned.push(monitor);

    await api.patch(`/api/monitors/${monitor._id}`, { keyword: "" });

    assert.equal(monitor.keyword, "");
  });

  it("answers 404 for someone else's monitor and changes nothing", async () => {
    const monitor = doc({ user: oid() });
    owned.push(monitor);

    const res = await api.patch(`/api/monitors/${monitor._id}`, { name: "hijacked" });

    assert.equal(res.status, 404);
    assert.equal(monitor.name, "Site");
    assert.equal(monitor.saves, 0);
  });
});

describe("pausing and resuming", () => {
  it("pauses an active monitor without checking it", async () => {
    const monitor = doc();
    owned.push(monitor);

    const res = await api.patch(`/api/monitors/${monitor._id}/toggle`);

    assert.equal(res.body.message, "Monitor paused");
    assert.equal(monitor.isActive, false);
    assert.equal(monitor.saves, 1);
    assert.equal(claimCalls.length, 0);
  });

  it("resumes a paused monitor and checks it straight away", async () => {
    const monitor = doc({ isActive: false });
    owned.push(monitor);

    const res = await api.patch(`/api/monitors/${monitor._id}/toggle`);
    await new Promise((resolve) => setTimeout(resolve, 20));

    assert.equal(res.body.message, "Monitor resumed");
    assert.equal(monitor.isActive, true);
    assert.ok(monitor.nextCheckAt instanceof Date);
    assert.equal(claimCalls.length, 1);
  });

  it("answers 404 for someone else's monitor", async () => {
    const monitor = doc({ user: oid() });
    owned.push(monitor);

    assert.equal((await api.patch(`/api/monitors/${monitor._id}/toggle`)).status, 404);
    assert.equal(monitor.isActive, true);
  });
});

describe("deleting a monitor", () => {
  it("deletes it together with its checks and incidents and removes it from status pages", async () => {
    const monitor = doc();
    owned.push(monitor);
    const calls = { checks: null, incidents: null, pulled: null };

    stubs.stub(CheckResult, "deleteMany", async (query) => {
      calls.checks = query;
    });
    stubs.stub(Incident, "deleteMany", async (query) => {
      calls.incidents = query;
    });
    stubs.stub(StatusPage, "updateMany", async (query, update) => {
      calls.pulled = { query, update };
    });

    const res = await api.delete(`/api/monitors/${monitor._id}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.message, "Monitor deleted");
    assert.equal(monitor.deleted, true);
    assert.equal(String(calls.checks.monitor), String(monitor._id));
    assert.equal(String(calls.incidents.monitor), String(monitor._id));
    assert.equal(String(calls.pulled.update.$pull.monitors), String(monitor._id));
  });

  it("clears the cached public page of any status page it was on", async () => {
    const monitor = doc();
    owned.push(monitor);
    stubs.stub(StatusPage, "find", () => chain([{ slug: "acme" }]));
    statusCache.set("acme", { cached: true });

    await api.delete(`/api/monitors/${monitor._id}`);

    assert.equal(statusCache.get("acme"), null);
  });

  it("answers 404 for someone else's monitor and deletes nothing", async () => {
    const monitor = doc({ user: oid() });
    owned.push(monitor);
    let deleted = false;
    stubs.stub(CheckResult, "deleteMany", async () => {
      deleted = true;
    });

    const res = await api.delete(`/api/monitors/${monitor._id}`);

    assert.equal(res.status, 404);
    assert.equal(monitor.deleted, false);
    assert.equal(deleted, false);
  });
});

describe("checking now", () => {
  it("runs a real check, stores it and returns the result", async () => {
    const monitor = doc({ url: `${server.base}/ok`, status: "unknown" });
    owned.push(monitor);

    const res = await api.post(`/api/monitors/${monitor._id}/check`);

    assert.equal(res.status, 200);
    assert.equal(res.body.message, "Check passed");
    assert.equal(res.body.result.isUp, true);
    assert.equal(res.body.result.statusCode, 200);
    assert.equal(res.body.monitor.status, "up");
    assert.equal(memory.store.results.length, 1);
  });

  it("reports a failed check", async () => {
    const monitor = doc({ url: `${server.base}/error` });
    owned.push(monitor);

    const res = await api.post(`/api/monitors/${monitor._id}/check`);

    assert.equal(res.status, 200);
    assert.equal(res.body.message, "Check failed");
    assert.equal(res.body.result.errorMessage, "Unexpected status 500");
  });

  it("refuses to check a paused monitor", async () => {
    const monitor = doc({ isActive: false });
    owned.push(monitor);

    const res = await api.post(`/api/monitors/${monitor._id}/check`);

    assert.equal(res.status, 400);
    assert.equal(res.body.message, "Resume the monitor before checking it");
  });

  it("makes the user wait ten seconds between checks", async () => {
    const monitor = doc({ url: `${server.base}/ok`, lastCheckedAt: new Date(Date.now() - 3000) });
    owned.push(monitor);

    const res = await api.post(`/api/monitors/${monitor._id}/check`);

    assert.equal(res.status, 429);
    assert.equal(res.body.message, "Wait a few seconds before checking again");
    assert.equal(server.state.hits, 0);
  });

  it("allows a check after the cooldown", async () => {
    const monitor = doc({ url: `${server.base}/ok`, lastCheckedAt: new Date(Date.now() - 11000) });
    owned.push(monitor);

    assert.equal((await api.post(`/api/monitors/${monitor._id}/check`)).status, 200);
  });

  it("answers 404 for someone else's monitor", async () => {
    const monitor = doc({ user: oid(), url: `${server.base}/ok` });
    owned.push(monitor);

    assert.equal((await api.post(`/api/monitors/${monitor._id}/check`)).status, 404);
    assert.equal(server.state.hits, 0);
  });
});

describe("results", () => {
  const stubResults = (rows = [], stats = []) => {
    const limits = [];

    stubs.stub(CheckResult, "find", () => {
      const query = {
        sort: () => query,
        limit: (n) => {
          limits.push(n);
          return query;
        },
        then: (resolve, reject) => Promise.resolve(rows).then(resolve, reject),
      };
      return query;
    });
    stubs.stub(CheckResult, "aggregate", async () => stats);

    return limits;
  };

  it("returns the latest checks with 24 hour statistics", async () => {
    const monitor = doc();
    owned.push(monitor);
    stubResults([{ isUp: true }], [{ total: 3, up: 2, avgMs: 150.6 }]);

    const res = await api.get(`/api/monitors/${monitor._id}/results`);

    assert.equal(res.status, 200);
    assert.equal(res.body.results.length, 1);
    assert.deepEqual(res.body.last24h, { checks: 3, uptimePercent: 66.67, avgResponseTimeMs: 151 });
  });

  it("returns nulls when there are no checks yet", async () => {
    const monitor = doc();
    owned.push(monitor);
    stubResults();

    const res = await api.get(`/api/monitors/${monitor._id}/results`);

    assert.deepEqual(res.body.last24h, { checks: 0, uptimePercent: null, avgResponseTimeMs: null });
  });

  it("keeps the limit between 1 and 200 and defaults to 50", async () => {
    const monitor = doc();
    owned.push(monitor);
    const limits = stubResults();

    for (const query of ["", "?limit=10", "?limit=0", "?limit=-5", "?limit=1000", "?limit=abc", "?limit=200"]) {
      await api.get(`/api/monitors/${monitor._id}/results${query}`);
    }

    assert.deepEqual(limits, [50, 10, 50, 1, 200, 50, 200]);
  });

  it("answers 404 for someone else's monitor", async () => {
    const monitor = doc({ user: oid() });
    owned.push(monitor);
    stubResults();

    assert.equal((await api.get(`/api/monitors/${monitor._id}/results`)).status, 404);
  });
});

describe("incidents", () => {
  let found;
  let counted;
  let updates;
  let incident;

  const incidentDoc = (extra = {}) => ({ _id: oid(), user: userId, monitor: { _id: oid(), name: "Site" }, status: "open", isResolved: false, ...extra });

  beforeEach(() => {
    found = [];
    counted = 0;
    updates = [];
    incident = null;

    stubs.stub(Incident, "find", (filter) => {
      findCalls.push(filter);
      const query = {
        sort: () => query,
        skip: (n) => {
          findCalls.push({ skip: n });
          return query;
        },
        limit: (n) => {
          findCalls.push({ limit: n });
          return query;
        },
        populate: () => query,
        then: (resolve, reject) => Promise.resolve(found).then(resolve, reject),
      };
      return query;
    });
    stubs.stub(Incident, "countDocuments", async () => counted);
    stubs.stub(Incident, "findOneAndUpdate", (filter, update) => {
      updates.push({ filter, update });
      return { populate: async () => incident };
    });
    stubs.stub(Incident, "findOne", (filter) => {
      findCalls.push(filter);
      const query = { populate: () => query, then: (resolve, reject) => Promise.resolve(incident).then(resolve, reject) };
      return query;
    });
  });

  it("lists the user's incidents with paging", async () => {
    found = [incidentDoc(), incidentDoc()];
    counted = 45;

    const res = await api.get("/api/incidents?page=2&limit=20");

    assert.equal(res.status, 200);
    assert.equal(res.body.total, 45);
    assert.equal(res.body.page, 2);
    assert.equal(res.body.pages, 3);
    assert.deepEqual(findCalls.slice(1), [{ skip: 20 }, { limit: 20 }]);
    assert.equal(String(findCalls[0].user), String(userId));
  });

  it("maps each status filter to the right query", async () => {
    const expected = {
      active: { isResolved: false },
      open: { status: "open" },
      acknowledged: { status: "acknowledged" },
      resolved: { status: "resolved" },
    };

    for (const [status, filter] of Object.entries(expected)) {
      findCalls.length = 0;
      await api.get(`/api/incidents?status=${status}`);

      assert.deepEqual({ ...findCalls[0], user: undefined }, { ...filter, user: undefined });
      for (const [key, value] of Object.entries(filter)) assert.equal(findCalls[0][key], value);
    }

    findCalls.length = 0;
    await api.get("/api/incidents?status=all");
    assert.deepEqual(Object.keys(findCalls[0]), ["user"]);
  });

  it("refuses an unknown status filter, including names that exist on every JavaScript object", async () => {
    for (const query of ["?status=bogus", "?status=constructor", "?status=toString", "?status=__proto__", "?status=hasOwnProperty", "?status=ACTIVE", "?status="]) {
      const res = await api.get(`/api/incidents${query}`);

      assert.equal(res.status, 400, query);
      assert.equal(res.body.message, "Status must be active, open, acknowledged, resolved or all");
    }
  });

  it("does not let query operators into the filter", async () => {
    for (const query of ["?status[$ne]=x", "?monitor[$ne]=x", "?user=abc", "?isResolved=true"]) {
      findCalls.length = 0;
      const res = await api.get(`/api/incidents${query}`);

      assert.ok(res.status === 200 || res.status === 400, query);
      assert.equal(String(findCalls[0]?.user ?? userId), String(userId));
      assert.equal(findCalls[0] && "isResolved" in findCalls[0], false, query);
    }
  });

  it("refuses a monitor filter that is not an id", async () => {
    const res = await api.get("/api/incidents?monitor=abc");

    assert.equal(res.status, 400);
    assert.equal(res.body.message, "Invalid monitor id");
  });

  it("keeps the page size between 1 and 50", async () => {
    for (const [query, size] of [["", 20], ["?limit=0", 20], ["?limit=999", 50], ["?limit=-3", 1], ["?limit=7", 7]]) {
      findCalls.length = 0;
      await api.get(`/api/incidents${query}`);

      assert.deepEqual(findCalls.find((call) => "limit" in call), { limit: size }, query);
    }
  });

  it("acknowledges an open incident", async () => {
    incident = incidentDoc({ status: "acknowledged" });
    const id = oid();

    const res = await api.patch(`/api/incidents/${id}/acknowledge`);

    assert.equal(res.status, 200);
    assert.equal(res.body.message, "Incident acknowledged");
    assert.deepEqual(updates[0].filter, { _id: String(id), user: userId, status: "open" });
    assert.equal(updates[0].update.$set.status, "acknowledged");
    assert.ok(updates[0].update.$set.acknowledgedAt instanceof Date);
  });

  it("explains why an incident cannot be acknowledged again", async () => {
    stubs.stub(Incident, "findOneAndUpdate", () => ({ populate: async () => null }));
    incident = { status: "acknowledged" };
    assert.equal((await api.patch(`/api/incidents/${oid()}/acknowledge`)).body.message, "Incident is already acknowledged");

    incident = { status: "resolved" };
    const res = await api.patch(`/api/incidents/${oid()}/acknowledge`);

    assert.equal(res.status, 400);
    assert.equal(res.body.message, "Incident is already resolved");
  });

  it("answers 404 for another user's incident or a bad id", async () => {
    stubs.stub(Incident, "findOneAndUpdate", () => ({ populate: async () => null }));
    incident = null;

    assert.equal((await api.patch(`/api/incidents/${oid()}/acknowledge`)).status, 404);
    assert.equal((await api.patch("/api/incidents/abc/acknowledge")).status, 404);
    assert.equal((await api.get(`/api/incidents/${oid()}`)).status, 404);
    assert.equal((await api.get("/api/incidents/abc")).status, 404);
  });

  it("looks incidents up only within the user's own", async () => {
    incident = null;
    await api.get(`/api/incidents/${oid()}`);

    assert.equal(String(findCalls.at(-1).user), String(userId));
  });
});
