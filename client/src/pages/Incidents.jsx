import { useCallback, useEffect, useState } from "react";
import axiosInstance from "../services/api";
import Navbar from "../components/Navbar";
import IncidentList from "../components/IncidentList";
import { cardClass, inkBtn } from "../components/ui";

const FILTERS = [
  { value: "active", label: "Active" },
  { value: "resolved", label: "Resolved" },
  { value: "all", label: "All" },
];

const REFRESH_MS = 30000;

const Incidents = () => {
  const [filter, setFilter] = useState("active");
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ incidents: [], total: 0, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busyId, setBusyId] = useState(null);

  const fetchIncidents = useCallback(
    async (silent = false) => {
      if (!silent) {
        setError("");
        setLoading(true);
      }
      try {
        const response = await axiosInstance.get("/incidents", {
          params: { status: filter, page, limit: 10 },
        });
        setData(response.data);
        setError("");
      } catch (error) {
        if (!silent) {
          setError(
            error.response?.data?.message ||
              "Could not reach the server. Check your connection and try again.",
          );
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [filter, page],
  );

  useEffect(() => {
    fetchIncidents();
    const timer = setInterval(() => fetchIncidents(true), REFRESH_MS);
    return () => clearInterval(timer);
  }, [fetchIncidents]);

  const changeFilter = (value) => {
    setFilter(value);
    setPage(1);
  };

  const handleAcknowledge = async (id) => {
    setActionError("");
    setBusyId(id);
    try {
      const response = await axiosInstance.patch(`/incidents/${id}/acknowledge`);
      setData((prev) => ({
        ...prev,
        incidents: prev.incidents.map((incident) =>
          incident._id === id ? response.data.incident : incident,
        ),
      }));
    } catch (error) {
      setActionError(error.response?.data?.message || "Could not acknowledge.");
    } finally {
      setBusyId(null);
    }
  };

  const emptyText = {
    active: "No active incidents. Every monitor is answering.",
    resolved: "No resolved incidents yet.",
    all: "No incidents yet.",
  }[filter];

  return (
    <div className="min-h-screen bg-deep text-white">
      <Navbar />

      <main className="mx-auto max-w-[960px] px-6 pb-24 pt-4 sm:px-16">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <h1 className="font-display text-[clamp(40px,6vw,64px)] font-extrabold leading-none tracking-[-2px]">
              Incidents
            </h1>
            {!loading && !error && (
              <p className="mt-3 text-[18px]">
                {data.total} {data.total === 1 ? "incident" : "incidents"}
              </p>
            )}
          </div>

          <div role="group" aria-label="Filter incidents" className="flex gap-1 rounded-full bg-white/15 p-1">
            {FILTERS.map((item) => (
              <button
                key={item.value}
                type="button"
                aria-pressed={filter === item.value}
                onClick={() => changeFilter(item.value)}
                className={`min-h-11 rounded-full px-5 text-[15px] font-bold transition-colors ${
                  filter === item.value ? "bg-butter text-ink" : "text-white hover:bg-white/10"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {actionError && (
          <div
            role="alert"
            className="mt-6 rounded-2xl bg-ink px-4 py-3 text-[14px] font-medium text-butter"
          >
            {actionError}
          </div>
        )}

        {loading && (
          <div className="mt-10 space-y-5">
            {[0, 1].map((item) => (
              <div key={item} className="h-[240px] animate-pulse rounded-[28px] bg-white/10" />
            ))}
          </div>
        )}

        {error && (
          <div className={`${cardClass} mt-10 p-8`}>
            <p className="text-[16px] font-medium text-[#c8321a]">{error}</p>
            <button onClick={() => fetchIncidents()} className={`${inkBtn} mt-5`}>
              Try again
            </button>
          </div>
        )}

        {!loading && !error && data.incidents.length === 0 && (
          <div className={`${cardClass} mt-10 p-10`}>
            <p className="font-display text-[28px] font-extrabold tracking-[-1px]">
              {emptyText}
            </p>
          </div>
        )}

        {!loading && !error && data.incidents.length > 0 && (
          <div className="mt-10">
            <IncidentList
              incidents={data.incidents}
              onAcknowledge={handleAcknowledge}
              busyId={busyId}
            />

            {data.pages > 1 && (
              <div className="mt-10 flex items-center justify-center gap-5 text-[15px]">
                <button
                  type="button"
                  onClick={() => setPage((p) => p - 1)}
                  disabled={page <= 1}
                  className="min-h-11 rounded-full bg-white px-6 font-bold text-ink disabled:opacity-40"
                >
                  Previous
                </button>
                <span>
                  Page {page} of {data.pages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page >= data.pages}
                  className="min-h-11 rounded-full bg-white px-6 font-bold text-ink disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default Incidents;
