import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import SyncManager from "./components/SyncManager";
import ToastContainer from "./components/Toast";
import PrivateRoute from "./components/PrivateRoute";
import { isAuthenticated, checkAuthStatus } from "./services/api";

function App() {
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  // On mount, verify cookie validity with the server if online
  useEffect(() => {
    (async () => {
      if (isAuthenticated() && navigator.onLine) {
        // Server-side check to reconcile local flag with cookie reality
        await checkAuthStatus();
      }
      setAuthChecked(true);
    })();
  }, []);

  // Show nothing until the auth check is complete to avoid route flash
  if (!authChecked) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <Router>
      <SyncManager>
        <ToastContainer />
        <div className="min-h-screen bg-slate-900 text-slate-100 p-4">
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/dashboard"
              element={
                <PrivateRoute>
                  <DashboardPage />
                </PrivateRoute>
              }
            />
            <Route path="*" element={<Navigate to={isAuthenticated() ? "/dashboard" : "/login"} />} />
          </Routes>
        </div>
      </SyncManager>
    </Router>
  );
}

export default App;
