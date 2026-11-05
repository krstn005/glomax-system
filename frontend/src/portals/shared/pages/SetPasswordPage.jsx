import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  Eye,
  EyeOff,
  Check,
  X,
  KeyRound,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import { checkPasswordSetup, completePasswordSetup } from '../../../api/accounts';
import logo from '../../../assets/images/logo.jpg';
import '../styles/set-password.css';

const MIN_PASSWORD = 8;

// Password rules - every rule must pass before the password can be saved
const PASSWORD_RULES = [
  { key: 'length', label: `At least ${MIN_PASSWORD} characters`, test: (v) => v.length >= MIN_PASSWORD },
  { key: 'upper', label: 'One uppercase letter (A-Z)', test: (v) => /[A-Z]/.test(v) },
  { key: 'lower', label: 'One lowercase letter (a-z)', test: (v) => /[a-z]/.test(v) },
  { key: 'number', label: 'One number (0-9)', test: (v) => /[0-9]/.test(v) },
  { key: 'special', label: 'One symbol (!@#$%)', test: (v) => /[^A-Za-z0-9\s]/.test(v) },
  { key: 'space', label: 'No spaces', test: (v) => v.length > 0 && !/\s/.test(v) },
];

function checkPassword(value) {
  const results = PASSWORD_RULES.map((rule) => ({ ...rule, ok: rule.test(value) }));
  const passed = results.filter((r) => r.ok).length;
  return { results, passed, allOk: passed === PASSWORD_RULES.length };
}

function getStrength(value) {
  if (!value) return { level: 0, label: '', tone: '' };
  const { passed, allOk } = checkPassword(value);
  if (allOk && value.length >= 12) return { level: 4, label: 'Strong', tone: 'green' };
  if (allOk) return { level: 3, label: 'Good', tone: 'green' };
  if (passed >= 4) return { level: 2, label: 'Fair', tone: 'gold' };
  return { level: 1, label: 'Weak', tone: 'red' };
}

function PasswordInput({ value, onChange, placeholder, autoFocus }) {
  const [show, setShow] = useState(false);
  return (
    <div className="spw-password">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete="new-password"
        autoFocus={autoFocus}
        required
      />
      <button
        type="button"
        className="spw-eye"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? 'Hide password' : 'Show password'}
      >
        {show ? <EyeOff size={17} /> : <Eye size={17} />}
      </button>
    </div>
  );
}

function PasswordRules({ value }) {
  const { results } = checkPassword(value);
  const strength = getStrength(value);
  return (
    <div className="spw-rules" aria-live="polite">
      <div className="spw-strength">
        <div className="spw-bars">
          {[1, 2, 3, 4].map((n) => (
            <span key={n} className={n <= strength.level ? `on tone-${strength.tone}` : ''} />
          ))}
        </div>
        <span className={`spw-strength-label ${strength.tone ? `tone-${strength.tone}` : ''}`}>
          {strength.label || 'Password strength'}
        </span>
      </div>
      <ul className="spw-rule-list">
        {results.map((rule) => (
          <li key={rule.key} className={rule.ok ? 'ok' : ''}>
            <span className="spw-dot">{rule.ok ? <Check size={11} strokeWidth={3} /> : null}</span>
            {rule.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function SetPasswordPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') || '';

  const [status, setStatus] = useState('checking'); // checking | ready | invalid | done
  const [info, setInfo] = useState(null);
  const [problem, setProblem] = useState('');

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Check the link as soon as the page opens
  useEffect(() => {
    let cancelled = false;

    async function check() {
      if (!token) {
        setProblem('This link is not valid. Please ask the Admin to send you a new one.');
        setStatus('invalid');
        return;
      }
      try {
        const data = await checkPasswordSetup(token);
        if (cancelled) return;
        setInfo(data);
        setStatus('ready');
      } catch (err) {
        if (cancelled) return;
        setProblem(
          err?.response?.data?.detail || 'We could not check this link. Please try again in a moment.'
        );
        setStatus('invalid');
      }
    }

    check();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const allOk = checkPassword(password).allOk;
  const matches = password === confirm;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!allOk) {
      setError('Please meet every password rule first.');
      return;
    }
    if (!matches) {
      setError('The two passwords do not match.');
      return;
    }

    setSaving(true);
    try {
      await completePasswordSetup(token, password);
      setPassword('');
      setConfirm('');
      setStatus('done');
    } catch (err) {
      const data = err?.response?.data;
      if (data?.link_problem) {
        setProblem(data.detail);
        setStatus('invalid');
      } else {
        setError(data?.detail || 'Could not save your password. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  }

  const name = info?.full_name || info?.username || '';

  return (
    <div className="spw-page">
      <div className="spw-glow" aria-hidden="true" />

      <div className="spw-wrap">
        <Link
          to="/"
          className="spw-brand"
          title="Go to the Glomax Solar home page"
          style={{ color: "inherit", textDecoration: "none" }}
        >
          <span className="spw-logo">
            <img src={logo} alt="Glomax Solar Enterprises" />
          </span>
          <div>
            <p className="spw-brand-name">Glomax Solar</p>
            <p className="spw-brand-sub">Enterprises</p>
          </div>
        </Link>

        <div className="spw-card">
          {status === 'checking' && (
            <div className="spw-state">
              <Loader2 size={30} className="spw-spin" />
              <p className="spw-state-title">Checking your link...</p>
            </div>
          )}

          {status === 'invalid' && (
            <div className="spw-state">
              <span className="spw-state-icon red">
                <AlertCircle size={28} />
              </span>
              <p className="spw-state-title">This link can't be used</p>
              <p className="spw-state-text">{problem}</p>
              <button type="button" className="spw-btn secondary" onClick={() => navigate('/login')}>
                Go to Sign In
              </button>
            </div>
          )}

          {status === 'done' && (
            <div className="spw-state">
              <span className="spw-state-icon green">
                <CheckCircle2 size={28} />
              </span>
              <p className="spw-state-title">Your password is set</p>
              <p className="spw-state-text">You can now sign in with your new password.</p>
              {info?.username && (
                <div className="spw-user-box">
                  <span>Your username</span>
                  <strong>{info.username}</strong>
                </div>
              )}
              <button type="button" className="spw-btn primary" onClick={() => navigate('/login', { replace: true })}>
                Go to Sign In
              </button>
            </div>
          )}

          {status === 'ready' && (
            <>
              <div className="spw-head">
                <span className="spw-head-icon">
                  <KeyRound size={22} />
                </span>
                <div>
                  <h1>Set your password</h1>
                  <p>Hi {name}. Choose a password that only you know.</p>
                </div>
              </div>

              <div className="spw-user-box">
                <span>Your username</span>
                <strong>{info.username}</strong>
              </div>

              <form onSubmit={handleSubmit} className="spw-form">
                <label className="spw-field">
                  <span>New Password</span>
                  <PasswordInput
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setError('');
                    }}
                    placeholder="Create a strong password"
                    autoFocus
                  />
                </label>
                <PasswordRules value={password} />

                <label className="spw-field">
                  <span>Confirm Password</span>
                  <PasswordInput
                    value={confirm}
                    onChange={(e) => {
                      setConfirm(e.target.value);
                      setError('');
                    }}
                    placeholder="Type it again"
                  />
                </label>
                {confirm && (
                  <p className={`spw-match ${matches ? 'ok' : 'bad'}`}>
                    {matches ? <Check size={13} strokeWidth={3} /> : <X size={13} strokeWidth={3} />}
                    {matches ? 'Passwords match' : 'Passwords do not match yet'}
                  </p>
                )}

                {error && (
                  <p className="spw-error" role="alert">
                    <AlertCircle size={15} />
                    {error}
                  </p>
                )}

                <button type="submit" className="spw-btn primary full" disabled={saving || !allOk || !matches}>
                  {saving ? (
                    <>
                      <Loader2 size={17} className="spw-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Password'
                  )}
                </button>
              </form>

              <p className="spw-foot">
                <ShieldCheck size={14} />
                This link works once. Nobody at Glomax can see your password.
              </p>
            </>
          )}
        </div>

        <p className="spw-copy">© {new Date().getFullYear()} Glomax Solar Enterprises</p>
      </div>
    </div>
  );
}