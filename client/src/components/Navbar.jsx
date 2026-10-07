import { Link, useLocation, useNavigate } from "react-router-dom";
import axiosInstance from "../services/api";
import { useAuth } from "../context/AuthContext";

const Navbar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, setUser } = useAuth();

  const isActive = (path) => {
    return location.pathname === path;
  };

  const handleLogout = async () => {
    try {
      // The cookie is httpOnly, so only the server can clear it
      await axiosInstance.post("/auth/logout");
    } catch (error) {
      console.log(error);
    } finally {
      setUser(null);
      navigate("/login");
    }
  };

  return (
    <nav className="sticky top-0 z-50 border-b border-gray-200 bg-white/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <Link to="/dashboard" className="text-2xl font-bold tracking-tight">
          Uptime<span className="text-[#ff6b35]">Tracker</span>
        </Link>

        <div className="flex items-center gap-7">
          <Link
            to="/dashboard"
            className={`text-sm font-medium transition-colors ${
              isActive("/dashboard")
                ? "text-[#ff6b35]"
                : "text-gray-600 hover:text-[#ff6b35]"
            }`}
          >
            Dashboard
          </Link>

          <Link
            to="/incidents"
            className={`text-sm font-medium transition-colors ${
              isActive("/incidents")
                ? "text-[#ff6b35]"
                : "text-gray-600 hover:text-[#ff6b35]"
            }`}
          >
            Incidents
          </Link>

          <span className="hidden text-sm text-gray-500 sm:block">
            {user?.name}
          </span>

          <button
            onClick={handleLogout}
            className="rounded-full bg-[#f5f2ed] px-4 py-2 text-sm font-semibold transition-all hover:bg-[#303030] hover:text-white active:scale-95"
          >
            Logout
          </button>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
