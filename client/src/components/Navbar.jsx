import { Link, useLocation, useNavigate } from "react-router-dom";
import axiosInstance from "../services/api";
import { useAuth } from "../context/AuthContext";
import Logo from "./Logo";
import { butterBtnSm, outlineBtn } from "./ui";

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
    `text-[15px] font-semibold underline-offset-8 transition-colors hover:text-butter ${
      location.pathname === path ? "text-butter underline" : "text-white"
    }`;

  return (
    <nav className="text-white">
      <div className="mx-auto flex max-w-[1312px] flex-wrap items-center justify-between gap-4 px-6 py-6 sm:px-16">
        <Link to="/dashboard">
          <Logo />
        </Link>

        <div className="flex flex-wrap items-center gap-4 sm:gap-6">
          <Link to="/dashboard" className={linkClass("/dashboard")}>
            Monitors
          </Link>
          <Link to="/incidents" className={linkClass("/incidents")}>
            Incidents
          </Link>
          <Link to="/monitors/new" className={butterBtnSm}>
            Add monitor
          </Link>

          <span className="hidden max-w-[160px] truncate text-[15px] font-medium md:block">
            {user?.name}
          </span>

          <button onClick={handleLogout} className={outlineBtn}>
            Log out
          </button>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
