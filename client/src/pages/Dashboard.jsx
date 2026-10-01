import Navbar from "../components/Navbar";
import { useAuth } from "../context/AuthContext";

// Placeholder. This page will list the user's monitors once the monitor API exists.
const Dashboard = () => {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-[#f5f2ed]">
      <Navbar />

      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-semibold text-[#303030]">
          Welcome, {user?.name}
        </h1>

        <div className="mt-8 rounded-3xl border border-dashed border-[#d5d5d5] bg-white p-10 text-center">
          <p className="text-[15px] font-medium text-[#303030]">
            No monitors yet
          </p>
          <p className="mt-1 text-[13px] text-[#999999]">
            Add a website or API to start tracking its uptime.
          </p>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
