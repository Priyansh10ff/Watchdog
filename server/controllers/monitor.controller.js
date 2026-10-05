import mongoose from "mongoose";
import Monitor from "../models/monitor.model.js";
import CheckResult from "../models/checkResult.model.js";
import validateUrl from "../utils/validateUrl.js";

const MAX_MONITORS_PER_USER = 20;

const findOwnedMonitor = async (id, userId) => {
  if (!mongoose.isValidObjectId(id)) return null;
  return Monitor.findOne({ _id: id, user: userId });
};

export const createMonitor = async (req, res) => {
  try {
    const {
      name,
      url,
      method = "GET",
      intervalMinutes = 1,
      timeoutMs = 10000,
      expectedStatusCodes = [200],
      keyword = "",
      failureThreshold = 3,
    } = req.body || {};

    if (!name || !url) {
      return res.status(400).json({
        success: false,
        message: "Name and URL are required",
      });
    }

    if (
      typeof name !== "string" ||
      typeof url !== "string" ||
      typeof method !== "string" ||
      typeof keyword !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid input",
      });
    }

    const cleanName = name.trim();
    const cleanKeyword = keyword.trim();

    if (!cleanName || cleanName.length > 60) {
      return res.status(400).json({
        success: false,
        message: "Name must be 1 to 60 characters",
      });
    }

    const urlCheck = validateUrl(url.trim());

    if (!urlCheck.valid) {
      return res.status(400).json({
        success: false,
        message: urlCheck.message,
      });
    }

    if (!["GET", "HEAD"].includes(method)) {
      return res.status(400).json({
        success: false,
        message: "Method must be GET or HEAD",
      });
    }

    if (
      !Number.isInteger(intervalMinutes) ||
      intervalMinutes < 1 ||
      intervalMinutes > 60
    ) {
      return res.status(400).json({
        success: false,
        message: "Interval must be a whole number between 1 and 60 minutes",
      });
    }

    if (
      !Number.isInteger(timeoutMs) ||
      timeoutMs < 1000 ||
      timeoutMs > 30000
    ) {
      return res.status(400).json({
        success: false,
        message: "Timeout must be between 1000 and 30000 ms",
      });
    }

    if (
      !Number.isInteger(failureThreshold) ||
      failureThreshold < 1 ||
      failureThreshold > 10
    ) {
      return res.status(400).json({
        success: false,
        message: "Failure threshold must be between 1 and 10",
      });
    }

    if (
      !Array.isArray(expectedStatusCodes) ||
      expectedStatusCodes.length < 1 ||
      expectedStatusCodes.length > 20 ||
      !expectedStatusCodes.every(
        (code) => Number.isInteger(code) && code >= 100 && code <= 599,
      )
    ) {
      return res.status(400).json({
        success: false,
        message: "Expected status codes must be 1 to 20 numbers between 100 and 599",
      });
    }

    if (cleanKeyword.length > 100) {
      return res.status(400).json({
        success: false,
        message: "Keyword must be 100 characters or less",
      });
    }

    if (cleanKeyword && method === "HEAD") {
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
      name: cleanName,
      url: urlCheck.url,
      method,
      intervalMinutes,
      timeoutMs,
      expectedStatusCodes,
      keyword: cleanKeyword,
      failureThreshold,
    });

    const monitorObj = monitor.toObject();
    delete monitorObj.encryptedHeaders;

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

    return res.status(200).json({
      success: true,
      count: monitors.length,
      monitors,
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

    await CheckResult.deleteMany({ monitor: monitor._id });
    await monitor.deleteOne();

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
