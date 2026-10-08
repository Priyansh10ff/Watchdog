import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import axiosInstance from "../services/api";
import Navbar from "../components/Navbar";
import MonitorForm from "../components/MonitorForm";
import { cardClass, inkBtn } from "../components/ui";

const toForm = (monitor) => ({
  name: monitor.name,
  url: monitor.url,
  method: monitor.method,
  intervalMinutes: monitor.intervalMinutes,
  timeoutSeconds: String(monitor.timeoutMs / 1000),
  expectedStatusCodes: monitor.expectedStatusCodes.join(", "),
  keyword: monitor.keyword || "",
  failureThreshold: String(monitor.failureThreshold),
});

const changedFields = (values, monitor) => {
  const changed = {};

  if (values.name.trim() !== monitor.name) changed.name = values.name;
  if (values.method !== monitor.method) changed.method = values.method;
  if (values.intervalMinutes !== monitor.intervalMinutes) {
    changed.intervalMinutes = values.intervalMinutes;
  }
  if (values.timeoutMs !== monitor.timeoutMs) changed.timeoutMs = values.timeoutMs;
  if (values.failureThreshold !== monitor.failureThreshold) {
    changed.failureThreshold = values.failureThreshold;
  }
  if (
    JSON.stringify(values.expectedStatusCodes) !==
    JSON.stringify(monitor.expectedStatusCodes)
  ) {
    changed.expectedStatusCodes = values.expectedStatusCodes;
  }
  if (values.keyword.trim() !== (monitor.keyword || "")) {
    changed.keyword = values.keyword;
  }

  return changed;
};

const EditMonitor = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [monitor, setMonitor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [err, setErr] = useState("");
  const [loader, setLoader] = useState(false);

  const fetchMonitor = async () => {
    setLoadError("");
    setLoading(true);
    try {
      const response = await axiosInstance.get(`/monitors/${id}`);
      setMonitor(response.data.monitor);
    } catch (error) {
      setLoadError(
        error.response?.data?.message ||
          "Could not reach the server. Check your connection and try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMonitor();
  }, [id]);

  const handleSubmit = async (values) => {
    const changed = changedFields(values, monitor);

    if (Object.keys(changed).length === 0) {
      navigate("/dashboard");
      return;
    }

    setErr("");
    setLoader(true);
    try {
      await axiosInstance.patch(`/monitors/${id}`, changed);

      navigate("/dashboard");
    } catch (error) {
      setErr(
        error.response?.data?.message ||
          "Could not reach the server. Check your connection and try again.",
      );
    } finally {
      setLoader(false);
    }
  };

  return (
    <div className="min-h-screen bg-deep text-white">
      <Navbar />

      <main className="mx-auto max-w-[1100px] px-6 pb-24 pt-4 sm:px-16">
        <Link to="/dashboard" className="text-[15px] font-medium underline underline-offset-4">
          Back to monitors
        </Link>

        <h1 className="mt-6 font-display text-[clamp(40px,6vw,68px)] font-extrabold leading-none tracking-[-2px]">
          Edit monitor
        </h1>

        {loading && (
          <div className="mt-10 h-[420px] animate-pulse rounded-[28px] bg-white/10" />
        )}

        {loadError && (
          <div className={`${cardClass} mt-10 p-8 text-ink`}>
            <p className="text-[16px] font-medium text-[#c8321a]">{loadError}</p>
            <button onClick={fetchMonitor} className={`${inkBtn} mt-5`}>
              Try again
            </button>
          </div>
        )}

        {!loading && monitor && (
          <>
            <p className="mt-3 max-w-xl text-[18px]">
              Change how {monitor.name} is watched. The address stays the same.
            </p>

            <MonitorForm
              key={monitor._id}
              initial={toForm(monitor)}
              urlLocked
              submitLabel="Save changes"
              busyLabel="Saving..."
              loader={loader}
              err={err}
              onSubmit={handleSubmit}
            />
          </>
        )}
      </main>
    </div>
  );
};

export default EditMonitor;
