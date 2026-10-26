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
    `inline-flex h-[42px] w-full items-center justify-center rounded-full px-4 text-[16px] sm:w-auto font-semibold transition-colors ${
      location.pathname === path ? "bg-white text-ink" : "text-white hover:bg-white/15"
    }`;

  return (
    <div className="mx-auto max-w-[1312px] px-6 pt-5 sm:px-16">
      <nav className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[34px] border border-white/25 bg-white/10 px-4 py-3 text-white backdrop-blur-md xl:h-[68px] xl:flex-nowrap xl:rounded-full xl:py-0 xl:pl-5 xl:pr-3">
        <Link to="/dashboard" className="order-1 flex shrink-0 items-center xl:flex-1">
          <Logo />
        </Link>

        <div className="order-3 grid w-full grid-cols-2 gap-1.5 sm:flex sm:items-center sm:justify-center xl:order-2 xl:w-auto xl:shrink-0">
          <Link to="/dashboard" className={linkClass("/dashboard")}>
            Monitors
          </Link>
          <Link to="/incidents" className={linkClass("/incidents")}>
            Incidents
          </Link>
          <Link to="/status-page" className={linkClass("/status-page")}>
            Status page
          </Link>
          <Link to="/alerts" className={linkClass("/alerts")}>
            Alerts
          </Link>
        </div>

        <div className="order-2 ml-auto flex shrink-0 items-center justify-end gap-3 xl:order-3 xl:ml-0 xl:flex-1">
          <Link
            to="/monitors/new"
            className="inline-flex h-[46px] items-center whitespace-nowrap rounded-full bg-butter px-6 text-[15px] font-bold text-ink transition-colors hover:bg-white"
          >
            Add monitor
          </Link>

          <span
            className="hidden h-[46px] items-center gap-2.5 rounded-full bg-white/15 pl-1.5 text-[15px] font-semibold sm:inline-flex 2xl:pr-4"
            title={user?.name}
          >
            <span className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-full bg-white font-extrabold text-ink">
              {user?.name?.charAt(0).toUpperCase()}
            </span>
            <span className="hidden max-w-[140px] truncate 2xl:inline">{user?.name}</span>
            <span className="w-1.5 2xl:hidden" />
          </span>

          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex h-[46px] items-center whitespace-nowrap rounded-full border-2 border-white/80 px-5 text-[15px] font-bold transition-colors hover:bg-white hover:text-ink"
          >
            Log out
          </button>
        </div>
      </nav>
    </div>
  );
};

export default Navbar;
