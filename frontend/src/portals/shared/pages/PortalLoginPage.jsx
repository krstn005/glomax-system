import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Eye,
  EyeOff,
  UserRound,
  Lock,
  ShieldCheck,
  Headset,
  HardHat,
  ClipboardCheck,
  BarChart3,
  Users,
  Inbox,
  FileText,
  CalendarDays,
  ClipboardList,
  Star,
  AlertCircle,
  AlertTriangle,
  Info,
  Loader2,
} from "lucide-react";
import apiClient from "../../../api/client";
import { saveSession, getApiError } from "../../../api/twoFactor";
import TwoFactorStep from "../../../components/auth/TwoFactorStep";
import { ROLE_CONFIG } from "../../../roleConfig";
import logo from "../../../assets/images/logo.jpg";
import "../styles/portal-login.css";

// What each portal shows. The real role of the account (from the login
// response) still decides which dashboard opens after sign in.
const PORTAL_INFO = {
  ADMIN: {
    icon: ShieldCheck,
    headline: "Run the whole operation",
    text: "Approve assessments, set prices, and keep an eye on every solar installation.",
    subtitle: "Sign in to manage the whole system",
    features: [
      { icon: ClipboardCheck, label: "Approve roof assessments" },
      { icon: BarChart3, label: "See reports and analytics" },
      { icon: Users, label: "Manage workers and pricing" },
    ],
    forgot: "Please contact the system administrator to reset your password.",
  },
  STAFF: {
    icon: Headset,
    headline: "Keep every request moving",
    text: "Answer customers, send quotations, and assign installers for site visits.",
    subtitle: "Sign in to handle requests and quotations",
    features: [
      { icon: Inbox, label: "Handle customer inquiries" },
      { icon: FileText, label: "Prepare and send quotations" },
      { icon: CalendarDays, label: "Assign installers and visits" },
    ],
    forgot: "Ask the Admin to reset your password. They can do it from the Workers page.",
  },
  PARTNER_INSTALLER: {
    icon: HardHat,
    headline: "Your jobs, all in one place",
    text: "See your assigned roofs, plan your site visits, and track your customer ratings.",
    subtitle: "Sign in to see your jobs and schedule",
    features: [
      { icon: ClipboardList, label: "View assigned tickets" },
      { icon: CalendarDays, label: "Track your visit schedule" },
      { icon: Star, label: "See your customer ratings" },
    ],
    forgot: "Ask the Admin to reset your password. They can do it from the Workers page.",
  },
};

export default function PortalLoginPage({ role }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // Set after the password is accepted - shows the 2FA step
  const [challenge, setChallenge] = useState(null);
  const navigate = useNavigate();

  const roleLabel = ROLE_CONFIG[role]?.label || "System";
  const info = PORTAL_INFO[role] || PORTAL_INFO.STAFF;
  const RoleIcon = info.icon;
  // Each role has its own separate login page. This page only lets in
  // accounts of its own role (Staff, Partner Installer or Admin).
  const wrongAccountMessage = `This login page is for ${roleLabel} accounts only. Please use the login page for your account.`;

  function checkCapsLock(e) {
    if (typeof e.getModifierState === "function") {
      setCapsLock(e.getModifierState("CapsLock"));
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // Backend field is still named "username" but accepts email or username.
      // We also send which login page this is, so the backend stops an
      // account of another role BEFORE the 2FA step (no SMS or email
      // code is wasted).
      const res = await apiClient.post("/accounts/login/", {
        username: email.trim(),
        password,
        portal: role,
      });

      // Extra safety check: only this page's role can continue
      if (res.data.role !== role) {
        setPassword("");
        setError(wrongAccountMessage);
        return;
      }

      setChallenge(res.data);
    } catch (err) {
      if (err?.response?.data?.wrong_portal) {
        // Account belongs to another role's login page
        setPassword("");
        setError(wrongAccountMessage);
      } else if (err?.response?.status === 401) {
        setError(
          "Wrong email/username or password, or this account has been deactivated. Please try again."
        );
      } else {
        setError(getApiError(err, "Something went wrong. Please try again."));
      }
    } finally {
      setLoading(false);
    }
  };

  // Called only after the 2FA code is correct
  function handleAuthSuccess(data) {
    if (data.role !== role || !ROLE_CONFIG[role]) {
      setChallenge(null);
      setPassword("");
      setError(wrongAccountMessage);
      return;
    }
    saveSession(data);
    navigate(ROLE_CONFIG[role].dashboardPath, { replace: true });
  }

  return (
    <div className="pl-page">
      {/* Left: brand panel */}
      <aside className="pl-brand">
        <div className="pl-brand-glow" aria-hidden="true" />
        <div className="pl-brand-grid" aria-hidden="true" />

        <div className="pl-brand-top">
          <span className="pl-logo-ring">
            <img src={logo} alt="Glomax Solar Enterprises" />
          </span>
          <div>
            <p className="pl-brand-name">Glomax Solar</p>
            <p className="pl-brand-sub">Enterprises</p>
          </div>
        </div>

        <div className="pl-brand-body">
          <span className="pl-portal-pill">
            <RoleIcon size={14} />
            {roleLabel} Portal
          </span>
          <h2 className="pl-brand-headline">{info.headline}</h2>
          <p className="pl-brand-text">{info.text}</p>

          <ul className="pl-features">
            {info.features.map(({ icon: Icon, label }) => (
              <li key={label}>
                <span className="pl-feature-icon">
                  <Icon size={16} />
                </span>
                {label}
              </li>
            ))}
          </ul>
        </div>

        <p className="pl-brand-foot">© {new Date().getFullYear()} Glomax Solar Enterprises</p>
      </aside>

      {/* Right: sign in */}
      <main className="pl-main">
        <div className="pl-card">
          {challenge ? (
            <TwoFactorStep
              challenge={challenge}
              onSuccess={handleAuthSuccess}
              onCancel={() => {
                setChallenge(null);
                setPassword("");
                setError("");
              }}
            />
          ) : (
            <>
              <div className="pl-card-head">
                <span className="pl-role-badge">
                  <RoleIcon size={22} />
                </span>
                <div>
                  <h1 className="pl-title">Welcome back</h1>
                  <p className="pl-subtitle">{info.subtitle}</p>
                </div>
              </div>

              {showForgot && (
                <div className="pl-info" role="status">
                  <Info size={16} />
                  <span>
                    <strong>Forgot your password?</strong> {info.forgot}
                  </span>
                </div>
              )}

              {error && (
                <div className="pl-error" role="alert">
                  <AlertCircle size={16} />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="pl-form">
                <label className="pl-field">
                  <span className="pl-label">Email or Username</span>
                  <span className="pl-input-wrap">
                    <UserRound size={17} className="pl-input-icon" />
                    <input
                      id="email"
                      type="text"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com or username"
                      autoComplete="username"
                      autoFocus
                      required
                    />
                  </span>
                </label>

                <div className="pl-field">
                  <div className="pl-label-row">
                    <label htmlFor="password" className="pl-label">
                      Password
                    </label>
                    <button
                      type="button"
                      className="pl-forgot"
                      onClick={() => setShowForgot((v) => !v)}
                    >
                      Forgot password?
                    </button>
                  </div>
                  <span className="pl-input-wrap">
                    <Lock size={17} className="pl-input-icon" />
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyUp={checkCapsLock}
                      onKeyDown={checkCapsLock}
                      onBlur={() => setCapsLock(false)}
                      placeholder="Enter your password"
                      autoComplete="current-password"
                      required
                    />
                    <button
                      type="button"
                      className="pl-eye"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </span>
                  {capsLock && (
                    <span className="pl-caps">
                      <AlertTriangle size={13} />
                      Caps Lock is on
                    </span>
                  )}
                </div>

                <button type="submit" disabled={loading} className="pl-submit">
                  {loading ? (
                    <>
                      <Loader2 size={17} className="pl-spin" />
                      Signing in...
                    </>
                  ) : (
                    <>
                      Sign In as {roleLabel}
                    </>
                  )}
                </button>
              </form>
            </>
          )}
        </div>

        <p className="pl-footer">
          Glomax Solar Enterprises · For authorized {roleLabel} accounts only
        </p>
      </main>
    </div>
  );
}