import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

// Wrap pages like login and signup. A logged-in user is sent to the dashboard instead.
const PublicRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-gray-500">
        Loading...
      </div>
    );
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};

export default PublicRoute;

// NOTE: this is UX only. Real protection is the isAuthenticated middleware on the server.
// Anyone can edit frontend code, but they cannot get data from protected API routes.
