import User from "../../models/user.model.js";
import Monitor from "../../models/monitor.model.js";
import CheckResult from "../../models/checkResult.model.js";
import Incident from "../../models/incident.model.js";
import StatusPage from "../../models/statusPage.model.js";
import { oid, stub } from "./stubs.js";

const same = (a, b) => String(a) === String(b);

const thenable = (value, extra = {}) => ({
  ...extra,
  then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
});

const makeDoc = (data, onDelete) => {
  const doc = { _id: oid(), createdAt: new Date(), updatedAt: new Date(), ...data };
  const plain = () => ({ ...doc });

  Object.defineProperty(doc, "save", { value: async () => doc });
  Object.defineProperty(doc, "deleteOne", { value: async () => onDelete && onDelete(doc) });
  Object.defineProperty(doc, "toJSON", { value: plain });
  Object.defineProperty(doc, "toObject", { value: plain });

  return doc;
};

const chainOf = (rows) => {
  let current = rows;
  const query = {
    sort: (spec) => {
      const [key, direction] = Object.entries(spec)[0];
      current = [...current].sort((a, b) => direction * (new Date(a[key]) - new Date(b[key])));
      return query;
    },
    skip: (n) => {
      current = current.slice(n);
      return query;
    },
    limit: (n) => {
      current = current.slice(0, n);
      return query;
    },
    select: () => query,
    populate: () => query,
    lean: async () => current.map((row) => ({ ...row })),
    then: (resolve, reject) => Promise.resolve(current).then(resolve, reject),
  };

  return query;
};

export const installMemoryApp = ({ fastMonitors = () => false } = {}) => {
  const db = { users: [], monitors: [], results: [], incidents: [], pages: [] };
  const controls = { claimsDisabled: false };
  const restores = [];
  const use = (target, name, fn) => restores.push(stub(target, name, fn));

  use(User, "findOne", async (query) => db.users.find((user) => user.email === query.email) || null);
  use(User, "create", async (data) => {
    const user = makeDoc(data);
    db.users.push(user);
    return user;
  });
  use(User, "findById", (id) => ({
    select: async () => {
      const user = db.users.find((candidate) => same(candidate._id, id));
      return user ? { _id: user._id, name: user.name, email: user.email } : null;
    },
  }));

  use(Monitor, "countDocuments", async (query) => db.monitors.filter((monitor) => same(monitor.user, query.user)).length);
  use(Monitor, "create", async (data) => {
    const monitor = makeDoc(
      { isActive: true, status: "unknown", consecutiveFailures: 0, nextCheckAt: new Date(), encryptedHeaders: "", ...data },
      (doc) => {
        db.monitors = db.monitors.filter((candidate) => candidate !== doc);
      },
    );
    db.monitors.push(monitor);
    return monitor;
  });
  use(Monitor, "find", (query) => {
    let rows = db.monitors;
    if (query.user) rows = rows.filter((monitor) => same(monitor.user, query.user));
    if (query._id && query._id.$in) rows = rows.filter((monitor) => query._id.$in.map(String).includes(String(monitor._id)));
    return chainOf(rows);
  });
  use(Monitor, "findOne", async (query) =>
    db.monitors.find((monitor) => same(monitor._id, query._id) && (!query.user || same(monitor.user, query.user))) || null,
  );
  const claimedAt = new Map();

  use(Monitor, "findOneAndUpdate", async (filter, update) => {
    if (controls.claimsDisabled) return null;

    const now = Date.now();
    const found = db.monitors.find((monitor) => {
      if (filter._id && !same(monitor._id, filter._id)) return false;
      if (monitor.isActive !== filter.isActive) return false;
      if (fastMonitors(monitor)) return now - (claimedAt.get(String(monitor._id)) || 0) > 400;
      return monitor.nextCheckAt <= filter.nextCheckAt.$lte;
    });

    if (!found) return null;

    claimedAt.set(String(found._id), now);
    Object.assign(found, update.$set);
    return found;
  });

  use(CheckResult, "create", async (doc) => {
    db.results.push({ _id: oid(), ...doc });
    return doc;
  });
  use(CheckResult, "find", (query) => chainOf(db.results.filter((row) => same(row.monitor, query.monitor))));
  use(CheckResult, "findOne", (query) => {
    let rows = db.results.filter(
      (row) =>
        same(row.monitor, query.monitor) &&
        (query.isUp === undefined || row.isUp === query.isUp) &&
        (!query.checkedAt || row.checkedAt > query.checkedAt.$gt),
    );

    const chain = {
      sort: (spec) => {
        const [key, direction] = Object.entries(spec)[0];
        rows = [...rows].sort((a, b) => direction * (new Date(a[key]) - new Date(b[key])));
        return chain;
      },
      select: () => chain,
      then: (resolve, reject) => Promise.resolve(rows[0] || null).then(resolve, reject),
    };

    return chain;
  });
  use(CheckResult, "deleteMany", async (query) => {
    db.results = db.results.filter((row) => !same(row.monitor, query.monitor));
  });
  use(CheckResult, "aggregate", async (pipeline) => {
    const match = pipeline[0].$match;
    const grouped = pipeline[1].$group;
    const since = match.checkedAt.$gte;

    if (grouped._id === "$monitor") {
      const ids = match.monitor.$in.map(String);
      return ids.flatMap((id) => {
        const rows = db.results.filter((row) => same(row.monitor, id) && row.checkedAt >= since);
        return rows.length ? [{ _id: rows[0].monitor, total: rows.length, up: rows.filter((row) => row.isUp).length }] : [];
      });
    }

    const rows = db.results.filter((row) => same(row.monitor, match.monitor) && row.checkedAt >= since);
    if (!rows.length) return [];

    const timed = rows.filter((row) => row.isUp && row.responseTimeMs != null);

    return [
      {
        _id: null,
        total: rows.length,
        up: rows.filter((row) => row.isUp).length,
        avgMs: timed.length ? timed.reduce((sum, row) => sum + row.responseTimeMs, 0) / timed.length : 0,
      },
    ];
  });

  const populated = (incident) => {
    const monitor = db.monitors.find((candidate) => same(candidate._id, incident.monitor?._id ?? incident.monitor));
    return monitor ? { ...incident, monitor: { _id: monitor._id, name: monitor.name, url: monitor.url } } : incident;
  };
  const matches = (incident, query) =>
    (!query.monitor || same(incident.monitor, query.monitor)) &&
    (!query.user || same(incident.user, query.user)) &&
    (!query._id || same(incident._id, query._id)) &&
    (query.isResolved === undefined || incident.isResolved === query.isResolved) &&
    (!query.status || incident.status === query.status);

  use(Incident, "create", async (data) => {
    const incident = makeDoc({ status: "open", isResolved: false, failedChecks: 1, ...data });
    db.incidents.push(incident);
    return incident;
  });
  use(Incident, "findOneAndUpdate", (query, update) => {
    const found = db.incidents.find((incident) => matches(incident, query));
    if (found) {
      if (update.$inc) for (const [key, value] of Object.entries(update.$inc)) found[key] += value;
      if (update.$set) Object.assign(found, update.$set);
    }
    return thenable(found || null, { populate: () => thenable(found ? populated(found) : null) });
  });
  use(Incident, "findOne", (query) => {
    const found = db.incidents.find((incident) => matches(incident, query));
    return thenable(found || null, { populate: () => thenable(found ? populated(found) : null) });
  });
  use(Incident, "find", (query) => {
    const rows = db.incidents.filter((incident) => matches(incident, query)).map(populated);
    return chainOf(rows);
  });
  use(Incident, "countDocuments", async (query) => db.incidents.filter((incident) => matches(incident, query)).length);
  use(Incident, "deleteMany", async (query) => {
    db.incidents = db.incidents.filter((incident) => !same(incident.monitor, query.monitor));
  });

  use(StatusPage, "findOne", (query) => {
    const page = db.pages.find((candidate) =>
      query.slug ? candidate.slug === query.slug && (query.isPublished === undefined || candidate.isPublished === query.isPublished) : same(candidate.user, query.user),
    );
    const copy = page ? { ...page } : null;
    const chain = { select: () => chain, lean: async () => copy, then: (resolve, reject) => Promise.resolve(copy).then(resolve, reject) };
    return chain;
  });
  use(StatusPage, "findOneAndUpdate", async (query, update) => {
    const clash = db.pages.find((page) => page.slug === update.slug && !same(page.user, query.user));
    if (clash) throw Object.assign(new Error("duplicate"), { code: 11000 });

    let page = db.pages.find((candidate) => same(candidate.user, query.user));

    if (!page) {
      page = { _id: oid(), user: query.user };
      db.pages.push(page);
    }

    Object.assign(page, update);
    return { ...page };
  });
  use(StatusPage, "findOneAndDelete", async (query) => {
    const index = db.pages.findIndex((page) => same(page.user, query.user));
    return index < 0 ? null : db.pages.splice(index, 1)[0];
  });
  use(StatusPage, "find", (query) => chainOf(db.pages.filter((page) => page.monitors.map(String).includes(String(query.monitors)))));
  use(StatusPage, "updateMany", async (query, update) => {
    for (const page of db.pages) {
      page.monitors = page.monitors.filter((id) => !same(id, update.$pull.monitors));
    }
  });

  return { db, controls, restore: () => restores.reverse().forEach((restore) => restore()) };
};
