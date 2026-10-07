const styles = {
  up: { label: "Up", wrap: "bg-green-50 text-green-700", dot: "bg-green-500" },
  down: { label: "Down", wrap: "bg-red-50 text-red-700", dot: "bg-red-500" },
  unknown: { label: "Pending", wrap: "bg-gray-100 text-gray-600", dot: "bg-gray-400" },
  paused: { label: "Paused", wrap: "bg-orange-50 text-orange-700", dot: "bg-[#ff9918]" },
  open: { label: "Open", wrap: "bg-red-50 text-red-700", dot: "bg-red-500" },
  acknowledged: { label: "Acknowledged", wrap: "bg-yellow-50 text-yellow-800", dot: "bg-yellow-500" },
  resolved: { label: "Resolved", wrap: "bg-green-50 text-green-700", dot: "bg-green-500" },
};

const StatusBadge = ({ status }) => {
  const style = styles[status] || styles.unknown;

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-1 text-[12px] font-medium ${style.wrap}`}
    >
      <span className={`h-2 w-2 rounded-full ${style.dot}`} />
      {style.label}
    </span>
  );
};

export default StatusBadge;
