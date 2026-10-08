const styles = {
  up: { label: "Up", cls: "bg-[#d3f5e2] text-[#0b5a32]" },
  slow: { label: "Slow", cls: "bg-[#ffd966] text-[#5c3d00]" },
  down: { label: "Down", cls: "bg-[#c8321a] text-white" },
  paused: { label: "Paused", cls: "bg-[#d6d1c4] text-[#3d3a31]" },
  waiting: { label: "Pending", cls: "bg-[#e6e3ee] text-[#3b3a52]" },
  unknown: { label: "Pending", cls: "bg-[#e6e3ee] text-[#3b3a52]" },
  open: { label: "Open", cls: "bg-[#c8321a] text-white" },
  acknowledged: { label: "Acknowledged", cls: "bg-butter text-ink" },
  resolved: { label: "Resolved", cls: "bg-[#d3f5e2] text-[#0b5a32]" },
};

const StatusBadge = ({ status }) => {
  const style = styles[status] || styles.unknown;

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-3.5 py-1.5 text-[13px] font-bold ${style.cls}`}
    >
      {style.label}
    </span>
  );
};

export default StatusBadge;
