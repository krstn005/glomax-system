import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  KeyRound,
  UserRound,
  Lock,
  Eye,
  EyeOff,
  Sun,
  Home,
  Activity,
  FileText,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  Check,
  Clock,
} from 'lucide-react';
import { passwordResetStart, passwordResetConfirm, passwordResetResend } from '../../../api/auth';
import logo from '../../../assets/images/logo.jpg';
import '../styles/customer-login.css';
import '../styles/register-verify.css';

const FEATURES = [
  { icon: Home, label: 'Request a free roof check' },
  { icon: Activity, label: 'Track your installation step by step' },
  { icon: FileText, label: 'Get quotations and documents online' },
];

const STRENGTH_LABELS = ['Too short', 'Weak', 'Fair', 'Good', 'Strong'];
const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_OK = /^09\d{9}$/;

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

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState('start'); // 'start' | 'code' | 'done'
  const [identifier, setIdentifier] = useState('');
  const [token, setToken] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [wait, setWait] = useState(0);
  const [minutes, setMinutes] = useState(10);
  const [error, setError] = useState('');
  const [fieldError, setFieldError] = useState({});
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  // Count down the "send again" wait
  useEffect(() => {
    if (step !== 'code') return undefined;
    const timer = setInterval(() => setWait((w) => Math.max(0, w - 1)), 1000);
    return () => clearInterval(timer);
  }, [step]);

  function startOver(message) {
    setStep('start');
    setToken('');
    setCode('');
    setPassword('');
    setConfirm('');
    setNotice('');
    setFieldError({});
    setError(message || '');
  }

  async function handleStart(e) {
    e.preventDefault();
    setError('');
    setFieldError({});
    const text = identifier.trim();
    if (!text) {
      setFieldError({ identifier: 'Please type your email or mobile number.' });
      return;
    }
    if (text.includes('@') ? !EMAIL_OK.test(text) : !PHONE_OK.test(text)) {
      setFieldError({
        identifier: text.includes('@')
          ? 'Please type a real email, like juan@email.com.'
          : 'A mobile number has 11 digits and starts with 09, like 09171234567.',
      });
      return;
    }
    setBusy(true);
    try {
      const data = await passwordResetStart(text);
      setToken(data.reset_token);
      setWait(data.resend_wait || 60);
      setMinutes(data.code_minutes || 10);
      setNotice(data.detail || '');
      setStep('code');
    } catch (err) {
      const data = err.response?.data;
      if (!err.response) setError("Can't reach the server right now. Please check your connection and try again.");
      else if (err.response.status === 429) setError('Too many tries. Please wait a while and try again.');
      else setError(data?.detail || 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirm(e) {
    e.preventDefault();
    setError('');
    setNotice('');
    setFieldError({});
    const problems = {};
    if (code.length !== 6) problems.code = 'Please type the 6-digit code.';
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      problems.password = 'Use at least 8 characters with letters and numbers.';
    }
    if (!confirm) problems.confirm = 'Please type your password again.';
    else if (password !== confirm) problems.confirm = 'Passwords do not match.';
    if (Object.keys(problems).length) {
      setFieldError(problems);
      return;
    }
    setBusy(true);
    try {
      await passwordResetConfirm(token, code, password, confirm);
      setStep('done');
    } catch (err) {
      const data = err.response?.data;
      if (!err.response) {
        setError("Can't reach the server right now. Please check your connection and try again.");
      } else if (err.response.status === 429) {
        setError('Too many tries. Please wait a while and try again.');
      } else {
        const message = data?.detail || 'We could not change your password. Please try again.';
        if (data?.field === 'code') setFieldError({ code: message });
        else if (data?.field === 'new_password') setFieldError({ password: message });
        else if (data?.field === 'confirm_password') setFieldError({ confirm: message });
        else setError(message);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleResend() {
    setError('');
    setNotice('');
    try {
      const data = await passwordResetResend(token);
      setWait(data.resend_wait || 60);
      setNotice('If the request is still open, we sent a new code.');
    } catch (err) {
      setError(err.response?.status === 429 ? 'Too many tries. Please wait a while and try again.' : "We couldn't send a new code. Please try again.");
    }
  }

  const strength = getStrength(password);
  const passwordsMatch = confirm && password === confirm;
  const titles = {
    start: ['Forgot your password?', 'We will text you a code to get back in'],
    code: ['Choose a new password', 'Type the code we sent and your new password'],
    done: ['Password changed', 'You can sign in with your new password'],
  };

  return (
    <div className="cl-page">
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
          <h2 className="cl-brand-headline">Get back into your account</h2>
          <p className="cl-brand-text">We will text a code to the mobile number on your account so you can choose a new password.</p>

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

      <main className="cl-main">
        <Link to="/login" className="cl-back">
          <ArrowLeft size={15} />
          Back to Sign In
        </Link>

        <div className="cl-card">
          <div className="cl-card-head">
            <span className="cl-role-badge">{step === 'done' ? <ShieldCheck size={22} /> : <KeyRound size={22} />}</span>
            <div>
              <h1 className="cl-title">{titles[step][0]}</h1>
              <p className="cl-subtitle">{titles[step][1]}</p>
            </div>
          </div>

          {error && (
            <div className="cl-error" role="alert">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {notice && step === 'code' && (
            <div className="cl-error" role="status" style={{ background: '#ecfdf5', borderColor: '#a7f3d0', color: '#065f46' }}>
              <CheckCircle2 size={16} />
              <span>{notice}</span>
            </div>
          )}

          {step === 'start' && (
            <form onSubmit={handleStart} className="cl-form" noValidate>
              <label className="cl-field">
                <span className="cl-label">Email or mobile number</span>
                <span className="cl-input-wrap">
                  <UserRound size={17} className="cl-input-icon" />
                  <input
                    id="identifier"
                    name="identifier"
                    type="text"
                    placeholder="juan@email.com or 09171234567"
                    value={identifier}
                    onChange={(e) => {
                      setIdentifier(e.target.value);
                      setFieldError({});
                    }}
                    autoComplete="username"
                    className={fieldError.identifier ? 'invalid' : ''}
                    autoFocus
                  />
                </span>
                {fieldError.identifier && (
                  <span className="cl-field-error">
                    <AlertCircle size={13} />
                    {fieldError.identifier}
                  </span>
                )}
              </label>

              <p className="cl-field-hint">Type the email or mobile number you used to register. This is for Customer accounts.</p>

              <button type="submit" className="cl-submit" disabled={busy}>
                {busy ? (
                  <>
                    <Loader2 size={17} className="cl-spin" />
                    Sending...
                  </>
                ) : (
                  'Send me a code'
                )}
              </button>

              <p className="cl-register">
                Staff or Partner Installer? Please ask the Admin to reset your password.
              </p>
            </form>
          )}

          {step === 'code' && (
            <form onSubmit={handleConfirm} className="cl-form rv-form" noValidate>
              <div className={`rv-code ${code.length === 6 ? 'is-ready' : ''}`}>
                <div className="rv-code-head">
                  <span className="rv-code-icon">
                    <ShieldCheck size={18} />
                  </span>
                  <label htmlFor="reset_code" className="rv-code-title">
                    <strong>6-digit code</strong>
                    <span>Sent to the mobile number or email on the account</span>
                  </label>
                  <span className="rv-chip">
                    {code.length === 6 ? (
                      <>
                        <Check size={13} /> Ready
                      </>
                    ) : (
                      `${code.length}/6`
                    )}
                  </span>
                </div>
                <input
                  id="reset_code"
                  name="reset_code"
                  className="rv-input"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="______"
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                    setFieldError((f) => ({ ...f, code: '' }));
                  }}
                  autoFocus
                />
                {fieldError.code && (
                  <span className="cl-field-error">
                    <AlertCircle size={13} />
                    {fieldError.code}
                  </span>
                )}
                <div className="rv-code-foot">
                  <span>Did not get it?</span>
                  <button type="button" className="rv-resend" onClick={handleResend} disabled={wait > 0}>
                    {wait > 0 ? `Send again in ${wait}s` : 'Send again'}
                  </button>
                </div>
              </div>

              <div className="cl-field">
                <label htmlFor="new_password" className="cl-label">
                  New password
                </label>
                <span className="cl-input-wrap">
                  <Lock size={17} className="cl-input-icon" />
                  <input
                    id="new_password"
                    name="new_password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Create a new password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setFieldError((f) => ({ ...f, password: '' }));
                    }}
                    autoComplete="new-password"
                    className={fieldError.password ? 'invalid' : ''}
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
                {password && (
                  <div className="cl-strength-wrap">
                    <div className={`cl-strength lvl-${strength}`}>
                      {[1, 2, 3, 4].map((n) => (
                        <span key={n} className={n <= strength ? 'on' : ''} />
                      ))}
                    </div>
                    <span className={`cl-strength-label lvl-${strength}`}>{STRENGTH_LABELS[strength]}</span>
                  </div>
                )}
                {fieldError.password && (
                  <span className="cl-field-error">
                    <AlertCircle size={13} />
                    {fieldError.password}
                  </span>
                )}
              </div>

              <div className="cl-field">
                <label htmlFor="confirm_password" className="cl-label">
                  Confirm new password
                </label>
                <span className="cl-input-wrap">
                  <Lock size={17} className="cl-input-icon" />
                  <input
                    id="confirm_password"
                    name="confirm_password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Type it again"
                    value={confirm}
                    onChange={(e) => {
                      setConfirm(e.target.value);
                      setFieldError((f) => ({ ...f, confirm: '' }));
                    }}
                    autoComplete="new-password"
                    className={fieldError.confirm ? 'invalid' : ''}
                  />
                </span>
                {fieldError.confirm ? (
                  <span className="cl-field-error">
                    <AlertCircle size={13} />
                    {fieldError.confirm}
                  </span>
                ) : (
                  confirm && (
                    <span className={`cl-match ${passwordsMatch ? 'ok' : 'bad'}`}>
                      {passwordsMatch ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
                      {passwordsMatch ? 'Passwords match' : "Passwords don't match"}
                    </span>
                  )
                )}
              </div>

              <p className="rv-expiry">
                <Clock size={14} />
                The code works for {minutes} minutes. Use at least 8 characters with letters and numbers.
              </p>

              <button type="submit" className="cl-submit" disabled={busy}>
                {busy ? (
                  <>
                    <Loader2 size={17} className="cl-spin" />
                    Changing...
                  </>
                ) : (
                  <>
                    <ShieldCheck size={17} />
                    Change Password
                  </>
                )}
              </button>

              <p className="cl-register">
                Wrong email or number?{' '}
                <button type="button" className="rv-link" onClick={() => startOver('')}>
                  Start again
                </button>
              </p>
            </form>
          )}

          {step === 'done' && (
            <div className="cl-form">
              <div className="cl-error" role="status" style={{ background: '#ecfdf5', borderColor: '#a7f3d0', color: '#065f46' }}>
                <CheckCircle2 size={16} />
                <span>Your password was changed. Everyone signed in on other browsers will need to sign in again.</span>
              </div>
              <button type="button" className="cl-submit" onClick={() => navigate('/login')}>
                Go to Sign In
              </button>
            </div>
          )}
        </div>

        <p className="cl-footer">Glomax Solar Enterprises · Customer Portal</p>
      </main>
    </div>
  );
}