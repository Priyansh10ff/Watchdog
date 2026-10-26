export const formatDuration = (ms) => {
  const value = Number(ms);

  if (ms === null || ms === undefined || !Number.isFinite(value)) return "unknown";

  const total = Math.max(0, Math.round(value / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
};
