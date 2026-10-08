import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axiosInstance from "../services/api";
import { useAuth } from "../context/AuthContext";
import AuthLayout from "../components/AuthLayout";

const inputClass =
  "w-full h-[44px] rounded-full border border-[#d5d5d5] bg-white px-6 text-[13px] text-[#333] outline-none focus:border-[#aaaaaa] placeholder:text-[#c4c4c4]";

const labelClass = "mb-2 ml-2 block text-[12px] font-medium text-[#777777]";

const SignUp = () => {
  const [form, setForm] = useState({ name: "", email: "", password: "" });
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
      const response = await axiosInstance.post("/auth/register", form);
      setUser(response.data.user);
      navigate("/dashboard");
    } catch (error) {
      setErr(error.response?.data?.message || "Sign up failed. Try again.");
    } finally {
      setLoader(false);
    }
  };

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Start monitoring your websites and APIs in a minute."
      switchText="Already have an account?"
      switchLabel="Log in"
      switchTo="/login"
    >
      <form onSubmit={handleSubmit} className="mt-8">
        {err && <p className="mb-4 text-center text-[13px] text-red-500">{err}</p>}

        <label className={labelClass}>Name</label>
        <input
          type="text"
          name="name"
          placeholder="Full name"
          autoComplete="name"
          value={form.name}
          onChange={handleChange}
          required
          className={`${inputClass} mb-4`}
        />

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
          placeholder="At least 8 characters"
          autoComplete="new-password"
          value={form.password}
          onChange={handleChange}
          required
          minLength={8}
          className={inputClass}
        />

        <button
          type="submit"
          disabled={loader}
          className="mt-8 h-[44px] w-full rounded-full bg-[#ff9918] text-[13px] font-medium text-white transition hover:bg-[#f58c08] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loader ? "Creating account..." : "Sign up"}
        </button>
      </form>
    </AuthLayout>
  );
};

export default SignUp;
