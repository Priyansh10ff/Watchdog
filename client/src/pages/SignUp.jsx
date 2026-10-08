import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import axiosInstance from "../services/api";
import { useAuth } from "../context/AuthContext";
import AuthLayout from "../components/AuthLayout";
import FormField from "../components/FormField";
import { cardClass, inkBtn, inputClass } from "../components/ui";

const SignUp = () => {
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [err, setErr] = useState("");
  const [loader, setLoader] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [passwordFocus, setPasswordFocus] = useState(false);

  const navigate = useNavigate();
  const { setUser } = useAuth();

  const mode = err ? "down" : passwordFocus ? "up" : "slow";

  const handleChange = (e) => {
    setErr("");
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
      setErr(
        error.response?.data?.message ||
          "Could not reach the server. Check your connection and try again.",
      );
    } finally {
      setLoader(false);
    }
  };

  return (
    <AuthLayout mode={mode}>
      <h1 className="font-display text-[clamp(40px,5.5vw,60px)] font-extrabold leading-none tracking-[-2px]">
        Create account
      </h1>
      <p className="mt-3 text-[18px]">Put Sentry on watch in a minute.</p>

      <div className={`${cardClass} mt-8 p-7`}>
        <form onSubmit={handleSubmit} className="space-y-5">
          {err && (
            <div
              role="alert"
              className="rounded-2xl bg-[#c8321a] px-4 py-3 text-[14px] font-medium text-white"
            >
              {err}
            </div>
          )}

          <FormField label="Name" htmlFor="name">
            <input
              id="name"
              type="text"
              name="name"
              placeholder="Your name"
              autoComplete="name"
              value={form.name}
              onChange={handleChange}
              maxLength={60}
              required
              className={inputClass}
            />
          </FormField>

          <FormField label="Email" htmlFor="email">
            <input
              id="email"
              type="email"
              name="email"
              placeholder="you@example.com"
              autoComplete="email"
              value={form.email}
              onChange={handleChange}
              required
              className={inputClass}
            />
          </FormField>

          <FormField label="Password" htmlFor="password" hint="At least 8 characters.">
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                name="password"
                autoComplete="new-password"
                value={form.password}
                onChange={handleChange}
                onFocus={() => setPasswordFocus(true)}
                onBlur={() => setPasswordFocus(false)}
                minLength={8}
                required
                className={`${inputClass} pr-20`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute inset-y-0 right-2 my-auto h-9 rounded-full px-3 text-[13px] font-semibold text-soft hover:text-ink"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </FormField>

          <button type="submit" disabled={loader} className={`${inkBtn} w-full`}>
            {loader ? "Creating account..." : "Create account"}
          </button>
        </form>
      </div>

      <p className="mt-8 text-[16px]">
        Already registered?{" "}
        <Link to="/login" className="font-bold underline underline-offset-4">
          Log in
        </Link>
      </p>
    </AuthLayout>
  );
};

export default SignUp;
