import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axiosInstance from "../services/api";
import { useAuth } from "../context/AuthContext";
import AuthLayout from "../components/AuthLayout";

const inputClass =
  "w-full h-[44px] rounded-full border border-[#d5d5d5] bg-white px-6 text-[13px] text-[#333] outline-none focus:border-[#aaaaaa] placeholder:text-[#c4c4c4]";

const labelClass = "mb-2 ml-2 block text-[12px] font-medium text-[#777777]";

const Login = () => {
  const [form, setForm] = useState({ email: "", password: "" });
  const [err, setErr] = useState("");
  const [loader, setLoader] = useState(false);

  const navigate = useNavigate();
  const { setUser } = useAuth();

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    setLoader(true);
    try {
      const response = await axiosInstance.post("/auth/login", form);
      setUser(response.data.user);
      navigate("/dashboard");
    } catch (error) {
      setErr(error.response?.data?.message || "Login failed. Try again.");
    } finally {
      setLoader(false);
    }
  };

  return (
    <AuthLayout
      title="Log in"
      subtitle="Welcome back. Enter your details to see your monitors."
      switchText="Don't have an account?"
      switchLabel="Sign up"
      switchTo="/signup"
    >
      <form onSubmit={handleSubmit} className="mt-8">
        {err && <p className="mb-4 text-center text-[13px] text-red-500">{err}</p>}

        <label className={labelClass}>Email</label>
        <input
          type="email"
          name="email"
          placeholder="you@example.com"
          autoComplete="email"
          value={form.email}
          onChange={handleChange}
          required
          className={`${inputClass} mb-4`}
        />

        <label className={labelClass}>Password</label>
        <input
          type="password"
          name="password"
          placeholder="Your password"
          autoComplete="current-password"
          value={form.password}
          onChange={handleChange}
          required
          className={inputClass}
        />

        <button
          type="submit"
          disabled={loader}
          className="mt-8 h-[44px] w-full rounded-full bg-[#ff9918] text-[13px] font-medium text-white transition hover:bg-[#f58c08] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loader ? "Logging in..." : "Log in"}
        </button>
      </form>
    </AuthLayout>
  );
};

export default Login;
