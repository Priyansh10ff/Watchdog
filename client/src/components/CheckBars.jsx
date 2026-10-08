import { SLOW_MS } from "../utils/monitorState";

const GREEN = "#3ddc84";
const AMBER = "#ffb020";
const RED = "#ff4b3a";
const GREY = "#c9c4b4";

const buildBars = (checks, paused, slots, height) => {
  const min = Math.round(height * 0.32);
  const range = height - min;
  const recent = checks.slice(-slots);
  const times = recent
    .filter((check) => check.isUp && check.responseTimeMs != null)
    .map((check) => check.responseTimeMs);
  const max = Math.max(...times, 1);

  const bars = recent.map((check) => {
    if (!check.isUp) {
      return { height: Math.round(height * 0.24), color: paused ? GREY : RED };
    }
    const ratio = Math.min((check.responseTimeMs || 0) / max, 1);
    const slow = check.responseTimeMs > SLOW_MS;
    return {
      height: Math.round(min + ratio * range),
      color: paused ? GREY : slow ? AMBER : GREEN,
    };
  });

  const empty = Array.from({ length: slots - bars.length }, () => ({
    height: Math.round(height * 0.2),
    color: "rgba(16,21,54,0.1)",
  }));

  return [...empty, ...bars];
};

const CheckBars = ({ checks = [], paused = false, slots = 24, height = 50 }) => {
  const bars = buildBars(checks, paused, slots, height);
  const failed = checks.filter((check) => !check.isUp).length;

  return (
    <div
      role="img"
      aria-label={
        checks.length === 0
          ? "No checks yet"
          : `${failed} of the last ${checks.length} checks failed`
      }
      className="flex items-end gap-1"
      style={{ height }}
    >
      {bars.map((bar, i) => (
        <span
          key={i}
          className="flex-1 rounded-[4px]"
          style={{ height: bar.height, background: bar.color }}
        />
      ))}
    </div>
  );
};

export default CheckBars;
