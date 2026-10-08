import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import PageLoader from "./PageLoader";

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <PageLoader />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

export default ProtectedRoute;
