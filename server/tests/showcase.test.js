import "./helpers/env.js";
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";
import User from "../models/user.model.js";
import Monitor from "../models/monitor.model.js";
import StatusPage from "../models/statusPage.model.js";
import { SHOWCASE_SITES, seedShowcase } from "../services/showcase.service.js";
import { createStubs, oid } from "./helpers/stubs.js";

const stubs = createStubs();

let users;
let monitors;
let pages;
let userCreates;

beforeEach(() => {
  users = [];
  monitors = [];
  pages = [];
  userCreates = 0;

  stubs.stub(User, "findOne", async (query) => users.find((u) => u.email === query.email) || null);
  stubs.stub(User, "create", async (data) => {
    userCreates += 1;
    const user = { _id: oid(), ...data };
    users.push(user);
    return user;
  });
  stubs.stub(Monitor, "find", (query) => {
    const rows = monitors.filter((m) => String(m.user) === String(query.user) && query.url.$in.includes(m.url));
    const q = { select: () => q, then: (resolve, reject) => Promise.resolve(rows).then(resolve, reject) };
    return q;
  });
  stubs.stub(Monitor, "countDocuments", async (query) => monitors.filter((m) => String(m.user) === String(query.user)).length);
  stubs.stub(Monitor, "create", async (data) => {
    const monitor = { _id: oid(), ...data };
    monitors.push(monitor);
    return monitor;
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
    return page;
  });
});

afterEach(() => stubs.restore());

describe("showcase setup", () => {
  describe("on an empty database", () => {
    it("creates the showcase account with a password nobody knows", async () => {
      const result = await seedShowcase();

      assert.equal(result.userCreated, true);
      assert.equal(users.length, 1);
      assert.equal(users[0].email, "showcase@watchdog.local");
      assert.equal(users[0].name, "Watchdog Showcase");
      assert.match(users[0].password, /^\$2[aby]\$/);
      assert.equal(result.passwordSet, false);
    });

    it("adds a monitor for each of the 12 sites, in order", async () => {
      const result = await seedShowcase();

      assert.equal(result.created, 12);
      assert.equal(result.reused, 0);
      assert.deepEqual(monitors.map((m) => m.name), SHOWCASE_SITES.map((s) => s.name));
      assert.ok(monitors.every((m) => String(m.user) === String(users[0]._id)));
    });

    it("uses sensible settings: GET, 5 minutes, 10 second timeout, threshold 3", async () => {
      await seedShowcase();

      assert.ok(monitors.every((m) => m.method === "GET" && m.intervalMinutes === 5 && m.timeoutMs === 10000 && m.failureThreshold === 3 && m.keyword === ""));
    });

    it("expects only 200, except for sites known to block automated checks", async () => {
      await seedShowcase();
      const codes = Object.fromEntries(monitors.map((m) => [m.name, m.expectedStatusCodes]));

      assert.deepEqual(codes.Google, [200]);
      assert.deepEqual(codes.LinkedIn, [200, 999]);
      assert.deepEqual(codes.Reddit, [200, 403, 429]);
      assert.deepEqual(codes["Stack Overflow"], [200, 403]);
    });

    it("only monitors public https addresses", async () => {
      await seedShowcase();

      assert.ok(monitors.every((m) => m.url.startsWith("https://") && !/localhost|127\.|192\.168|10\./.test(m.url)));
    });

    it("publishes a status page named world with domains switched on", async () => {
      const result = await seedShowcase();

      assert.equal(pages.length, 1);
      assert.equal(pages[0].slug, "world");
      assert.equal(pages[0].title, "Popular websites");
      assert.equal(pages[0].isPublished, true);
      assert.equal(pages[0].showDomains, true);
      assert.deepEqual(pages[0].monitors.map(String), monitors.map((m) => String(m._id)));
      assert.deepEqual([result.slug, result.total], ["world", 12]);
    });
  });

  describe("running it again", () => {
    it("duplicates nothing and keeps the same monitors", async () => {
      await seedShowcase();
      const ids = monitors.map((m) => String(m._id));
      const result = await seedShowcase();

      assert.equal(monitors.length, 12);
      assert.equal(result.created, 0);
      assert.equal(result.reused, 12);
      assert.equal(result.userCreated, false);
      assert.equal(userCreates, 1);
      assert.deepEqual(monitors.map((m) => String(m._id)), ids);
      assert.equal(pages.length, 1);
    });

    it("adds only what is missing and keeps settings of existing monitors", async () => {
      const owner = await User.create({ name: "Showcase", email: "showcase@watchdog.local", password: "x" });
      await Monitor.create({ user: owner._id, name: "Google", url: "https://www.google.com/", expectedStatusCodes: [200, 301] });
      await Monitor.create({ user: owner._id, name: "GitHub", url: "https://github.com/" });

      const result = await seedShowcase();

      assert.equal(result.created, 10);
      assert.equal(result.reused, 2);
      assert.deepEqual(monitors[0].expectedStatusCodes, [200, 301]);
      assert.equal(String(pages[0].monitors[0]), String(monitors[0]._id));
      assert.equal(String(pages[0].monitors[3]), String(monitors[1]._id));
    });

    it("turns domains on for a page created before that setting existed", async () => {
      await seedShowcase();
      pages[0].showDomains = false;

      await seedShowcase();

      assert.equal(pages[0].showDomains, true);
    });
  });

  describe("options", () => {
    it("lowercases a chosen email and link, and uses a chosen title", async () => {
      await seedShowcase({ email: "Me@Example.COM", slug: "Live-Sites", title: "Live sites" });

      assert.equal(users[0].email, "me@example.com");
      assert.equal(pages[0].slug, "live-sites");
      assert.equal(pages[0].title, "Live sites");
    });

    it("stores a chosen password as a bcrypt hash", async () => {
      const result = await seedShowcase({ password: "my-showcase-pass" });

      assert.equal(result.passwordSet, true);
      assert.notEqual(users[0].password, "my-showcase-pass");
      assert.equal(await bcrypt.compare("my-showcase-pass", users[0].password), true);
    });

    it("refuses a password of the wrong length before creating anything", async () => {
      for (const password of ["short", "x".repeat(73)]) {
        await assert.rejects(() => seedShowcase({ password }), /8 to 72/);
      }

      assert.equal(users.length, 0);
      assert.equal(monitors.length, 0);
    });

    it("leaves the password of an account that already exists alone", async () => {
      await User.create({ name: "Showcase", email: "showcase@watchdog.local", password: "oldhash" });
      const result = await seedShowcase({ password: "my-showcase-pass" });

      assert.equal(result.userCreated, false);
      assert.equal(result.passwordSet, false);
      assert.equal(users[0].password, "oldhash");
    });
  });

  describe("problems", () => {
    it("refuses an account that would pass the limit of 20 monitors", async () => {
      const busy = await User.create({ name: "Busy", email: "busy@example.com", password: "x" });
      for (let i = 0; i < 15; i += 1) await Monitor.create({ user: busy._id, name: `m${i}`, url: `https://m${i}.example.com/` });

      await assert.rejects(() => seedShowcase({ email: "busy@example.com" }), /already has 15 monitors.*limit of 20/);
      assert.equal(monitors.length, 15);
      assert.equal(pages.length, 0);
    });

    it("refuses a link that another account already uses", async () => {
      const other = await User.create({ name: "Other", email: "other@example.com", password: "x" });
      pages.push({ user: other._id, slug: "world", title: "Taken", monitors: [] });

      await assert.rejects(() => seedShowcase(), { message: 'The link "world" is already used by another account' });
    });

    it("passes on other database errors", async () => {
      stubs.stub(StatusPage, "findOneAndUpdate", async () => {
        throw new Error("db down");
      });

      await assert.rejects(() => seedShowcase(), { message: "db down" });
    });
  });
});
