import { Link } from "react-router-dom";
import AuthSidePanel from "./AuthSidePanel";

const AuthLayout = ({ title, subtitle, switchText, switchLabel, switchTo, children }) => {
  return (
    <div className="min-h-screen bg-[#f5f2ed]">
      <nav className="border-b border-gray-200 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link to="/login" className="text-2xl font-bold tracking-tight">
            Uptime<span className="text-[#ff6b35]">Tracker</span>
          </Link>

          <Link
            to={switchTo}
            className="rounded-full bg-[#f5f2ed] px-4 py-2 text-sm font-semibold transition-all hover:bg-[#303030] hover:text-white active:scale-95"
          >
            {switchLabel}
          </Link>
        </div>
      </nav>

      <main className="mx-auto grid max-w-5xl gap-5 px-4 py-10 sm:px-6 md:grid-cols-2 lg:px-8">
        <div className="rounded-3xl bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-semibold text-[#303030]">{title}</h1>
          <p className="mt-1 text-[13px] text-[#999999]">{subtitle}</p>

          {children}

          <p className="mt-5 text-center text-[13px] text-[#aaaaaa]">
            {switchText}{" "}
            <Link to={switchTo} className="font-medium text-[#303030] hover:text-[#ff6b35]">
              {switchLabel}
            </Link>
          </p>
        </div>

        <AuthSidePanel />
      </main>
    </div>
  );
};

export default AuthLayout;
