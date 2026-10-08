import crypto from "crypto";
import bcrypt from "bcrypt";
import User from "../models/user.model.js";
import Monitor from "../models/monitor.model.js";
import StatusPage from "../models/statusPage.model.js";
import validateUrl from "../utils/validateUrl.js";

const MAX_MONITORS_PER_USER = 20;

export const SHOWCASE_SITES = [
  { name: "Google", url: "https://www.google.com/" },
  { name: "YouTube", url: "https://www.youtube.com/" },
  { name: "Wikipedia", url: "https://www.wikipedia.org/" },
  { name: "GitHub", url: "https://github.com/" },
  { name: "Cloudflare", url: "https://www.cloudflare.com/" },
  { name: "Amazon", url: "https://www.amazon.com/" },
  { name: "Reddit", url: "https://www.reddit.com/", codes: [200, 403, 429] },
  { name: "Netflix", url: "https://www.netflix.com/" },
  { name: "LinkedIn", url: "https://www.linkedin.com/", codes: [200, 999] },
  { name: "Stack Overflow", url: "https://stackoverflow.com/", codes: [200, 403] },
  { name: "Microsoft", url: "https://www.microsoft.com/" },
  { name: "Spotify", url: "https://www.spotify.com/" },
];

export const seedShowcase = async ({ email, slug, title, password } = {}) => {
  const ownerEmail = (email || "showcase@watchdog.local").toLowerCase();
  const pageSlug = (slug || "world").toLowerCase();

  let user = await User.findOne({ email: ownerEmail });
  let userCreated = false;

  if (!user) {
    if (password && (password.length < 8 || password.length > 72)) {
      throw new Error("SHOWCASE_PASSWORD must be 8 to 72 characters");
    }

    const hash = await bcrypt.hash(
      password || crypto.randomBytes(32).toString("hex"),
      10,
    );

    user = await User.create({
      name: "Watchdog Showcase",
      email: ownerEmail,
      password: hash,
    });
    userCreated = true;
  }

  const wanted = SHOWCASE_SITES.map((site) => ({
    ...site,
    url: validateUrl(site.url).url,
  }));

  const found = await Monitor.find({
    user: user._id,
    url: { $in: wanted.map((site) => site.url) },
  }).select("url");

  const known = new Map(found.map((monitor) => [monitor.url, monitor._id]));
  const missing = wanted.filter((site) => !known.has(site.url));
  const existing = await Monitor.countDocuments({ user: user._id });

  if (existing + missing.length > MAX_MONITORS_PER_USER) {
    throw new Error(
      `${ownerEmail} already has ${existing} monitors, and ${missing.length} more would pass the limit of ${MAX_MONITORS_PER_USER}. Use another SHOWCASE_EMAIL.`,
    );
  }

  for (const site of missing) {
    const monitor = await Monitor.create({
      user: user._id,
      name: site.name,
      url: site.url,
      method: "GET",
      intervalMinutes: 5,
      timeoutMs: 10000,
      expectedStatusCodes: site.codes || [200],
      keyword: "",
      failureThreshold: 3,
    });

    known.set(site.url, monitor._id);
  }

  try {
    await StatusPage.findOneAndUpdate(
      { user: user._id },
      {
        slug: pageSlug,
        title: title || "Popular websites",
        monitors: wanted.map((site) => known.get(site.url)),
        isPublished: true,
        showDomains: true,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  } catch (error) {
    if (error.code === 11000) {
      throw new Error(`The link "${pageSlug}" is already used by another account`);
    }
    throw error;
  }

  return {
    email: ownerEmail,
    userCreated,
    passwordSet: Boolean(password) && userCreated,
    created: missing.length,
    reused: wanted.length - missing.length,
    slug: pageSlug,
    total: wanted.length,
  };
};
