import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import apiClient from "../../../api/client";
import { ROLE_CONFIG } from "../roleConfig";
import logo from "../../../assets/images/logo.jpg";
import "../styles/portal-login.css";

// One shared, generic login page for Staff, Partner Installer, and Admin.
// It does not identify itself as belonging to any single role — after login,
// the account's `role` decides which dashboard it lands on.
export default function PortalLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // Backend field is still named "username" but accepts email or username —
      // no backend change needed here
      const res = await apiClient.post("/accounts/login/", {
        username: email,
        password,
      });

      const { access, refresh, role, username: name, user_id } = res.data;
      const config = ROLE_CONFIG[role];

      if (!config || role === "CUSTOMER") {
        setError("This login is for Staff, Partner Installer, and Admin accounts only.");
        setLoading(false);
        return;
      }

      localStorage.setItem("access_token", access);
      localStorage.setItem("refresh_token", refresh);
      localStorage.setItem("role", role);
      localStorage.setItem("username", name);
      localStorage.setItem("user_id", user_id);

      navigate(config.dashboardPath, { replace: true });
    } catch (err) {
      const msg =
        err?.response?.data?.detail ||
        "Invalid email or password. Please try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="portal-login-page">
      <div className="portal-login-brand">
        <img src={logo} alt="Glomax Solar Enterprises" className="portal-login-brand-logo" />
        <span className="portal-login-brand-name">Glomax Solar Enterprises</span>
      </div>

      <div className="portal-login-card">
        <h1 className="portal-login-title">System Login</h1>
        <p className="portal-login-subtitle">For authorized users only</p>

        <form onSubmit={handleSubmit} className="portal-login-form">
          <label htmlFor="email">Email Address</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />

          <label htmlFor="password">Password</label>
          <div className="portal-login-password-wrapper">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button
              type="button"
              className="portal-login-password-toggle"
              onClick={() => setShowPassword((prev) => !prev)}
              tabIndex={-1}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          {error && <p className="portal-login-error">{error}</p>}

          <button type="submit" disabled={loading} className="portal-login-button">
            {loading ? "Signing in..." : "Login"}
          </button>
        </form>
      </div>
    </div>
  );
}