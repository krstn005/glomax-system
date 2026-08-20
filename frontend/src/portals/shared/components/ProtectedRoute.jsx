import { Navigate } from "react-router-dom";
import { ROLE_CONFIG } from "../roleConfig";

export default function ProtectedRoute({ allowedRole, children }) {
  const token = localStorage.getItem("access_token");
  const role = localStorage.getItem("role");

  if (!token || !role) {
    return <Navigate to={ROLE_CONFIG[allowedRole].loginPath} replace />;
  }

  if (role !== allowedRole) {
    const dashboardPath = ROLE_CONFIG[role]?.dashboardPath || "/";
    return <Navigate to={dashboardPath} replace />;
  }

  return children;
}