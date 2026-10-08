import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import axiosInstance from "../services/api";
import Navbar from "../components/Navbar";
import FormField from "../components/FormField";
import ChipGroup from "../components/ChipGroup";
import { cardClass, inkBtn, inputClass } from "../components/ui";

const intervalOptions = [1, 2, 5, 10, 15, 30, 60].map((n) => ({
  value: n,
  label: `${n} min`,
}));

const timeoutOptions = [5, 10, 15, 30].map((n) => ({
  value: n,
  label: `${n}s`,
}));

const methodOptions = [
  { value: "GET", label: "GET" },
  { value: "HEAD", label: "HEAD" },
];

const thresholdOptions = [1, 2, 3, 5].map((n) => ({
  value: n,
  label: String(n),
}));

const SectionTitle = ({ title, text }) => (
  <div>
    <h2 className="font-display text-[26px] font-extrabold tracking-[-0.5px]">
      {title}
    </h2>
    <p className="text-[14px] text-soft">{text}</p>
  </div>
);

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

  const setField = (name, value) => {
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const codes = form.expectedStatusCodes
    .split(",")
    .map((code) => code.trim())
    .filter(Boolean);

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
        expectedStatusCodes: codes.map(Number),
        keyword: form.keyword,
        failureThreshold: Number(form.failureThreshold),
      });

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

  const preview = [
    `${form.method} ${form.url || "https://your-site.com"}`,
    `every ${form.intervalMinutes} min, timeout ${form.timeoutSeconds}s`,
    `up when the status is ${codes.length ? codes.join(", ") : "not set"}`,
    form.keyword ? `and the page contains "${form.keyword}"` : null,
    `incident after ${form.failureThreshold} failed ${
      form.failureThreshold === "1" ? "check" : "checks"
    } in a row`,
  ].filter(Boolean);

  return (
    <div className="min-h-screen bg-deep text-white">
      <Navbar />

      <main className="mx-auto max-w-[1100px] px-6 pb-24 pt-4 sm:px-16">
        <Link to="/dashboard" className="text-[15px] font-medium underline underline-offset-4">
          Back to monitors
        </Link>

        <h1 className="mt-6 font-display text-[clamp(40px,6vw,68px)] font-extrabold leading-none tracking-[-2px]">
          Add monitor
        </h1>
        <p className="mt-3 max-w-xl text-[18px]">
          Tell Watchdog what to check and when to raise an incident.
        </p>

        <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_320px]">
          <div className={cardClass}>
            <form onSubmit={handleSubmit}>
              {err && (
                <div
                  role="alert"
                  className="m-6 mb-0 rounded-2xl bg-[#c8321a] px-4 py-3 text-[14px] font-medium text-white"
                >
                  {err}
                </div>
              )}

              <section className="space-y-5 p-7">
                <SectionTitle title="Target" text="What to check." />

                <FormField label="Name" htmlFor="name">
                  <input
                    id="name"
                    type="text"
                    name="name"
                    placeholder="Marketing site"
                    value={form.name}
                    onChange={handleChange}
                    maxLength={60}
                    required
                    className={inputClass}
                  />
                </FormField>

                <FormField
                  label="URL"
                  htmlFor="url"
                  hint="Must start with http:// or https://"
                >
                  <input
                    id="url"
                    type="url"
                    name="url"
                    placeholder="https://example.com"
                    value={form.url}
                    onChange={handleChange}
                    required
                    className={inputClass}
                  />
                </FormField>
              </section>

              <section className="space-y-5 border-t border-ink/15 p-7">
                <SectionTitle title="Schedule" text="How often to check." />

                <FormField label="Check every">
                  <ChipGroup
                    name="intervalMinutes"
                    options={intervalOptions}
                    value={form.intervalMinutes}
                    onChange={setField}
                  />
                </FormField>

                <FormField
                  label="Give up on a request after"
                  hint="A request with no reply by then counts as a failed check."
                >
                  <ChipGroup
                    name="timeoutSeconds"
                    options={timeoutOptions}
                    value={form.timeoutSeconds}
                    onChange={setField}
                  />
                </FormField>
              </section>

              <section className="space-y-5 border-t border-ink/15 p-7">
                <SectionTitle
                  title="Detection"
                  text="What counts as up, and when to raise an incident."
                />

                <FormField
                  label="Request method"
                  hint="HEAD is lighter but cannot check page content."
                >
                  <ChipGroup
                    name="method"
                    options={methodOptions}
                    value={form.method}
                    onChange={setField}
                  />
                </FormField>

                <FormField
                  label="Failed checks in a row before an incident"
                  hint="Waiting for more than one failure avoids false alarms from a single dropped request."
                >
                  <ChipGroup
                    name="failureThreshold"
                    options={thresholdOptions}
                    value={form.failureThreshold}
                    onChange={setField}
                  />
                </FormField>

                <FormField
                  label="Status codes that count as up"
                  htmlFor="expectedStatusCodes"
                  hint="Separate with commas. A login-protected site can add 401 and 403."
                >
                  <input
                    id="expectedStatusCodes"
                    type="text"
                    name="expectedStatusCodes"
                    placeholder="200, 301, 302"
                    value={form.expectedStatusCodes}
                    onChange={handleChange}
                    className={inputClass}
                  />
                </FormField>

                <FormField
                  label="Keyword the page must contain (optional)"
                  htmlFor="keyword"
                  hint="Catches a page that answers 200 but shows an error. Needs GET."
                >
                  <input
                    id="keyword"
                    type="text"
                    name="keyword"
                    placeholder="Sign in"
                    value={form.keyword}
                    onChange={handleChange}
                    maxLength={100}
                    className={inputClass}
                  />
                </FormField>
              </section>

              <div className="border-t border-ink/15 p-7">
                <button
                  type="submit"
                  disabled={loader}
                  className={`${inkBtn} w-full sm:w-auto`}
                >
                  {loader ? "Adding..." : "Add monitor"}
                </button>
              </div>
            </form>
          </div>

          <aside className="lg:sticky lg:top-6 lg:self-start">
            <div className={`${cardClass} p-7`}>
              <h2 className="font-display text-[24px] font-extrabold tracking-[-0.5px]">
                What will run
              </h2>
              <p className="mt-1 text-[13px] text-soft">
                Updates as you change the form.
              </p>

              <div className="mt-5 rounded-[14px] bg-ink p-5">
                <ul className="space-y-3 break-words text-[14px] leading-relaxed text-butter">
                  {preview.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
};

export default AddMonitor;
