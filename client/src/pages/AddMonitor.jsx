import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import axiosInstance from "../services/api";
import Navbar from "../components/Navbar";

const inputClass =
  "w-full h-[44px] rounded-full border border-[#d5d5d5] bg-white px-6 text-[13px] text-[#333] outline-none focus:border-[#aaaaaa] placeholder:text-[#c4c4c4]";

const labelClass = "mb-2 ml-2 block text-[12px] font-medium text-[#777777]";

const AddMonitor = () => {
  const [form, setForm] = useState({
    name: "",
    url: "",
    method: "GET",
    intervalMinutes: "1",
    timeoutSeconds: "10",
    expectedStatusCodes: "200",
    keyword: "",
    failureThreshold: "3",
  });
  const [err, setErr] = useState("");
  const [loader, setLoader] = useState(false);

  const navigate = useNavigate();

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    setLoader(true);
    try {
      await axiosInstance.post("/monitors", {
        name: form.name,
        url: form.url,
        method: form.method,
        intervalMinutes: Number(form.intervalMinutes),
        timeoutMs: Number(form.timeoutSeconds) * 1000,
        expectedStatusCodes: form.expectedStatusCodes
          .split(",")
          .map((code) => code.trim())
          .filter(Boolean)
          .map(Number),
        keyword: form.keyword,
        failureThreshold: Number(form.failureThreshold),
      });

      navigate("/dashboard");
    } catch (error) {
      setErr(error.response?.data?.message || "Could not add monitor.");
    } finally {
      setLoader(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f2ed]">
      <Navbar />

      <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <Link to="/dashboard" className="text-[13px] text-[#999999] hover:text-[#303030]">
          ← Back to dashboard
        </Link>

        <div className="mt-4 rounded-3xl bg-white p-8">
          <h1 className="text-2xl font-semibold text-[#303030]">Add monitor</h1>
          <p className="mt-1 text-[13px] text-[#999999]">
            We will check this address on a schedule and alert you when it goes
            down.
          </p>

          <form onSubmit={handleSubmit} className="mt-8">
            {err && (
              <p className="mb-4 text-center text-[13px] text-red-500">{err}</p>
            )}

            <label className={labelClass}>Name</label>
            <input
              type="text"
              name="name"
              placeholder="My website"
              value={form.name}
              onChange={handleChange}
              maxLength={60}
              required
              className={`${inputClass} mb-4`}
            />

            <label className={labelClass}>URL</label>
            <input
              type="url"
              name="url"
              placeholder="https://example.com"
              value={form.url}
              onChange={handleChange}
              required
              className={inputClass}
            />

            <details className="mt-6">
              <summary className="cursor-pointer text-[13px] font-medium text-[#303030]">
                Advanced settings
              </summary>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Method</label>
                  <select
                    name="method"
                    value={form.method}
                    onChange={handleChange}
                    className={inputClass}
                  >
                    <option value="GET">GET</option>
                    <option value="HEAD">HEAD</option>
                  </select>
                </div>

                <div>
                  <label className={labelClass}>Check every</label>
                  <select
                    name="intervalMinutes"
                    value={form.intervalMinutes}
                    onChange={handleChange}
                    className={inputClass}
                  >
                    <option value="1">1 minute</option>
                    <option value="2">2 minutes</option>
                    <option value="5">5 minutes</option>
                    <option value="10">10 minutes</option>
                    <option value="15">15 minutes</option>
                    <option value="30">30 minutes</option>
                    <option value="60">60 minutes</option>
                  </select>
                </div>

                <div>
                  <label className={labelClass}>Timeout</label>
                  <select
                    name="timeoutSeconds"
                    value={form.timeoutSeconds}
                    onChange={handleChange}
                    className={inputClass}
                  >
                    <option value="5">5 seconds</option>
                    <option value="10">10 seconds</option>
                    <option value="15">15 seconds</option>
                    <option value="30">30 seconds</option>
                  </select>
                </div>

                <div>
                  <label className={labelClass}>Alert after failures</label>
                  <select
                    name="failureThreshold"
                    value={form.failureThreshold}
                    onChange={handleChange}
                    className={inputClass}
                  >
                    <option value="1">1 failed check</option>
                    <option value="2">2 failed checks</option>
                    <option value="3">3 failed checks</option>
                    <option value="5">5 failed checks</option>
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className={labelClass}>
                    Status codes that count as up (comma separated)
                  </label>
                  <input
                    type="text"
                    name="expectedStatusCodes"
                    placeholder="200, 301, 302"
                    value={form.expectedStatusCodes}
                    onChange={handleChange}
                    className={inputClass}
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className={labelClass}>
                    Keyword the page must contain (optional, needs GET)
                  </label>
                  <input
                    type="text"
                    name="keyword"
                    placeholder="Sign in"
                    value={form.keyword}
                    onChange={handleChange}
                    maxLength={100}
                    className={inputClass}
                  />
                </div>
              </div>
            </details>

            <button
              type="submit"
              disabled={loader}
              className="mt-8 h-[44px] w-full rounded-full bg-[#ff9918] text-[13px] font-medium text-white transition hover:bg-[#f58c08] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loader ? "Adding..." : "Add monitor"}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
};

export default AddMonitor;
