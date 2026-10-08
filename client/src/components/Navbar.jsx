import { Link, useLocation, useNavigate } from "react-router-dom";
import axiosInstance from "../services/api";
import { useAuth } from "../context/AuthContext";
import Logo from "./Logo";

const Navbar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, setUser } = useAuth();

  const handleLogout = async () => {
    try {
      await axiosInstance.post("/auth/logout");
    } catch (error) {
      console.log(error);
    } finally {
      setUser(null);
      navigate("/login");
    }
  };

  const linkClass = (path) =>
    `inline-flex h-[42px] items-center rounded-full px-5 text-[16px] font-semibold transition-colors ${
      location.pathname === path ? "bg-white text-ink" : "text-white hover:bg-white/15"
    }`;

  return (
    <div className="mx-auto max-w-[1312px] px-6 pt-5 sm:px-16">
      <nav className="flex flex-wrap items-center justify-between gap-3 rounded-[34px] border border-white/25 bg-white/10 px-5 py-3 text-white backdrop-blur-md md:grid md:h-[68px] md:grid-cols-[1fr_auto_1fr] md:rounded-full md:py-0 md:pl-5 md:pr-3">
        <Link to="/dashboard" className="w-fit">
          <Logo />
        </Link>

        <div className="flex items-center gap-1.5">
          <Link to="/dashboard" className={linkClass("/dashboard")}>
            Monitors
          </Link>
          <Link to="/incidents" className={linkClass("/incidents")}>
            Incidents
          </Link>
          <Link to="/status-page" className={linkClass("/status-page")}>
            Status page
          </Link>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3">
          <Link
            to="/monitors/new"
            className="inline-flex h-[46px] items-center rounded-full bg-butter px-6 text-[15px] font-bold text-ink transition-colors hover:bg-white"
          >
            Add monitor
          </Link>

          <span className="hidden h-[46px] items-center gap-2.5 rounded-full bg-white/15 pl-1.5 pr-4 text-[15px] font-semibold lg:inline-flex">
            <span className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-full bg-white font-extrabold text-ink">
              {user?.name?.charAt(0).toUpperCase()}
            </span>
            <span className="max-w-[140px] truncate">{user?.name}</span>
          </span>

          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex h-[46px] items-center rounded-full border-2 border-white/80 px-5 text-[15px] font-bold transition-colors hover:bg-white hover:text-ink"
          >
            Log out
          </button>
        </div>
      </nav>
    </div>
  );
};

export default Navbar;
