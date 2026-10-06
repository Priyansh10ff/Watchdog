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
