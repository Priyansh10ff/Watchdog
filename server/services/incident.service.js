import Incident from "../models/incident.model.js";
import CheckResult from "../models/checkResult.model.js";

const QUICK_RETRY_MS = 60 * 1000;

export const applyResult = (monitor, result) => {
  const now = new Date();
  let transition = null;

  monitor.lastCheckedAt = now;
  monitor.lastResponseTimeMs = result.isUp ? result.responseTimeMs : undefined;

  if (result.isUp) {
    monitor.consecutiveFailures = 0;
    if (monitor.status === "down") transition = "recovered";
    monitor.status = "up";
  } else {
    monitor.consecutiveFailures += 1;
    if (
      monitor.consecutiveFailures >= monitor.failureThreshold &&
      monitor.status !== "down"
    ) {
      monitor.status = "down";
      transition = "down";
    }
  }

  const intervalMs = monitor.intervalMinutes * 60 * 1000;
  const needsQuickRetry = !result.isUp || monitor.status === "down";
  const waitMs = needsQuickRetry ? Math.min(intervalMs, QUICK_RETRY_MS) : intervalMs;
  monitor.nextCheckAt = new Date(now.getTime() + waitMs);

  return transition;
};

const errorOf = (result, at) => ({
  statusCode: result.statusCode ?? null,
  errorMessage: result.errorMessage || "",
  at,
});

const findFirstFailure = async (monitorId) => {
  const lastUp = await CheckResult.findOne({ monitor: monitorId, isUp: true })
    .sort({ checkedAt: -1 })
    .select("checkedAt");

  return CheckResult.findOne({
    monitor: monitorId,
    isUp: false,
    ...(lastUp ? { checkedAt: { $gt: lastUp.checkedAt } } : {}),
  })
    .sort({ checkedAt: 1 })
    .select("checkedAt statusCode errorMessage");
};

export const trackFailure = async (monitor, result) => {
  const at = monitor.lastCheckedAt || new Date();

  const existing = await Incident.findOneAndUpdate(
    { monitor: monitor._id, isResolved: false },
    { $inc: { failedChecks: 1 }, $set: { lastError: errorOf(result, at) } },
    { returnDocument: "after" },
  );

  if (existing) return { incident: existing, opened: false };

  try {
    const first = (await findFirstFailure(monitor._id)) || {
      checkedAt: at,
      ...result,
    };

    const incident = await Incident.create({
      monitor: monitor._id,
      user: monitor.user,
      startedAt: first.checkedAt,
      cause: {
        statusCode: first.statusCode ?? null,
        errorMessage: first.errorMessage || "",
      },
      lastError: errorOf(result, at),
      failedChecks: Math.max(monitor.consecutiveFailures, 1),
    });

    return { incident, opened: true };
  } catch (error) {
    if (error.code !== 11000) throw error;

    const incident = await Incident.findOne({
      monitor: monitor._id,
      isResolved: false,
    });
    return { incident, opened: false };
  }
};

export const resolveIncident = async (monitor) => {
  const resolvedAt = monitor.lastCheckedAt || new Date();

  const incident = await Incident.findOneAndUpdate(
    { monitor: monitor._id, isResolved: false },
    { $set: { status: "resolved", isResolved: true, resolvedAt } },
    { returnDocument: "after" },
  );

  if (!incident) return null;

  incident.durationMs = Math.max(
    resolvedAt.getTime() - incident.startedAt.getTime(),
    0,
  );
  await incident.save();

  return incident;
};

export const handleIncident = async (monitor, result, transition) => {
  try {
    if (transition === "recovered") {
      const incident = await resolveIncident(monitor);
      return { event: incident ? "resolved" : null, incident };
    }

    if (!result.isUp && monitor.status === "down") {
      const { incident, opened } = await trackFailure(monitor, result);
      return { event: opened ? "opened" : "updated", incident };
    }

    return { event: null, incident: null };
  } catch (error) {
    console.log(`Incident handling failed for ${monitor._id}:`, error.message);
    return { event: null, incident: null };
  }
};
