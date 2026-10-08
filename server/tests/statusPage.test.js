import "./helpers/env.js";
import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import Monitor from "../models/monitor.model.js";
import CheckResult from "../models/checkResult.model.js";
import Incident from "../models/incident.model.js";
import StatusPage from "../models/statusPage.model.js";
import statusCache from "../utils/statusCache.js";
import { deleteMyStatusPage, getMyStatusPage, getPublicStatus, saveMyStatusPage } from "../controllers/status.controller.js";
import { asUser, chain, cookieFor, createStubs, mockRes, oid, quiet } from "./helpers/stubs.js";

const { default: app } = await import("../app.js");

const stubs = createStubs();
const user = oid();
const other = oid();

const mon = (name, extra = {}) =>
  Monitor.hydrate(
    {
      _id: oid(),
      user,
      name,
      url: `https://${name.toLowerCase()}.secret-internal.example.com/health?token=abc123`,
      isActive: true,
      status: "up",
      lastResponseTimeMs: 120,
      lastCheckedAt: new Date(),
      ...extra,
    },
    { encryptedHeaders: 0 },
  );

let web;
let api;
let shop;
let old;
let all;
let pages;
let db;

const days = (d) => new Date(Date.now() - d * 86400000);

beforeEach(() => {
  statusCache.clear();
  web = mon("Website");
  api = mon("API", { status: "down" });
  shop = mon("Shop", { lastResponseTimeMs: 2500 });
  old = mon("Old", { isActive: false });
  all = [web, api, shop, old];
  pages = [];
  db = { pageLookups: 0, monitorFinds: 0, incidentFinds: 0, historyFinds: 0 };

  stubs.stub(StatusPage, "findOne", (query) => {
    db.pageLookups += 1;
    const page = pages.find((p) =>
      query.slug ? p.slug === query.slug && (query.isPublished === undefined || p.isPublished === query.isPublished) : String(p.user) === String(query.user),
    );
    const result = page ? { ...page } : null;
    const q = { select: () => q, lean: async () => result, then: (resolve, reject) => Promise.resolve(result).then(resolve, reject) };
    return q;
  });
  stubs.stub(StatusPage, "findOneAndUpdate", async (query, update) => {
    const clash = pages.find((p) => p.slug === update.slug && String(p.user) !== String(query.user));
    if (clash) throw Object.assign(new Error("dup"), { code: 11000 });
    let page = pages.find((p) => String(p.user) === String(query.user));
    if (!page) {
      page = { user: query.user };
      pages.push(page);
    }
    Object.assign(page, update);
    return { ...page };
  });
  stubs.stub(StatusPage, "findOneAndDelete", async (query) => {
    const index = pages.findIndex((p) => String(p.user) === String(query.user));
    return index < 0 ? null : pages.splice(index, 1)[0];
  });
  stubs.stub(Monitor, "find", (query) => {
    db.monitorFinds += 1;
    let rows = all;
    if (query._id && query._id.$in) rows = all.filter((m) => query._id.$in.map(String).includes(String(m._id)));
    if (query.user) rows = rows.filter((m) => String(m.user) === String(query.user));
    const q = { sort: () => q, select: () => q, then: (resolve, reject) => Promise.resolve(rows).then(resolve, reject) };
    return q;
  });
  stubs.stub(CheckResult, "find", (query) => {
    db.historyFinds += 1;
    const rows = Array.from({ length: 40 }, (_, i) => ({
      isUp: String(query.monitor) !== String(api._id) || i > 2,
      responseTimeMs: 100 + i,
      checkedAt: new Date(Date.now() - i * 60000),
    }));
    return chain(rows);
  });
  stubs.stub(CheckResult, "aggregate", async () => [
    { _id: web._id, total: 100, up: 100 },
    { _id: api._id, total: 100, up: 97 },
  ]);
  stubs.stub(Incident, "find", () => {
    db.incidentFinds += 1;
    return chain([
      { monitor: api._id, status: "open", startedAt: days(0.1), cause: { errorMessage: "Connection refused to 10.0.0.5" } },
      { monitor: web._id, status: "resolved", startedAt: days(3), resolvedAt: days(2.99), durationMs: 900000, cause: { errorMessage: "secret" } },
    ]);
  });
});

afterEach(() => {
  stubs.restore();
  mock.timers.reset();
});

const save = async (body, as = user) => {
  const res = mockRes();
  await saveMyStatusPage({ user: { _id: as }, body }, res);
  return res;
};

const publicStatus = async (slug) => {
  const res = mockRes();
  await getPublicStatus({ params: { slug } }, res);
  return res;
};

const publish = (extra = {}) => {
  pages.push({ user, slug: "acme", title: "Acme status", monitors: [api._id, web._id, shop._id, old._id], isPublished: true, ...extra });
};

describe("saving a status page: validation", () => {
  const bad = [
    ["a slug that is too short", { slug: "ab", title: "T", monitors: [] }],
    ["a slug with a space", { slug: "my page", title: "T", monitors: [] }],
    ["a slug that starts with a hyphen", { slug: "-abc", title: "T", monitors: [] }],
    ["a slug that ends with a hyphen", { slug: "abc-", title: "T", monitors: [] }],
    ["a slug over 40 characters", { slug: "a".repeat(41), title: "T", monitors: [] }],
    ["a slug with symbols", { slug: "abc$def", title: "T", monitors: [] }],
    ["a slug with a path", { slug: "../etc", title: "T", monitors: [] }],
    ["a slug that is an object", { slug: { $gt: "" }, title: "T", monitors: [] }],
    ["an empty title", { slug: "abc", title: "   ", monitors: [] }],
    ["a title over 60 characters", { slug: "abc", title: "x".repeat(61), monitors: [] }],
    ["a title that is not a string", { slug: "abc", title: 5, monitors: [] }],
    ["monitors that are not a list", { slug: "abc", title: "T", monitors: "all" }],
    ["more than 20 monitors", { slug: "abc", title: "T", monitors: Array.from({ length: 21 }, () => String(oid())) }],
    ["an id that is not an id", { slug: "abc", title: "T", monitors: ["123"] }],
    ["an id that is an object", { slug: "abc", title: "T", monitors: [{ $ne: null }] }],
    ["isPublished that is not true or false", { slug: "abc", title: "T", monitors: [], isPublished: "yes" }],
    ["showDomains that is not true or false", { slug: "abc", title: "T", monitors: [], showDomains: "yes" }],
    ["showDomains that is an object", { slug: "abc", title: "T", monitors: [], showDomains: { $ne: null } }],
    ["no body", undefined],
  ];

  for (const [label, body] of bad) {
    it(`rejects ${label}`, async () => {
      const res = await save(body);

      assert.equal(res.statusCode, 400);
      assert.equal(res.body.success, false);
      assert.equal(pages.length, 0);
    });
  }

  it("rejects a monitor that does not exist", async () => {
    const res = await save({ slug: "abc", title: "T", monitors: [String(oid())] });

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.message, "One or more monitors were not found");
  });

  it("rejects another user's monitor", async () => {
    const res = await save({ slug: "abc", title: "T", monitors: [String(web._id)] }, other);

    assert.equal(res.statusCode, 400);
    assert.equal(pages.length, 0);
  });
});

describe("saving a status page: results", () => {
  it("creates one page, lowercasing and trimming the link and title and collapsing duplicates", async () => {
    const res = await save({ slug: "  My-Site ", title: "  Acme status ", monitors: [String(web._id), String(api._id), String(web._id)] });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.page.slug, "my-site");
    assert.equal(res.body.page.title, "Acme status");
    assert.equal(res.body.page.monitors.length, 2);
    assert.equal(res.body.page.isPublished, true);
    assert.equal(res.body.page.showDomains, false);
  });

  it("updates the same page instead of making another", async () => {
    await save({ slug: "abc", title: "One", monitors: [] });
    const res = await save({ slug: "abc", title: "Two", monitors: [], isPublished: false, showDomains: true });

    assert.equal(pages.length, 1);
    assert.equal(res.body.page.title, "Two");
    assert.equal(res.body.page.isPublished, false);
    assert.equal(res.body.page.showDomains, true);
  });

  it("refuses a link another user already has", async () => {
    pages.push({ user: other, slug: "taken", title: "x", monitors: [], isPublished: true });

    const res = await save({ slug: "taken", title: "T", monitors: [] });

    assert.equal(res.statusCode, 409);
    assert.equal(res.body.message, "That link is already taken");
  });

  it("returns null before a page exists and the page afterwards", async () => {
    const empty = mockRes();
    await getMyStatusPage({ user: { _id: user } }, empty);
    assert.equal(empty.body.page, null);

    await save({ slug: "abc", title: "T", monitors: [String(web._id)] });
    const filled = mockRes();
    await getMyStatusPage({ user: { _id: user } }, filled);

    assert.equal(filled.body.page.slug, "abc");
    assert.equal(filled.body.page.monitors.length, 1);
  });

  it("deletes the page, then answers 404 the second time", async () => {
    await save({ slug: "abc", title: "T", monitors: [] });

    const first = mockRes();
    await deleteMyStatusPage({ user: { _id: user } }, first);
    const second = mockRes();
    await deleteMyStatusPage({ user: { _id: user } }, second);

    assert.equal(first.statusCode, 200);
    assert.equal(second.statusCode, 404);
    assert.equal(pages.length, 0);
  });

  it("hides the details of a database error", async () => {
    stubs.stub(StatusPage, "findOneAndUpdate", async () => {
      throw new Error("mongodb://secret");
    });

    const res = await quiet(() => save({ slug: "abc", title: "T", monitors: [] }));

    assert.equal(res.statusCode, 500);
    assert.ok(!JSON.stringify(res.body).includes("mongodb"));
  });
});

describe("the public page", () => {
  it("lists the monitors in the owner's order with their states", async () => {
    publish();
    const { body } = await publicStatus("acme");

    assert.equal(body.page.title, "Acme status");
    assert.deepEqual(body.monitors.map((m) => m.name), ["API", "Website", "Shop", "Old"]);
    assert.deepEqual(body.monitors.map((m) => m.status), ["down", "up", "slow", "paused"]);
  });

  it("never exposes URLs, ids, causes or error messages", async () => {
    publish();
    const { body } = await publicStatus("acme");
    const text = JSON.stringify(body);

    for (const secret of ["secret-internal", "token=abc123", "/health", "10.0.0.5", "Connection refused", "failedChecks", "cause"]) {
      assert.ok(!text.includes(secret), secret);
    }

    assert.equal("_id" in body.monitors[0], false);
    assert.equal("url" in body.monitors[0], false);
  });

  it("gives response times only to monitors that answered", async () => {
    publish();
    const { body } = await publicStatus("acme");

    assert.deepEqual(body.monitors.map((m) => m.responseTimeMs), [null, 120, 2500, null]);
  });

  it("includes uptime, the last 30 checks oldest first, and the last 14 days of incidents", async () => {
    publish();
    const { body } = await publicStatus("acme");
    const website = body.monitors[1];

    assert.equal(website.uptime24h, 100);
    assert.equal(body.monitors[0].uptime24h, 97);
    assert.equal(body.monitors[2].uptime24h, null);
    assert.equal(website.recentChecks.length, 30);
    assert.ok(website.recentChecks[0].responseTimeMs > website.recentChecks[29].responseTimeMs);
    assert.deepEqual(body.incidents.map((i) => [i.monitorName, i.status]), [["API", "ongoing"], ["Website", "resolved"]]);
    assert.equal(body.incidents[1].durationMs, 900000);
  });

  const overall = [
    ["outage when something is down", (m) => [m.api, m.web], "outage"],
    ["degraded when something is slow and nothing is down", (m) => [m.web, m.shop], "degraded"],
    ["operational when everything is up", (m) => [m.web], "operational"],
    ["paused when every monitor is paused", (m) => [m.old], "paused"],
    ["empty with no monitors", () => [], "empty"],
  ];

  for (const [label, pick, expected] of overall) {
    it(`is ${label}`, async () => {
      publish({ monitors: pick({ api, web, shop, old }).map((m) => m._id) });
      const { body } = await publicStatus("acme");

      assert.equal(body.overall, expected);
    });
  }

  it("answers the same 404 for a missing page, an unpublished page and a malformed link", async () => {
    publish({ isPublished: false });

    const missing = await publicStatus("nothing-here");
    const hidden = await publicStatus("acme");

    assert.equal(missing.statusCode, 404);
    assert.deepEqual(missing.body, hidden.body);
    assert.equal(hidden.body.message, "Status page not found");

    for (const slug of ["x", "ab", "has space", "-lead", "a".repeat(41), "../etc", "%00", "a_b", "a--"]) {
      const before = db.pageLookups;
      const res = await publicStatus(slug);

      assert.equal(res.statusCode, 404, slug);
      assert.equal(db.pageLookups, before, `${slug} should not reach the database`);
    }
  });

  it("is case-insensitive", async () => {
    publish();

    assert.equal((await publicStatus("ACME")).statusCode, 200);
  });

  it("does not query history or incidents for a page without monitors", async () => {
    publish({ monitors: [] });
    await publicStatus("acme");

    assert.equal(db.incidentFinds, 0);
    assert.equal(db.historyFinds, 0);
  });

  describe("showing domains", () => {
    const pathy = () => mon("Pathy", { url: "https://www.example.org:8443/admin/health?token=abc123#frag" });

    it("is off by default and shows no address at all", async () => {
      const p = pathy();
      all.push(p);
      publish({ monitors: [p._id] });

      const { body } = await publicStatus("acme");

      assert.equal(body.monitors[0].domain, null);
      assert.ok(!JSON.stringify(body).includes("example.org"));
    });

    it("shows only the host, without www, port, path, query or fragment, when switched on", async () => {
      const p = pathy();
      const apex = mon("Apex", { url: "https://github.com/" });
      const odd = mon("Odd", { url: "not a url" });
      all.push(p, apex, odd);
      publish({ monitors: [p._id, apex._id, odd._id], showDomains: true });

      const { body } = await publicStatus("acme");
      const text = JSON.stringify(body);

      assert.deepEqual(body.monitors.map((m) => m.domain), ["example.org", "github.com", null]);

      for (const leaked of ["admin", "abc123", "8443", "/health", "frag", "www."]) {
        assert.ok(!text.includes(leaked), leaked);
      }
    });
  });

  describe("caching", () => {
    it("serves the second request from the cache without any database work", async () => {
      publish();
      const first = await publicStatus("acme");
      const work = db.pageLookups + db.monitorFinds + db.incidentFinds + db.historyFinds;
      const second = await publicStatus("acme");

      assert.equal(db.pageLookups + db.monitorFinds + db.incidentFinds + db.historyFinds, work);
      assert.equal(second.body.updatedAt, first.body.updatedAt);
    });

    it("rebuilds the page after 30 seconds", async () => {
      mock.timers.enable({ apis: ["Date"], now: Date.now() });
      publish();
      await publicStatus("acme");
      const lookups = db.pageLookups;

      mock.timers.tick(29000);
      await publicStatus("acme");
      assert.equal(db.pageLookups, lookups);

      mock.timers.tick(2000);
      await publicStatus("acme");
      assert.equal(db.pageLookups, lookups + 1);
    });

    it("does not cache a missing page", async () => {
      await publicStatus("nothing-here");

      assert.equal(statusCache.get("nothing-here"), null);
    });

    it("is cleared when the owner saves, renames or deletes the page", async () => {
      await save({ slug: "acme", title: "T", monitors: [String(web._id)] });
      await publicStatus("acme");
      assert.notEqual(statusCache.get("acme"), null);

      await save({ slug: "acme", title: "New title", monitors: [String(web._id)] });
      assert.equal(statusCache.get("acme"), null);

      await publicStatus("acme");
      await save({ slug: "renamed", title: "New title", monitors: [String(web._id)] });
      assert.equal(statusCache.get("acme"), null);

      await publicStatus("renamed");
      const res = mockRes();
      await deleteMyStatusPage({ user: { _id: user } }, res);
      assert.equal(statusCache.get("renamed"), null);
    });

    it("is capped so it cannot grow without limit", () => {
      for (let i = 0; i < 520; i += 1) statusCache.set(`k${i}`, i);

      let kept = 0;
      for (let i = 0; i < 520; i += 1) if (statusCache.get(`k${i}`) !== null) kept += 1;

      assert.ok(kept <= 500);
    });
  });
});

describe("status page routes", () => {
  it("serves the public page without a login", async () => {
    publish();
    const res = await request(app).get("/api/status/acme");

    assert.equal(res.status, 200);
    assert.equal(res.body.page.title, "Acme status");
  });

  it("answers an unknown link with a JSON 404", async () => {
    const res = await request(app).get("/api/status/missing-page");

    assert.equal(res.status, 404);
    assert.equal(res.body.success, false);
  });

  it("needs a login for the owner routes", async () => {
    for (const method of ["get", "put", "delete"]) {
      const res = await request(app)[method]("/api/status-page");

      assert.equal(res.status, 401, method);
    }
  });

  it("lets a logged-in owner create a page over HTTP", async () => {
    const restore = asUser({ _id: user, name: "Owner" });

    try {
      const res = await request(app)
        .put("/api/status-page")
        .set("Cookie", cookieFor(user))
        .send({ slug: "acme", title: "Acme", monitors: [String(web._id)] });

      assert.equal(res.status, 200);
      assert.equal(res.body.page.slug, "acme");
    } finally {
      restore();
    }
  });
});
