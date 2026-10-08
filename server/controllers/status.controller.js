import mongoose from "mongoose";
import StatusPage from "../models/statusPage.model.js";
import Monitor from "../models/monitor.model.js";
import Incident from "../models/incident.model.js";
import statusCache from "../utils/statusCache.js";
import { getMonitorHistory } from "../services/history.service.js";

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
const MAX_PAGE_MONITORS = 20;
const SLOW_MS = 1500;
const RECENT_CHECKS = 30;
const INCIDENT_DAYS = 14;

const monitorState = (monitor) => {
  if (!monitor.isActive) return "paused";
  if (monitor.status === "down") return "down";
  if (monitor.status === "up") {
    return monitor.lastResponseTimeMs > SLOW_MS ? "slow" : "up";
  }
  return "unknown";
};

const overallState = (states) => {
  if (states.length === 0) return "empty";
  if (states.includes("down")) return "outage";
  if (states.includes("slow")) return "degraded";
  if (states.every((state) => state === "paused")) return "paused";
  return "operational";
};

const domainOf = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch (error) {
    return null;
  }
};

const pageJson = (page) => ({
  slug: page.slug,
  title: page.title,
  monitors: page.monitors.map(String),
  isPublished: page.isPublished,
  showDomains: Boolean(page.showDomains),
});

export const getPublicStatus = async (req, res) => {
  try {
    const slug = String(req.params.slug || "").toLowerCase();

    if (!SLUG_PATTERN.test(slug)) {
      return res.status(404).json({
        success: false,
        message: "Status page not found",
      });
    }

    const cached = statusCache.get(slug);

    if (cached) {
      return res.status(200).json(cached);
    }

    const page = await StatusPage.findOne({ slug, isPublished: true }).lean();

    if (!page) {
      return res.status(404).json({
        success: false,
        message: "Status page not found",
      });
    }

    const found = await Monitor.find({ _id: { $in: page.monitors } }).select(
      "name url status isActive lastResponseTimeMs lastCheckedAt",
    );

    const order = new Map(page.monitors.map((id, index) => [String(id), index]));
    const monitors = [...found].sort(
      (a, b) => order.get(String(a._id)) - order.get(String(b._id)),
    );
    const ids = monitors.map((monitor) => monitor._id);
    const since = new Date(Date.now() - INCIDENT_DAYS * 24 * 60 * 60 * 1000);

    const [history, incidents] = await Promise.all([
      getMonitorHistory(ids, RECENT_CHECKS),
      ids.length
        ? Incident.find({ monitor: { $in: ids }, startedAt: { $gte: since } })
            .sort({ startedAt: -1 })
            .limit(10)
            .select("monitor status startedAt resolvedAt durationMs")
            .lean()
        : [],
    ]);

    const names = new Map(monitors.map((monitor) => [String(monitor._id), monitor.name]));
    const states = monitors.map(monitorState);

    const payload = {
      success: true,
      page: { slug: page.slug, title: page.title },
      overall: overallState(states),
      updatedAt: new Date().toISOString(),
      monitors: monitors.map((monitor, index) => {
        const item = history.get(String(monitor._id));

        return {
          name: monitor.name,
          domain: page.showDomains ? domainOf(monitor.url) : null,
          status: states[index],
          responseTimeMs:
            states[index] === "up" || states[index] === "slow"
              ? monitor.lastResponseTimeMs
              : null,
          lastCheckedAt: monitor.lastCheckedAt || null,
          uptime24h: item.uptime24h,
          recentChecks: item.recentChecks.map((check) => ({
            isUp: check.isUp,
            responseTimeMs: check.responseTimeMs ?? null,
          })),
        };
      }),
      incidents: incidents.map((incident) => ({
        monitorName: names.get(String(incident.monitor)),
        status: incident.status === "resolved" ? "resolved" : "ongoing",
        startedAt: incident.startedAt,
        resolvedAt: incident.resolvedAt || null,
        durationMs: incident.durationMs ?? null,
      })),
    };

    statusCache.set(slug, payload);

    return res.status(200).json(payload);
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

export const getMyStatusPage = async (req, res) => {
  try {
    const page = await StatusPage.findOne({ user: req.user._id });

    return res.status(200).json({
      success: true,
      page: page ? pageJson(page) : null,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

export const saveMyStatusPage = async (req, res) => {
  try {
    const { slug, title, monitors, isPublished, showDomains } = req.body || {};

    if (typeof slug !== "string" || typeof title !== "string") {
      return res.status(400).json({
        success: false,
        message: "Invalid input",
      });
    }

    const cleanSlug = slug.trim().toLowerCase();
    const cleanTitle = title.trim();

    if (!SLUG_PATTERN.test(cleanSlug)) {
      return res.status(400).json({
        success: false,
        message:
          "The link must be 3 to 40 characters: lowercase letters, numbers and hyphens, starting and ending with a letter or number",
      });
    }

    if (!cleanTitle || cleanTitle.length > 60) {
      return res.status(400).json({
        success: false,
        message: "Title must be 1 to 60 characters",
      });
    }

    if (
      (isPublished !== undefined && typeof isPublished !== "boolean") ||
      (showDomains !== undefined && typeof showDomains !== "boolean")
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid input",
      });
    }

    if (
      !Array.isArray(monitors) ||
      monitors.length > MAX_PAGE_MONITORS ||
      !monitors.every(
        (id) => typeof id === "string" && mongoose.isValidObjectId(id),
      )
    ) {
      return res.status(400).json({
        success: false,
        message: `Choose up to ${MAX_PAGE_MONITORS} monitors`,
      });
    }

    const ids = [...new Set(monitors)];

    if (ids.length > 0) {
      const owned = await Monitor.find({
        _id: { $in: ids },
        user: req.user._id,
      }).select("_id");

      if (owned.length !== ids.length) {
        return res.status(400).json({
          success: false,
          message: "One or more monitors were not found",
        });
      }
    }

    const previous = await StatusPage.findOne({ user: req.user._id }).select(
      "slug",
    );

    let page;

    try {
      page = await StatusPage.findOneAndUpdate(
        { user: req.user._id },
        {
          slug: cleanSlug,
          title: cleanTitle,
          monitors: ids,
          isPublished: isPublished ?? true,
          showDomains: showDomains ?? false,
        },
        { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
      );
    } catch (error) {
      if (error.code === 11000) {
        return res.status(409).json({
          success: false,
          message: "That link is already taken",
        });
      }
      throw error;
    }

    if (previous) statusCache.delete(previous.slug);
    statusCache.delete(cleanSlug);

    return res.status(200).json({
      success: true,
      message: "Status page saved",
      page: pageJson(page),
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

export const deleteMyStatusPage = async (req, res) => {
  try {
    const page = await StatusPage.findOneAndDelete({ user: req.user._id });

    if (!page) {
      return res.status(404).json({
        success: false,
        message: "No status page to delete",
      });
    }

    statusCache.delete(page.slug);

    return res.status(200).json({
      success: true,
      message: "Status page deleted",
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};
