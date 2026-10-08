import Incident from "../../models/incident.model.js";
import CheckResult from "../../models/checkResult.model.js";
import { oid, stub } from "./stubs.js";

export const useMemoryStores = () => {
  const store = {
    incidents: [],
    results: [],
    creates: 0,
    createError: null,
    findOneAndUpdateCalls: 0,
  };

  const restores = [
    stub(Incident, "findOneAndUpdate", async (query, update) => {
      store.findOneAndUpdateCalls += 1;

      const found = store.incidents.find(
        (incident) =>
          String(incident.monitor) === String(query.monitor) &&
          incident.isResolved === query.isResolved,
      );

      if (!found) return null;

      if (update.$inc) {
        for (const [key, value] of Object.entries(update.$inc)) found[key] += value;
      }
      if (update.$set) Object.assign(found, update.$set);

      return found;
    }),

    stub(Incident, "create", async (doc) => {
      if (store.createError) {
        const error = store.createError;
        store.createError = null;
        throw error;
      }

      store.creates += 1;

      const incident = {
        _id: oid(),
        status: "open",
        isResolved: false,
        failedChecks: 1,
        save: async () => {},
        ...doc,
      };

      store.incidents.push(incident);
      return incident;
    }),

    stub(Incident, "findOne", async (query) =>
      store.incidents.find(
        (incident) =>
          String(incident.monitor) === String(query.monitor) &&
          incident.isResolved === query.isResolved,
      ) || null,
    ),

    stub(CheckResult, "create", async (doc) => {
      store.results.push({ _id: oid(), ...doc });
      return doc;
    }),

    stub(CheckResult, "findOne", (query) => {
      let rows = store.results.filter(
        (row) =>
          String(row.monitor) === String(query.monitor) &&
          (query.isUp === undefined || row.isUp === query.isUp) &&
          (!query.checkedAt || row.checkedAt > query.checkedAt.$gt),
      );

      const chain = {
        sort: (spec) => {
          const direction = spec.checkedAt;
          rows = [...rows].sort((a, b) => direction * (a.checkedAt - b.checkedAt));
          return chain;
        },
        select: () => chain,
        then: (resolve, reject) => Promise.resolve(rows[0] || null).then(resolve, reject),
      };

      return chain;
    }),
  ];

  return {
    store,
    restore: () => restores.forEach((restore) => restore()),
  };
};
