import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import axiosInstance from "../services/api";
import Navbar from "../components/Navbar";
import MonitorForm from "../components/MonitorForm";

const initial = {
  name: "",
  url: "",
  method: "GET",
  intervalMinutes: 1,
  timeoutSeconds: "10",
  expectedStatusCodes: "200",
  keyword: "",
  failureThreshold: "3",
};

const AddMonitor = () => {
  const [err, setErr] = useState("");
  const [loader, setLoader] = useState(false);

  const navigate = useNavigate();

  const handleSubmit = async (values) => {
    setErr("");
    setLoader(true);
    try {
      await axiosInstance.post("/monitors", values);

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
          Add monitor
        </h1>
        <p className="mt-3 max-w-xl text-[18px]">
          Tell Watchdog what to check and when to raise an incident.
        </p>

        <MonitorForm
          initial={initial}
          submitLabel="Add monitor"
          busyLabel="Adding..."
          loader={loader}
          err={err}
          onSubmit={handleSubmit}
        />
      </main>
    </div>
  );
};

export default AddMonitor;
