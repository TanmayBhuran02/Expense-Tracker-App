import { Navigate } from "react-router-dom";
import { isAuthenticated } from "../services/api";

/**
 * PrivateRoute — guards authenticated routes.
 * Redirects to /login if the user is not authenticated.
 */
export default function PrivateRoute({ children }) {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }
  return children;
}
