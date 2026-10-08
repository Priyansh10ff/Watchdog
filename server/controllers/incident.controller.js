import mongoose from "mongoose";
import Incident from "../models/incident.model.js";
import Monitor from "../models/monitor.model.js";
import CheckResult from "../models/checkResult.model.js";

const STATUS_FILTERS = {
  active: { isResolved: false },
  open: { status: "open" },
  acknowledged: { status: "acknowledged" },
  resolved: { status: "resolved" },
};

const MONITOR_FIELDS = "name url status isActive";

const readPaging = (query) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 50);
  return { page, limit, skip: (page - 1) * limit };
};

const listIncidents = async (filter, query) => {
  const { page, limit, skip } = readPaging(query);

  const [incidents, total] = await Promise.all([
    Incident.find(filter)
      .sort({ startedAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("monitor", MONITOR_FIELDS),
    Incident.countDocuments(filter),
  ]);

  return {
    incidents,
    total,
    page,
    pages: Math.max(Math.ceil(total / limit), 1),
  };
};

const readStatusFilter = (status) => {
  if (status === undefined || status === "all") return { filter: {} };
  if (typeof status !== "string" || !Object.hasOwn(STATUS_FILTERS, status)) {
    return { error: "Status must be active, open, acknowledged, resolved or all" };
  }
  return { filter: STATUS_FILTERS[status] };
};

export const getIncidents = async (req, res) => {
  try {
    const statusCheck = readStatusFilter(req.query.status);

    if (statusCheck.error) {
      return res.status(400).json({
        success: false,
        message: statusCheck.error,
      });
    }

    const filter = { user: req.user._id, ...statusCheck.filter };

    if (req.query.monitor !== undefined) {
      if (!mongoose.isValidObjectId(req.query.monitor)) {
        return res.status(400).json({
          success: false,
          message: "Invalid monitor id",
        });
      }
      filter.monitor = req.query.monitor;
    }

    const data = await listIncidents(filter, req.query);

    return res.status(200).json({
      success: true,
      ...data,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

export const getMonitorIncidents = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({
        success: false,
        message: "Monitor not found",
      });
    }

    const monitor = await Monitor.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!monitor) {
      return res.status(404).json({
        success: false,
        message: "Monitor not found",
      });
    }

    const statusCheck = readStatusFilter(req.query.status);

    if (statusCheck.error) {
      return res.status(400).json({
        success: false,
        message: statusCheck.error,
      });
    }

    const data = await listIncidents(
      { user: req.user._id, monitor: monitor._id, ...statusCheck.filter },
      req.query,
    );

    return res.status(200).json({
      success: true,
      ...data,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

export const getIncident = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({
        success: false,
        message: "Incident not found",
      });
    }

    const incident = await Incident.findOne({
      _id: req.params.id,
      user: req.user._id,
    }).populate("monitor", MONITOR_FIELDS);

    if (!incident) {
      return res.status(404).json({
        success: false,
        message: "Incident not found",
      });
    }

    const checks = incident.monitor
      ? await CheckResult.find({
          monitor: incident.monitor._id,
          checkedAt: {
            $gte: incident.startedAt,
            $lte: incident.resolvedAt || new Date(),
          },
        })
          .sort({ checkedAt: -1 })
          .limit(100)
      : [];

    return res.status(200).json({
      success: true,
      incident,
      checks,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

export const acknowledgeIncident = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({
        success: false,
        message: "Incident not found",
      });
    }

    const incident = await Incident.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id, status: "open" },
      { $set: { status: "acknowledged", acknowledgedAt: new Date() } },
      { returnDocument: "after" },
    ).populate("monitor", MONITOR_FIELDS);

    if (incident) {
      return res.status(200).json({
        success: true,
        message: "Incident acknowledged",
        incident,
      });
    }

    const existing = await Incident.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Incident not found",
      });
    }

    return res.status(400).json({
      success: false,
      message:
        existing.status === "resolved"
          ? "Incident is already resolved"
          : "Incident is already acknowledged",
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};
