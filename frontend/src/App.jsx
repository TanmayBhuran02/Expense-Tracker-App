import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import SyncManager from "./components/SyncManager";
import ToastContainer from "./components/Toast";
import PrivateRoute from "./components/PrivateRoute";
import { isAuthenticated } from "./services/api";

function App() {
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
