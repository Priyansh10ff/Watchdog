const TTL_MS = 30 * 1000;
const MAX_ENTRIES = 500;

const entries = new Map();

const statusCache = {
  get(key) {
    const entry = entries.get(key);

    if (!entry) return null;

    if (entry.expiresAt <= Date.now()) {
      entries.delete(key);
      return null;
    }

    return entry.value;
  },

  set(key, value) {
    if (entries.size >= MAX_ENTRIES && !entries.has(key)) {
      entries.delete(entries.keys().next().value);
    }

    entries.set(key, { value, expiresAt: Date.now() + TTL_MS });
  },

  delete(key) {
    entries.delete(key);
  },

  clear() {
    entries.clear();
  },
};

export default statusCache;
