import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  UserRound,
  Mail,
  Phone,
  MapPin,
  Lock,
  Eye,
  EyeOff,
  Sun,
  Home,
  Activity,
  FileText,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Loader2,
} from 'lucide-react';
import { GoogleLogin } from '@react-oauth/google';
import { register } from '../../../api/auth';
import { googleLogin } from '../../../api/google';
import { sanitizePhoneNumber } from '../../../utils/phone';
import { ROLE_CONFIG } from '../../../roleConfig';
import logo from '../../../assets/images/logo.jpg';
import '../styles/customer-login.css';

const FEATURES = [
  { icon: Home, label: 'Request a free roof check' },
  { icon: Activity, label: 'Track your installation step by step' },
  { icon: FileText, label: 'Get quotations and documents online' },
];

const STRENGTH_LABELS = ['Too short', 'Weak', 'Fair', 'Good', 'Strong'];

function getStrength(password) {
  if (!password) return 0;
  let score = 0;
  if (password.length >= 8) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  if (password.length < 6) score = Math.min(score, 1);
  return score;
}

function getGoogleWidth() {
  if (typeof window === 'undefined') return 360;
  return Math.max(220, Math.min(400, window.innerWidth - 80));
}

export default function RegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    username: '',
    email: '',
    phone_number: '',
    address: '',
    password: '',
    confirm_password: '',
  });
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [phoneWarning, setPhoneWarning] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [googleWidth, setGoogleWidth] = useState(getGoogleWidth);

  useEffect(() => {
    function onResize() {
      setGoogleWidth(getGoogleWidth());
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  function clearFieldError(name) {
    setFieldErrors((prev) => {
      if (!prev[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    clearFieldError(name);
  }

  function handlePhoneChange(e) {
    const { value, hadInvalidChar } = sanitizePhoneNumber(e.target.value);
    setForm((prev) => ({ ...prev, phone_number: value }));
    setPhoneWarning(hadInvalidChar ? 'Phone number can only contain numbers.' : '');
    clearFieldError('phone_number');
  }

  function handleAuthSuccess(data) {
    localStorage.setItem('access_token', data.access);
    localStorage.setItem('refresh_token', data.refresh);
    localStorage.setItem('role', data.role);
    localStorage.setItem('username', data.username);
    if (data.user_id !== undefined && data.user_id !== null) {
      localStorage.setItem('user_id', data.user_id);
    }

    if (data.role === 'CUSTOMER') {
      navigate('/dashboard', { replace: true });
      return;
    }
    const config = ROLE_CONFIG[data.role];
    if (config?.dashboardPath) {
      navigate(config.dashboardPath, { replace: true });
    } else {
      setError('This account type is not recognized. Please contact Glomax for help.');
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setFieldErrors({});

    if (form.password !== form.confirm_password) {
      setFieldErrors({ confirm_password: 'Passwords do not match.' });
      setError('Please check the fields marked in red.');
      return;
    }

    setIsSubmitting(true);
    try {
      await register({
        ...form,
        username: form.username.trim(),
        email: form.email.trim(),
        address: form.address.trim(),
      });
      navigate('/login', { state: { justRegistered: true } });
    } catch (err) {
      const data = err.response?.data;
      if (!err.response) {
        setError("Can't reach the server right now. Please check your connection and try again.");
      } else if (data && typeof data === 'object') {
        const perField = {};
        let general = '';
        Object.entries(data).forEach(([key, value]) => {
          const msg = Array.isArray(value) ? value[0] : String(value);
          if (key in form) {
            perField[key] = msg;
          } else if (!general) {
            general = msg;
          }
        });
        setFieldErrors(perField);
        setError(
          general ||
            (Object.keys(perField).length
              ? 'Please check the fields marked in red.'
              : 'Registration failed. Please try again.')
        );
      } else {
        setError('Registration failed. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleGoogleSuccess(credentialResponse) {
    setError('');
    setIsSubmitting(true);
    try {
      const data = await googleLogin(credentialResponse.credential);
      handleAuthSuccess(data);
    } catch (err) {
      console.error('Google sign-up failed:', err);
      setError(err?.response?.data?.detail || 'Google sign-up failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  const strength = getStrength(form.password);
  const passwordsMatch = form.confirm_password && form.password === form.confirm_password;

  function inputClass(name) {
    return fieldErrors[name] ? 'invalid' : '';
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
            Customer Portal
          </span>
          <h2 className="cl-brand-headline">Start your solar journey</h2>
          <p className="cl-brand-text">
            Create a free account to request a roof check, get your quotation, and follow your installation.
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

      {/* Right: register */}
      <main className="cl-main">
        <Link to="/" className="cl-back">
          <ArrowLeft size={15} />
          Back to home
        </Link>

        <div className="cl-card wide">
          <div className="cl-card-head">
            <span className="cl-role-badge">
              <Sun size={22} />
            </span>
            <div>
              <h1 className="cl-title">Create your account</h1>
              <p className="cl-subtitle">It only takes a minute</p>
            </div>
          </div>

          <div className="cl-tabs">
            <Link to="/login" className="cl-tab">
              Sign In
            </Link>
            <span className="cl-tab active">Register</span>
          </div>

          {error && (
            <div className="cl-error" role="alert">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="cl-form">
            <label className="cl-field">
              <span className="cl-label">Full Name</span>
              <span className="cl-input-wrap">
                <UserRound size={17} className="cl-input-icon" />
                <input
                  id="username"
                  name="username"
                  type="text"
                  placeholder="Juan Dela Cruz"
                  value={form.username}
                  onChange={handleChange}
                  autoComplete="name"
                  className={inputClass('username')}
                  autoFocus
                  required
                />
              </span>
              {fieldErrors.username && (
                <span className="cl-field-error">
                  <AlertCircle size={13} />
                  {fieldErrors.username}
                </span>
              )}
            </label>

            <div className="cl-row">
              <label className="cl-field">
                <span className="cl-label">Email Address</span>
                <span className="cl-input-wrap">
                  <Mail size={17} className="cl-input-icon" />
                  <input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="juan@email.com"
                    value={form.email}
                    onChange={handleChange}
                    autoComplete="email"
                    className={inputClass('email')}
                    required
                  />
                </span>
                {fieldErrors.email && (
                  <span className="cl-field-error">
                    <AlertCircle size={13} />
                    {fieldErrors.email}
                  </span>
                )}
              </label>

              <label className="cl-field">
                <span className="cl-label">Phone Number</span>
                <span className="cl-input-wrap">
                  <Phone size={17} className="cl-input-icon" />
                  <input
                    id="phone_number"
                    name="phone_number"
                    type="tel"
                    inputMode="numeric"
                    placeholder="09171234567"
                    value={form.phone_number}
                    onChange={handlePhoneChange}
                    autoComplete="tel"
                    className={inputClass('phone_number')}
                    required
                  />
                </span>
                {fieldErrors.phone_number ? (
                  <span className="cl-field-error">
                    <AlertCircle size={13} />
                    {fieldErrors.phone_number}
                  </span>
                ) : (
                  phoneWarning && <span className="cl-field-warning">{phoneWarning}</span>
                )}
              </label>
            </div>

            <label className="cl-field">
              <span className="cl-label">Address</span>
              <span className="cl-input-wrap">
                <MapPin size={17} className="cl-input-icon" />
                <input
                  id="address"
                  name="address"
                  type="text"
                  placeholder="123 Rizal St, Quezon City"
                  value={form.address}
                  onChange={handleChange}
                  autoComplete="street-address"
                  className={inputClass('address')}
                  required
                />
              </span>
              {fieldErrors.address && (
                <span className="cl-field-error">
                  <AlertCircle size={13} />
                  {fieldErrors.address}
                </span>
              )}
            </label>

            <div className="cl-row">
              <div className="cl-field">
                <label htmlFor="password" className="cl-label">
                  Password
                </label>
                <span className="cl-input-wrap">
                  <Lock size={17} className="cl-input-icon" />
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Create a password"
                    value={form.password}
                    onChange={handleChange}
                    autoComplete="new-password"
                    className={inputClass('password')}
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
                {form.password && (
                  <div className="cl-strength-wrap">
                    <div className={`cl-strength lvl-${strength}`}>
                      {[1, 2, 3, 4].map((n) => (
                        <span key={n} className={n <= strength ? 'on' : ''} />
                      ))}
                    </div>
                    <span className={`cl-strength-label lvl-${strength}`}>{STRENGTH_LABELS[strength]}</span>
                  </div>
                )}
                {fieldErrors.password && (
                  <span className="cl-field-error">
                    <AlertCircle size={13} />
                    {fieldErrors.password}
                  </span>
                )}
              </div>

              <div className="cl-field">
                <label htmlFor="confirm_password" className="cl-label">
                  Confirm Password
                </label>
                <span className="cl-input-wrap">
                  <Lock size={17} className="cl-input-icon" />
                  <input
                    id="confirm_password"
                    name="confirm_password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    placeholder="Type it again"
                    value={form.confirm_password}
                    onChange={handleChange}
                    autoComplete="new-password"
                    className={inputClass('confirm_password')}
                    required
                  />
                  <button
                    type="button"
                    className="cl-eye"
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                  >
                    {showConfirmPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </span>
                {fieldErrors.confirm_password ? (
                  <span className="cl-field-error">
                    <AlertCircle size={13} />
                    {fieldErrors.confirm_password}
                  </span>
                ) : (
                  form.confirm_password && (
                    <span className={`cl-match ${passwordsMatch ? 'ok' : 'bad'}`}>
                      {passwordsMatch ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                      {passwordsMatch ? 'Passwords match' : "Passwords don't match"}
                    </span>
                  )
                )}
              </div>
            </div>

            <p className="cl-field-hint">Use at least 8 characters with a mix of letters and numbers.</p>

            <button type="submit" className="cl-submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 size={17} className="cl-spin" />
                  Creating account...
                </>
              ) : (
                <>
                  Create Account
                </>
              )}
            </button>
          </form>

          <div className="cl-divider">
            <span>or sign up with</span>
          </div>

          <div className="cl-google">
            <GoogleLogin
              onSuccess={handleGoogleSuccess}
              onError={() => setError('Google sign-up failed. Please try again.')}
              width={String(googleWidth)}
              shape="rectangular"
              text="signup_with"
            />
          </div>

          <p className="cl-register">
            Already have an account? <Link to="/login">Sign in</Link>
          </p>
        </div>

        <p className="cl-footer">Glomax Solar Enterprises · Customer Portal</p>
      </main>
    </div>
  );
}