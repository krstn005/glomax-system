import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
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
  ShieldCheck,
  Clock,
  Check,
} from 'lucide-react';
import GoogleSignInButton from '../../../components/auth/GoogleSignInButton';
import { registerStart, registerVerify, registerResend } from '../../../api/auth';
import { googleLogin } from '../../../api/google';
import { sanitizePhoneNumber } from '../../../utils/phone';
import { ROLE_CONFIG } from '../../../roleConfig';
import logo from '../../../assets/images/logo.jpg';
import '../styles/customer-login.css';
import '../styles/register-verify.css';

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

const NAME_OK = /^[A-Za-z\u00C0-\u00FF][A-Za-z\u00C0-\u00FF .'-]*$/;
const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_OK = /^(09\d{9}|\+639\d{9}|639\d{9})$/;

// Checks every field before we ask the server. Returns { field: message }.
function validateForm(f) {
  const errors = {};

  const name = f.full_name.trim().replace(/\s+/g, ' ');
  if (!name) errors.full_name = 'Please enter your full name.';
  else if (!NAME_OK.test(name)) errors.full_name = 'Your name can only have letters, spaces, and . - \'';
  else if (name.replace(/[^A-Za-z\u00C0-\u00FF]/g, '').length < 4 || !name.includes(' '))
    errors.full_name = 'Please enter your first and last name.';

  const email = f.email.trim();
  if (!email) errors.email = 'Please enter your email address.';
  else if (!EMAIL_OK.test(email)) errors.email = 'Please enter a real email, like juan@email.com.';

  const phone = f.phone_number.trim();
  if (!phone) errors.phone_number = 'Please enter your phone number.';
  else if (!PHONE_OK.test(phone)) errors.phone_number = 'Use a Philippine mobile number, like 09171234567.';

  const address = f.address.trim();
  if (!address) errors.address = 'Please enter your address.';
  else if (address.length < 10 || !/[A-Za-z]/.test(address) || !/[\s,]/.test(address))
    errors.address = 'Please enter your full address, like 123 Rizal St, Quezon City.';

  if (!f.password) errors.password = 'Please create a password.';
  else if (f.password.length < 8 || !/[A-Za-z]/.test(f.password) || !/\d/.test(f.password))
    errors.password = 'Use at least 8 characters with letters and numbers.';

  if (!f.confirm_password) errors.confirm_password = 'Please type your password again.';
  else if (f.password !== f.confirm_password) errors.confirm_password = 'Passwords do not match.';

  return errors;
}

function CodeField({ id, icon: Icon, title, hint, value, verified, wait, onChange, onResend, autoFocus, locked, lockedText }) {
  const ready = !verified && !locked && value.length === 6;
  const state = verified ? 'is-verified' : locked ? 'is-locked' : ready ? 'is-ready' : '';
  return (
    <div className={`rv-code ${state}`}>
      <div className="rv-code-head">
        <span className="rv-code-icon">
          <Icon size={18} />
        </span>
        <label htmlFor={id} className="rv-code-title">
          <strong>{title}</strong>
          <span>{locked ? lockedText : `Sent to ${hint}`}</span>
        </label>
        <span className="rv-chip">
          {verified ? (
            <>
              <CheckCircle2 size={13} /> Verified
            </>
          ) : locked ? (
            <>
              <Lock size={13} /> Next
            </>
          ) : ready ? (
            <>
              <Check size={13} /> Ready
            </>
          ) : (
            `${value.length}/6`
          )}
        </span>
      </div>

      {verified ? (
        <p className="rv-code-done">This code is correct. You do not need to type it again.</p>
      ) : locked ? null : (
        <>
          <input
            id={id}
            name={id}
            className="rv-input"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="______"
            value={value}
            onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
            autoFocus={autoFocus}
          />
          <div className="rv-code-foot">
            <span>Did not get it?</span>
            <button type="button" className="rv-resend" onClick={onResend} disabled={wait > 0}>
              {wait > 0 ? `Send again in ${wait}s` : 'Send again'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function RegisterPage() {
  const navigate = useNavigate();
  // The quotation email links here with the customer's name and email,
  // so the form comes already filled in (they can still change it).
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState({
    full_name: (searchParams.get('name') || '').slice(0, 100),
    email: (searchParams.get('email') || '').slice(0, 150),
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

  // Step 2 - the customer types the email code and the phone code
  const [step, setStep] = useState('form'); // 'form' | 'verify'
  const [pending, setPending] = useState(null);
  const [codes, setCodes] = useState({ email: '', phone: '' });
  const [wait, setWait] = useState({ email: 0, phone: 0 });
  const [notice, setNotice] = useState('');

  useEffect(() => {
    function onResize() {
      setGoogleWidth(getGoogleWidth());
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Count down the "send again" waits
  useEffect(() => {
    if (step !== 'verify') return undefined;
    const timer = setInterval(() => {
      setWait((w) => ({ email: Math.max(0, w.email - 1), phone: Math.max(0, w.phone - 1) }));
    }, 1000);
    return () => clearInterval(timer);
  }, [step]);

  function backToForm(message) {
    setStep('form');
    setPending(null);
    setCodes({ email: '', phone: '' });
    setNotice('');
    setError(message || '');
  }

  async function handleVerify(e) {
    e.preventDefault();
    setError('');
    setNotice('');
    const emailStep = !pending.email_verified;
    if (emailStep && codes.email.length !== 6) {
      setError('Please type the 6-digit code from your email.');
      return;
    }
    if (!emailStep && codes.phone.length !== 6) {
      setError('Please type the 6-digit code from your text message.');
      return;
    }
    setIsSubmitting(true);
    try {
      const data = await registerVerify(pending.registration_token, emailStep ? codes.email : '', emailStep ? '' : codes.phone);
      if (!emailStep) {
        // Both codes are right, the account is made
        navigate('/login', { state: { justRegistered: true } });
        return;
      }
      // Email is right. The text message code was just sent.
      setPending((prev) => ({ ...prev, ...(data && typeof data === 'object' ? data : {}), email_verified: true, phone_sent: true }));
      setWait((w) => ({ ...w, phone: data?.resend_wait?.phone || 60 }));
      setNotice('Email confirmed. We sent a code to your phone.');
    } catch (err) {
      const data = err.response?.data;
      if (!err.response) {
        setError("Can't reach the server right now. Please check your connection and try again.");
      } else if (data?.restart) {
        backToForm(data.detail);
      } else {
        // The server remembers which code was already right
        if (data?.registration_token) setPending((prev) => ({ ...prev, ...data }));
        setError(data?.detail || 'Could not verify your code. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResend(channel) {
    if (channel === 'phone' && !pending.email_verified) return;
    setError('');
    setNotice('');
    try {
      const data = await registerResend(pending.registration_token, channel);
      setPending((prev) => ({ ...prev, ...data }));
      setWait((w) => ({ ...w, [channel]: data.resend_wait?.[channel] || 60 }));
      setNotice(channel === 'email' ? 'A new code was sent to your email.' : 'A new code was sent to your phone.');
    } catch (err) {
      const data = err.response?.data;
      if (data?.restart) {
        backToForm(data.detail);
      } else {
        if (data?.wait_seconds) setWait((w) => ({ ...w, [channel]: data.wait_seconds }));
        setError(data?.detail || "We couldn't send a new code. Please try again.");
      }
    }
  }

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
    if (data.full_name) localStorage.setItem('full_name', data.full_name);
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

    const problems = validateForm(form);
    if (Object.keys(problems).length) {
      setFieldErrors(problems);
      setError('Please check the fields marked in red.');
      const first = ['full_name', 'email', 'phone_number', 'address', 'password', 'confirm_password'].find((k) => problems[k]);
      if (first) document.getElementById(first)?.focus();
      return;
    }

    setIsSubmitting(true);
    try {
      // This only starts the sign-up. The account is made after both codes are typed.
      const data = await registerStart({
        ...form,
        full_name: form.full_name.trim().replace(/\s+/g, ' '),
        email: form.email.trim(),
        address: form.address.trim(),
      });
      setPending(data);
      setCodes({ email: '', phone: '' });
      setWait({ email: data.resend_wait?.email || 30, phone: 0 });
      setStep('verify');
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
              <h1 className="cl-title">{step === 'form' ? 'Create your account' : 'Verify your details'}</h1>
              <p className="cl-subtitle">
                {step === 'form' ? 'It only takes a minute' : pending?.email_verified ? 'Now type the code we texted to your phone' : 'We sent a code to your email. We will text you next'}
              </p>
            </div>
          </div>

          {step === 'form' && (
            <div className="cl-tabs">
              <Link to="/login" className="cl-tab">
                Sign In
              </Link>
              <span className="cl-tab active">Register</span>
            </div>
          )}

          {error && (
            <div className="cl-error" role="alert">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {notice && (
            <div className="cl-error" role="status" style={{ background: '#ecfdf5', borderColor: '#a7f3d0', color: '#065f46' }}>
              <CheckCircle2 size={16} />
              <span>{notice}</span>
            </div>
          )}

          {step === 'verify' && pending ? (
            <form onSubmit={handleVerify} className="cl-form rv-form">
              <ol className="rv-steps" aria-label="Sign-up steps">
                <li className="done">
                  <span>
                    <Check size={13} />
                  </span>
                  Details
                </li>
                <li className="active">
                  <span>2</span>
                  Verify
                </li>
                <li>
                  <span>3</span>
                  Done
                </li>
              </ol>

              <CodeField
                id="email_code"
                icon={Mail}
                title="Email code"
                hint={pending.email_hint}
                value={codes.email}
                verified={!!pending.email_verified}
                wait={wait.email}
                onChange={(v) => setCodes((c) => ({ ...c, email: v }))}
                onResend={() => handleResend('email')}
                autoFocus={!pending.email_verified}
              />

              <CodeField
                id="phone_code"
                icon={Phone}
                title="Text message code"
                hint={pending.phone_hint}
                value={codes.phone}
                verified={!!pending.phone_verified}
                wait={wait.phone}
                onChange={(v) => setCodes((c) => ({ ...c, phone: v }))}
                onResend={() => handleResend('phone')}
                locked={!pending.email_verified}
                lockedText="We text you after your email is confirmed"
                autoFocus={!!pending.email_verified}
              />

              <p className="rv-expiry">
                <Clock size={14} />
                Codes work for {pending.code_minutes || 10} minutes. Your account is made after the email and phone codes are both correct.
              </p>

              <button
                type="submit"
                className="cl-submit"
                disabled={isSubmitting || (pending.email_verified ? codes.phone.length !== 6 : codes.email.length !== 6)}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={17} className="cl-spin" />
                    Checking...
                  </>
                ) : pending.email_verified ? (
                  <>
                    <ShieldCheck size={17} />
                    Verify and Create Account
                  </>
                ) : (
                  <>
                    <Mail size={17} />
                    Confirm email code
                  </>
                )}
              </button>

              <p className="cl-register">
                Wrong email or number?{' '}
                <button type="button" className="rv-link" onClick={() => backToForm('')}>
                  Change my details
                </button>
              </p>
            </form>
          ) : (
          <>
          <form onSubmit={handleSubmit} className="cl-form" noValidate>
            <label className="cl-field">
              <span className="cl-label">Full Name</span>
              <span className="cl-input-wrap">
                <UserRound size={17} className="cl-input-icon" />
                <input
                  id="full_name"
                  name="full_name"
                  type="text"
                  placeholder="Juan Dela Cruz"
                  value={form.full_name}
                  onChange={handleChange}
                  autoComplete="name"
                  maxLength={150}
                  className={inputClass('full_name')}
                  autoFocus
                  required
                />
              </span>
              {fieldErrors.full_name && (
                <span className="cl-field-error">
                  <AlertCircle size={13} />
                  {fieldErrors.full_name}
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
                    maxLength={13}
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
                  Continue
                </>
              )}
            </button>
          </form>

          <div className="cl-divider">
            <span>or sign up with</span>
          </div>

          <div className="cl-google">
            <GoogleSignInButton
              onSuccess={handleGoogleSuccess}
              onError={() => setError('Google sign-up failed. Please try again.')}
              width={googleWidth}
              text="signup_with"
            />
          </div>

          <p className="cl-register">
            Already have an account? <Link to="/login">Sign in</Link>
          </p>
          </>
          )}
        </div>

        <p className="cl-footer">Glomax Solar Enterprises · Customer Portal</p>
      </main>
    </div>
  );
}