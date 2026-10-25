import { Navigate } from "react-router-dom";
import { ROLE_CONFIG } from "../roleConfig";

// Wraps a route (or group of routes) so it only renders for a logged-in
// user whose account role is in `allowedRoles`. Anyone else gets sent
// somewhere sensible instead of seeing the page:
//   - Not logged in at all -> the correct login page for that section
//   - Logged in as the WRONG role -> their OWN dashboard (not an error
//     page - if a Customer somehow lands on a Staff URL, they're just
//     bounced back to their own Dashboard, not shown a scary error)
export default function ProtectedRoute({ allowedRoles, children }) {
  const role = localStorage.getItem("role");
  const token = localStorage.getItem("access_token");

  if (!token || !role) {
    const fallbackLogin = allowedRoles.includes("CUSTOMER")
      ? "/login"
      : ROLE_CONFIG[allowedRoles[0]]?.loginPath || "/login";
    return <Navigate to={fallbackLogin} replace />;
  }

  if (!allowedRoles.includes(role)) {
    const ownDashboard = ROLE_CONFIG[role]?.dashboardPath || "/";
    return <Navigate to={ownDashboard} replace />;
  }

  return children;
}