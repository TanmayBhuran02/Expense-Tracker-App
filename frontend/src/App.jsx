import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import { isAuthenticated } from "./services/api";

function App() {
  const isAuth = isAuthenticated();

  return (
    <Router>
      <div className="min-h-screen bg-slate-900 text-slate-100 p-4">
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/dashboard" element={isAuth ? <DashboardPage /> : <Navigate to="/login" />} />
          <Route path="*" element={<Navigate to={isAuth ? "/dashboard" : "/login"} />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
