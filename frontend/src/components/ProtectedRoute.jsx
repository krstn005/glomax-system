import { Navigate } from "react-router-dom";
import { ROLE_CONFIG } from "../roleConfig";

// Wraps a route (or group of routes) so it only renders for a logged-in
// user whose account role is in `allowedRoles`. Anyone else gets sent
// somewhere sensible instead of seeing the page:
//   - Not logged in at all -> the one login page
//   - Logged in as the WRONG role -> their OWN dashboard
export default function ProtectedRoute({ allowedRoles, children }) {
  const role = localStorage.getItem("role");
  const token = localStorage.getItem("access_token");

  if (!token || !role) {
    return <Navigate to="/login" replace />;
  }

  if (!allowedRoles.includes(role)) {
    const ownDashboard = ROLE_CONFIG[role]?.dashboardPath || "/";
    return <Navigate to={ownDashboard} replace />;
  }

  return children;
}