import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import axiosInstance from "../services/api";
import { useAuth } from "../context/AuthContext";
import AuthSidePanel from "../components/AuthSidePanel";

const inputClass =
  "w-full h-[44px] rounded-full border border-[#d5d5d5] px-6 text-[13px] text-[#333] outline-none focus:border-[#aaaaaa] placeholder:text-[#c4c4c4]";

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
      // The server sets the cookie and returns the new user, so the user is logged in right away
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
    <div className="flex min-h-screen items-center justify-center bg-[#D8D0C4] p-4 sm:p-8">
      <div className="flex min-h-[640px] w-full max-w-[1080px] overflow-hidden rounded-[36px] bg-white p-4 md:rounded-[52px]">
        {/* ================= LEFT SIDE ================= */}
        <div className="flex w-full items-center justify-center py-10 md:w-1/2">
          <form onSubmit={handleSubmit} className="w-full max-w-[340px]">
            <div className="mb-10 text-center">
              <h1 className="text-[34px] font-semibold tracking-[-1.5px] text-[#303030]">
                Sign Up 👋
              </h1>
              <p className="mt-4 text-[13px] text-[#999999]">
                Please enter your details.
              </p>
            </div>

            {err && (
              <p className="mb-3 text-center text-[13px] text-red-500">{err}</p>
            )}

            <input
              type="text"
              name="name"
              placeholder="Full Name"
              autoComplete="name"
              value={form.name}
              onChange={handleChange}
              required
              className={`${inputClass} mb-3`}
            />

            <input
              type="email"
              name="email"
              placeholder="Email"
              autoComplete="email"
              value={form.email}
              onChange={handleChange}
              required
              className={`${inputClass} mb-3`}
            />

            <input
              type="password"
              name="password"
              placeholder="Password (min 8 characters)"
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
              className="mt-6 h-[44px] w-full rounded-full bg-[#ff9918] text-[13px] font-medium text-white transition hover:bg-[#f58c08] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loader ? "Creating account..." : "Sign Up"}
            </button>

            <p className="mt-5 text-center text-[13px] text-[#aaaaaa]">
              Already have an account?{" "}
              <Link to="/login" className="font-medium text-[#333333]">
                Log In
              </Link>
            </p>
          </form>
        </div>

        {/* ================= RIGHT SIDE ================= */}
        <AuthSidePanel />
      </div>
    </div>
  );
};

export default SignUp;

// VIVA
// Q: Is minLength on the input enough?  No. It is only a convenience. The server validates again, because anyone can bypass the browser.
// Q: Why autoComplete values?           They let password managers fill and save credentials correctly.
