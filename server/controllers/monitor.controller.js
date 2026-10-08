import mongoose from "mongoose";
import Monitor from "../models/monitor.model.js";
import CheckResult from "../models/checkResult.model.js";
import Incident from "../models/incident.model.js";
import StatusPage from "../models/statusPage.model.js";
import statusCache from "../utils/statusCache.js";
import { getMonitorHistory } from "../services/history.service.js";
import validateUrl from "../utils/validateUrl.js";
import { checkSoon, processMonitor } from "../services/checker.service.js";

const MAX_MONITORS_PER_USER = 20;

const isWhole = (value, min, max) =>
  Number.isInteger(value) && value >= min && value <= max;

const findOwnedMonitor = async (id, userId) => {
  if (!mongoose.isValidObjectId(id)) return null;
  return Monitor.findOne({ _id: id, user: userId });
};

const validateMonitorFields = (body, partial) => {
  const data = {};
  const wants = (key) => !partial || body[key] !== undefined;

  if (wants("name")) {
    if (
      typeof body.name !== "string" ||
      !body.name.trim() ||
      body.name.trim().length > 60
    ) {
      return { error: "Name must be 1 to 60 characters" };
    }
    data.name = body.name.trim();
  }

  if (wants("url")) {
    if (typeof body.url !== "string") {
      return { error: "Invalid input" };
    }
    const urlCheck = validateUrl(body.url.trim());
    if (!urlCheck.valid) {
      return { error: urlCheck.message };
    }
    data.url = urlCheck.url;
  }

  if (wants("method")) {
    if (!["GET", "HEAD"].includes(body.method)) {
      return { error: "Method must be GET or HEAD" };
    }
    data.method = body.method;
  }

  if (wants("intervalMinutes")) {
    if (!isWhole(body.intervalMinutes, 1, 60)) {
      return { error: "Interval must be a whole number between 1 and 60 minutes" };
    }
    data.intervalMinutes = body.intervalMinutes;
  }

  if (wants("timeoutMs")) {
    if (!isWhole(body.timeoutMs, 1000, 30000)) {
      return { error: "Timeout must be between 1000 and 30000 ms" };
    }
    data.timeoutMs = body.timeoutMs;
  }

  if (wants("failureThreshold")) {
    if (!isWhole(body.failureThreshold, 1, 10)) {
      return { error: "Failure threshold must be between 1 and 10" };
    }
    data.failureThreshold = body.failureThreshold;
  }

  if (wants("expectedStatusCodes")) {
    const codes = body.expectedStatusCodes;
    if (
      !Array.isArray(codes) ||
      codes.length < 1 ||
      codes.length > 20 ||
      !codes.every((code) => isWhole(code, 100, 599))
    ) {
      return {
        error: "Expected status codes must be 1 to 20 numbers between 100 and 599",
      };
    }
    data.expectedStatusCodes = codes;
  }

  if (wants("keyword")) {
    if (typeof body.keyword !== "string") {
      return { error: "Invalid input" };
    }
    const keyword = body.keyword.trim();
    if (keyword.length > 100) {
      return { error: "Keyword must be 100 characters or less" };
    }
    data.keyword = keyword;
  }

  return { data };
};

export const createMonitor = async (req, res) => {
  try {
    const body = req.body || {};

    if (!body.name || !body.url) {
      return res.status(400).json({
        success: false,
        message: "Name and URL are required",
      });
    }

    const input = {
      method: "GET",
      intervalMinutes: 1,
      timeoutMs: 10000,
      expectedStatusCodes: [200],
      keyword: "",
      failureThreshold: 3,
      ...body,
    };

    const result = validateMonitorFields(input, false);

    if (result.error) {
      return res.status(400).json({
        success: false,
        message: result.error,
      });
    }

    if (result.data.keyword && result.data.method === "HEAD") {
      return res.status(400).json({
        success: false,
        message: "Keyword check needs the GET method",
      });
    }

    const count = await Monitor.countDocuments({ user: req.user._id });

    if (count >= MAX_MONITORS_PER_USER) {
      return res.status(403).json({
        success: false,
        message: `You can have at most ${MAX_MONITORS_PER_USER} monitors`,
      });
    }

    const monitor = await Monitor.create({
      user: req.user._id,
      ...result.data,
    });

    const monitorObj = monitor.toObject();
    delete monitorObj.encryptedHeaders;

    checkSoon(monitor._id);

    return res.status(201).json({
      success: true,
      message: "Monitor created",
      monitor: monitorObj,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "You are already monitoring this URL",
      });
    }

    console.log(error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

export const getMonitors = async (req, res) => {
  try {
    const monitors = await Monitor.find({ user: req.user._id }).sort({
      createdAt: -1,
    });

    const history = await getMonitorHistory(monitors.map((monitor) => monitor._id));

    const withHistory = monitors.map((monitor) => ({
      ...monitor.toJSON(),
      ...history.get(String(monitor._id)),
    }));

    return res.status(200).json({
      success: true,
      count: withHistory.length,
      monitors: withHistory,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

export const getMonitor = async (req, res) => {
  try {
    const monitor = await findOwnedMonitor(req.params.id, req.user._id);

    if (!monitor) {
      return res.status(404).json({
        success: false,
        message: "Monitor not found",
      });
    }

    return res.status(200).json({
      success: true,
      monitor,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

export const updateMonitor = async (req, res) => {
  try {
    const body = { ...(req.body || {}), url: undefined };

    const editable = [
      "name",
      "method",
      "intervalMinutes",
      "timeoutMs",
      "expectedStatusCodes",
      "keyword",
      "failureThreshold",
    ];

    if (!editable.some((key) => body[key] !== undefined)) {
      return res.status(400).json({
        success: false,
        message: "Nothing to update",
      });
    }

    const result = validateMonitorFields(body, true);

    if (result.error) {
      return res.status(400).json({
        success: false,
        message: result.error,
      });
    }

    const monitor = await findOwnedMonitor(req.params.id, req.user._id);

    if (!monitor) {
      return res.status(404).json({
        success: false,
        message: "Monitor not found",
      });
    }

    const nextMethod = result.data.method ?? monitor.method;
    const nextKeyword = result.data.keyword ?? monitor.keyword;

    if (nextKeyword && nextMethod === "HEAD") {
      return res.status(400).json({
        success: false,
        message: "Keyword check needs the GET method",
      });
    }

    Object.assign(monitor, result.data);

    if (result.data.intervalMinutes !== undefined) {
      monitor.nextCheckAt = new Date();
    }

    await monitor.save();

    return res.status(200).json({
      success: true,
      message: "Monitor updated",
      monitor,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

export const toggleMonitor = async (req, res) => {
  try {
    const monitor = await findOwnedMonitor(req.params.id, req.user._id);

    if (!monitor) {
      return res.status(404).json({
        success: false,
        message: "Monitor not found",
      });
    }

    monitor.isActive = !monitor.isActive;

    if (monitor.isActive) {
      monitor.nextCheckAt = new Date();
    }

    await monitor.save();

    if (monitor.isActive) checkSoon(monitor._id);

    return res.status(200).json({
      success: true,
      message: monitor.isActive ? "Monitor resumed" : "Monitor paused",
      monitor,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

export const deleteMonitor = async (req, res) => {
  try {
    const monitor = await findOwnedMonitor(req.params.id, req.user._id);

    if (!monitor) {
      return res.status(404).json({
        success: false,
        message: "Monitor not found",
      });
    }

    const pages = await StatusPage.find({ monitors: monitor._id }).select("slug");

    await monitor.deleteOne();
    await Promise.all([
      CheckResult.deleteMany({ monitor: monitor._id }),
      Incident.deleteMany({ monitor: monitor._id }),
      StatusPage.updateMany(
        { monitors: monitor._id },
        { $pull: { monitors: monitor._id } },
      ),
    ]);

    pages.forEach((page) => statusCache.delete(page.slug));

    return res.status(200).json({
      success: true,
      message: "Monitor deleted",
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

export const getResults = async (req, res) => {
  try {
    const monitor = await findOwnedMonitor(req.params.id, req.user._id);

    if (!monitor) {
      return res.status(404).json({
        success: false,
        message: "Monitor not found",
      });
    }

    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [results, stats] = await Promise.all([
      CheckResult.find({ monitor: monitor._id })
        .sort({ checkedAt: -1 })
        .limit(limit),
      CheckResult.aggregate([
        { $match: { monitor: monitor._id, checkedAt: { $gte: since } } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            up: { $sum: { $cond: ["$isUp", 1, 0] } },
            avgMs: { $avg: "$responseTimeMs" },
          },
        },
      ]),
    ]);

    const summary = stats[0];

    return res.status(200).json({
      success: true,
      results,
      last24h: {
        checks: summary ? summary.total : 0,
        uptimePercent: summary
          ? Math.round((summary.up / summary.total) * 10000) / 100
          : null,
        avgResponseTimeMs:
          summary && summary.avgMs != null ? Math.round(summary.avgMs) : null,
      },
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

export const checkNow = async (req, res) => {
  try {
    const monitor = await findOwnedMonitor(req.params.id, req.user._id);

    if (!monitor) {
      return res.status(404).json({
        success: false,
        message: "Monitor not found",
      });
    }

    if (!monitor.isActive) {
      return res.status(400).json({
        success: false,
        message: "Resume the monitor before checking it",
      });
    }

    if (
      monitor.lastCheckedAt &&
      Date.now() - monitor.lastCheckedAt.getTime() < 10000
    ) {
      return res.status(429).json({
        success: false,
        message: "Wait a few seconds before checking again",
      });
    }

    const { result, transition, incidentEvent, incident } =
      await processMonitor(monitor);

    return res.status(200).json({
      success: true,
      message: result.isUp ? "Check passed" : "Check failed",
      result,
      transition,
      incidentEvent,
      incident,
      monitor,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};
