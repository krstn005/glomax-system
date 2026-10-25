import { useEffect, useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import {
  ArrowLeft,
  UserRound,
  Lock,
  Eye,
  EyeOff,
  Sun,
  Home,
  Activity,
  FileText,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { GoogleLogin } from '@react-oauth/google';
import apiClient from '../../../api/client';
import { saveSession, getApiError } from '../../../api/twoFactor';
import TwoFactorStep from '../../../components/auth/TwoFactorStep';
import { ROLE_CONFIG } from '../../../roleConfig';
import logo from '../../../assets/images/logo.jpg';
import '../styles/customer-login.css';

const FEATURES = [
  { icon: Home, label: 'Request a free roof check' },
  { icon: Activity, label: 'Track your installation step by step' },
  { icon: FileText, label: 'Get quotations and documents online' },
];

// ONE login page for everybody (Customer, Staff, Partner Installer, Admin).
// We don't tell the backend which portal this is, so it accepts any role.
// After the 2FA code is correct, the account's role decides which
// dashboard opens (see ROLE_CONFIG in roleConfig.js).

// Google's button needs a fixed pixel width, so fit it to the screen
function getGoogleWidth() {
  if (typeof window === 'undefined') return 360;
  return Math.max(220, Math.min(366, window.innerWidth - 80));
}

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const justRegistered = location.state?.justRegistered;
  const [usernameOrEmail, setUsernameOrEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [googleWidth, setGoogleWidth] = useState(getGoogleWidth);
  // Set after the password (or Google) is accepted - shows the 2FA step
  const [challenge, setChallenge] = useState(null);

  useEffect(() => {
    function onResize() {
      setGoogleWidth(getGoogleWidth());
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  function checkCapsLock(e) {
    if (typeof e.getModifierState === 'function') {
      setCapsLock(e.getModifierState('CapsLock'));
    }
  }

  // Called only after the 2FA code is correct
  function handleAuthSuccess(data) {
    const target = ROLE_CONFIG[data.role];
    if (!target) {
      setChallenge(null);
      setPassword('');
      setError('This account has no portal. Please contact the administrator.');
      return;
    }

    saveSession(data);
    navigate(target.dashboardPath, { replace: true });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const res = await apiClient.post('/accounts/login/', {
        username: usernameOrEmail.trim(),
        password,
      });
      setChallenge(res.data);
    } catch (err) {
      if (err?.response?.status === 401) {
        setError('Wrong email/username or password. Please try again.');
      } else {
        setError(getApiError(err, 'Sign in failed. Please try again.'));
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleGoogleSuccess(credentialResponse) {
    setError('');
    setIsSubmitting(true);
    try {
      const res = await apiClient.post('/accounts/google-login/', {
        id_token: credentialResponse.credential,
      });
      setChallenge(res.data);
    } catch (err) {
      console.error('Google sign-in failed:', err);
      setError(getApiError(err, 'Google sign-in failed. Please try again.'));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="cl-page">
      {/* Left: brand panel */}
      <aside className="cl-brand">
        <div className="cl-brand-glow" aria-hidden="true" />
        <div className="cl-brand-grid" aria-hidden="true" />

        <div className="cl-brand-top">
          <span className="cl-logo-ring">
            <img src={logo} alt="Glomax Solar Enterprises" />
          </span>
          <div>
            <p className="cl-brand-name">Glomax Solar</p>
            <p className="cl-brand-sub">Enterprises</p>
          </div>
        </div>

        <div className="cl-brand-body">
          <span className="cl-portal-pill">
            <Sun size={14} />
            Glomax Portal
          </span>
          <h2 className="cl-brand-headline">One login for everyone</h2>
          <p className="cl-brand-text">
            Customers, staff, partner installers and admins all sign in here. You are taken to the right dashboard automatically.
          </p>

          <ul className="cl-features">
            {FEATURES.map(({ icon: Icon, label }) => (
              <li key={label}>
                <span className="cl-feature-icon">
                  <Icon size={16} />
                </span>
                {label}
              </li>
            ))}
          </ul>
        </div>

        <p className="cl-brand-foot">© {new Date().getFullYear()} Glomax Solar Enterprises</p>
      </aside>

      {/* Right: sign in */}
      <main className="cl-main">
        <Link to="/" className="cl-back">
          <ArrowLeft size={15} />
          Back to home
        </Link>

        <div className="cl-card">
          {challenge ? (
            <TwoFactorStep
              challenge={challenge}
              onSuccess={handleAuthSuccess}
              onCancel={() => {
                setChallenge(null);
                setPassword('');
                setError('');
              }}
            />
          ) : (
            <>
              <div className="cl-card-head">
                <span className="cl-role-badge">
                  <Sun size={22} />
                </span>
                <div>
                  <h1 className="cl-title">Welcome</h1>
                  <p className="cl-subtitle">Sign in with your email or username</p>
                </div>
              </div>

              <div className="cl-tabs">
                <span className="cl-tab active">Sign In</span>
                <Link to="/register" className="cl-tab">
                  Register
                </Link>
              </div>

              {justRegistered && !error && (
                <div className="cl-success" role="status">
                  <CheckCircle2 size={16} />
                  <span>Account created! You can now sign in.</span>
                </div>
              )}

              {error && (
                <div className="cl-error" role="alert">
                  <AlertCircle size={16} />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="cl-form">
                <label className="cl-field">
                  <span className="cl-label">Email or Username</span>
                  <span className="cl-input-wrap">
                    <UserRound size={17} className="cl-input-icon" />
                    <input
                      id="usernameOrEmail"
                      type="text"
                      placeholder="juan@email.com"
                      value={usernameOrEmail}
                      onChange={(e) => setUsernameOrEmail(e.target.value)}
                      autoComplete="username"
                      autoFocus
                      required
                    />
                  </span>
                </label>

                <div className="cl-field">
                  <div className="cl-label-row">
                    <label htmlFor="password" className="cl-label">
                      Password
                    </label>
                    <Link to="/forgot-password" className="cl-forgot">
                      Forgot password?
                    </Link>
                  </div>
                  <span className="cl-input-wrap">
                    <Lock size={17} className="cl-input-icon" />
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyUp={checkCapsLock}
                      onKeyDown={checkCapsLock}
                      onBlur={() => setCapsLock(false)}
                      autoComplete="current-password"
                      required
                    />
                    <button
                      type="button"
                      className="cl-eye"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </span>
                  {capsLock && (
                    <span className="cl-caps">
                      <AlertTriangle size={13} />
                      Caps Lock is on
                    </span>
                  )}
                </div>

                <button type="submit" className="cl-submit" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 size={17} className="cl-spin" />
                      Signing in...
                    </>
                  ) : (
                    <>
                      Sign In
                    </>
                  )}
                </button>
              </form>

              <div className="cl-divider">
                <span>or continue with</span>
              </div>

              <div className="cl-google">
                <GoogleLogin
                  onSuccess={handleGoogleSuccess}
                  onError={() => setError('Google sign-in failed. Please try again.')}
                  width={String(googleWidth)}
                  shape="rectangular"
                  text="signin_with"
                />
              </div>

              <p className="cl-register">
                No account yet? <Link to="/register">Create one</Link>
              </p>
            </>
          )}
        </div>

        <p className="cl-footer">Glomax Solar Enterprises</p>
      </main>
    </div>
  );
}