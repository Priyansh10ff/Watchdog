import { useCallback, useEffect, useState } from "react";
import axiosInstance from "../services/api";
import Navbar from "../components/Navbar";
import IncidentList from "../components/IncidentList";

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
          setError(error.response?.data?.message || "Could not load incidents.");
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
    <div className="min-h-screen bg-[#f5f2ed]">
      <Navbar />

      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-[#303030]">Incidents</h1>
            {!loading && !error && (
              <p className="mt-1 text-[13px] text-[#999999]">
                {data.total} {data.total === 1 ? "incident" : "incidents"}
              </p>
            )}
          </div>

          <div className="flex gap-2 rounded-full bg-white p-1">
            {FILTERS.map((item) => (
              <button
                key={item.value}
                onClick={() => changeFilter(item.value)}
                className={`rounded-full px-4 py-2 text-[13px] font-semibold transition ${
                  filter === item.value
                    ? "bg-[#303030] text-white"
                    : "text-[#303030] hover:bg-[#f5f2ed]"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {actionError && (
          <p className="mt-4 text-[13px] text-red-500">{actionError}</p>
        )}

        {loading && (
          <p className="mt-10 text-center text-[13px] text-[#999999]">
            Loading incidents...
          </p>
        )}

        {error && (
          <div className="mt-10 rounded-3xl bg-white p-10 text-center">
            <p className="text-[14px] text-red-500">{error}</p>
            <button
              onClick={() => fetchIncidents()}
              className="mt-4 rounded-full bg-[#303030] px-5 py-2 text-[13px] font-medium text-white"
            >
              Try again
            </button>
          </div>
        )}

        {!loading && !error && data.incidents.length === 0 && (
          <div className="mt-10 rounded-3xl border border-dashed border-[#d5d5d5] bg-white p-10 text-center">
            <p className="text-[15px] font-medium text-[#303030]">{emptyText}</p>
          </div>
        )}

        {!loading && !error && data.incidents.length > 0 && (
          <div className="mt-8">
            <IncidentList
              incidents={data.incidents}
              onAcknowledge={handleAcknowledge}
              busyId={busyId}
            />

            {data.pages > 1 && (
              <div className="mt-8 flex items-center justify-center gap-4 text-[13px]">
                <button
                  onClick={() => setPage((p) => p - 1)}
                  disabled={page <= 1}
                  className="rounded-full bg-white px-4 py-2 font-semibold text-[#303030] disabled:opacity-40"
                >
                  Previous
                </button>
                <span className="text-[#999999]">
                  Page {page} of {data.pages}
                </span>
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page >= data.pages}
                  className="rounded-full bg-white px-4 py-2 font-semibold text-[#303030] disabled:opacity-40"
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
