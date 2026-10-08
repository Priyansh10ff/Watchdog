import StatusBadge from "./StatusBadge";
import { formatDateTime, formatDuration } from "../utils/time";
import { cardClass, smallInkBtn } from "./ui";

const describeError = (error) => {
  if (!error) return "-";
  if (error.errorMessage && error.statusCode) {
    return `${error.errorMessage} (HTTP ${error.statusCode})`;
  }
  return error.errorMessage || (error.statusCode ? `HTTP ${error.statusCode}` : "-");
};

const Stat = ({ label, children }) => (
  <div>
    <p className="text-[13px] text-soft">{label}</p>
    <p className="mt-1 text-[16px] font-bold">{children}</p>
  </div>
);

const IncidentList = ({ incidents, onAcknowledge, busyId }) => {
  return (
    <div className="space-y-5">
      {incidents.map((incident) => {
        const ongoing = incident.status !== "resolved";
        const duration = ongoing
          ? Date.now() - new Date(incident.startedAt).getTime()
          : incident.durationMs;

        return (
          <div key={incident._id} className={`${cardClass} p-7`}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <h3 className="truncate text-[22px] font-bold">
                  {incident.monitor?.name || "Deleted monitor"}
                </h3>
                <p className="truncate text-[15px] text-soft">{incident.monitor?.url}</p>
              </div>

              <StatusBadge status={incident.status} />
            </div>

            <div className="mt-6 grid grid-cols-2 gap-5 md:grid-cols-4">
              <Stat label="Started">{formatDateTime(incident.startedAt)}</Stat>
              <Stat label={ongoing ? "Down for" : "Lasted"}>{formatDuration(duration)}</Stat>
              <Stat label="Failed checks">{incident.failedChecks}</Stat>
              <Stat label={ongoing ? "Acknowledged" : "Resolved"}>
                {ongoing
                  ? formatDateTime(incident.acknowledgedAt)
                  : formatDateTime(incident.resolvedAt)}
              </Stat>
            </div>

            <div className="mt-6 rounded-2xl bg-cream px-5 py-4 text-[15px]">
              <p>
                <span className="text-soft">Cause: </span>
                {describeError(incident.cause)}
              </p>
              {ongoing && (
                <p className="mt-1">
                  <span className="text-soft">Latest error: </span>
                  {describeError(incident.lastError)}
                </p>
              )}
            </div>

            {incident.status === "open" && onAcknowledge && (
              <button
                type="button"
                onClick={() => onAcknowledge(incident._id)}
                disabled={busyId === incident._id}
                className={`${smallInkBtn} mt-6`}
              >
                Acknowledge
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default IncidentList;
