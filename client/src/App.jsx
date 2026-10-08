import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import Login from "./pages/Login";
import SignUp from "./pages/SignUp";
import Dashboard from "./pages/Dashboard";
import AddMonitor from "./pages/AddMonitor";
import EditMonitor from "./pages/EditMonitor";
import Incidents from "./pages/Incidents";

import ProtectedRoute from "./components/ProtectedRoute";
import PublicRoute from "./components/PublicRoute";
import PageLoader from "./components/PageLoader";

import { AuthProvider } from "./context/AuthContext";

const Landing = lazy(() => import("./pages/Landing"));

const App = () => {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<Landing />} />

            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />

            <Route
              path="/monitors/new"
              element={
                <ProtectedRoute>
                  <AddMonitor />
                </ProtectedRoute>
              }
            />

            <Route
              path="/monitors/:id/edit"
              element={
                <ProtectedRoute>
                  <EditMonitor />
                </ProtectedRoute>
              }
            />

            <Route
              path="/incidents"
              element={
                <ProtectedRoute>
                  <Incidents />
                </ProtectedRoute>
              }
            />

            <Route
              path="/login"
              element={
                <PublicRoute>
                  <Login />
                </PublicRoute>
              }
            />

            <Route
              path="/signup"
              element={
                <PublicRoute>
                  <SignUp />
                </PublicRoute>
              }
            />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
};

export default App;
