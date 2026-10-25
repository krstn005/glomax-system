import { useEffect, useRef, useState } from 'react';
import {
  ShieldCheck,
  MessageSquareText,
  Mail,
  ArrowLeft,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Copy,
  Download,
  Check,
  MonitorSmartphone,
} from 'lucide-react';
import {
  verifyTwoFactor,
  resendTwoFactorCode,
  startTwoFactorSetup,
  confirmTwoFactorSetup,
  getApiError,
  getResendWait,
  TWO_FACTOR_METHODS,
} from '../../api/twoFactor';
import '../../styles/two-factor.css';

const { SMS, EMAIL } = TWO_FACTOR_METHODS;

/* ------------------------------------------------------------------
   Turns the ways people type a PH mobile number into 09XXXXXXXXX.
   Returns '' if it isn't a valid mobile number. (Same rule as the
   backend, so we can catch typos before sending.)
------------------------------------------------------------------- */
export function normalizePhone(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('63') && digits.length === 12) digits = `0${digits.slice(2)}`;
  else if (digits.startsWith('9') && digits.length === 10) digits = `0${digits}`;
  return /^09\d{9}$/.test(digits) ? digits : '';
}

/* ------------------------------------------------------------------
   6-box code input. It's really one hidden input, so typing, paste,
   and phone "autofill code" all work. Also used in Settings.
------------------------------------------------------------------- */
export function CodeInput({ value, onChange, onComplete, disabled = false, autoFocus = true, hasError = false }) {
  const inputRef = useRef(null);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  function handleChange(e) {
    const next = e.target.value.replace(/\D/g, '').slice(0, 6);
    onChange(next);
    if (next.length === 6 && onComplete) onComplete(next);
  }

  const activeIndex = Math.min(value.length, 5);

  return (
    <div
      className={`tf-code ${hasError ? 'tf-code-error' : ''} ${disabled ? 'tf-code-disabled' : ''}`}
      onClick={() => inputRef.current?.focus()}
    >
      <input
        ref={inputRef}
        className="tf-code-input"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        aria-label="6-digit code"
        maxLength={6}
        value={value}
        disabled={disabled}
        onChange={handleChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {Array.from({ length: 6 }).map((_, i) => (
        <span
          key={i}
          className={`tf-code-box ${value[i] ? 'filled' : ''} ${focused && i === activeIndex ? 'active' : ''}`}
          aria-hidden="true"
        >
          {value[i] || ''}
        </span>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------
   Mobile number box. Also used in Settings.
------------------------------------------------------------------- */
export function PhoneInput({ value, onChange, disabled = false, autoFocus = false, hasError = false }) {
  return (
    <label className="tf-phone">
      <span className="tf-phone-label">Mobile number</span>
      <input
        className={`tf-text-input tf-phone-input ${hasError ? 'tf-input-error' : ''}`}
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder="0917 123 4567"
        maxLength={16}
        value={value}
        disabled={disabled}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value.replace(/[^\d+\s-]/g, ''))}
      />
      <span className="tf-phone-help">Philippine mobile number only (Globe, Smart, DITO, etc.).</span>
    </label>
  );
}

/* ------------------------------------------------------------------
   Backup codes list with Copy / Download. Also used in Settings.
------------------------------------------------------------------- */
export function BackupCodesList({ codes, username }) {
  const [copied, setCopied] = useState(false);

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(codes.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  function download() {
    const lines = ['Glomax Solar Enterprises - Backup codes'];
    if (username) lines.push(`Account: ${username}`);
    lines.push(`Made on: ${new Date().toLocaleString()}`);
    lines.push('', 'Each code works only once. Keep them somewhere safe.', '', ...codes);
    const text = lines.join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'glomax-backup-codes.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="tf-backup">
      <ol className="tf-backup-grid">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ol>
      <div className="tf-backup-actions">
        <button type="button" className="tf-btn-soft" onClick={copyAll}>
          {copied ? <Check size={15} /> : <Copy size={15} />}
          {copied ? 'Copied' : 'Copy all'}
        </button>
        <button type="button" className="tf-btn-soft" onClick={download}>
          <Download size={15} />
          Download
        </button>
      </div>
    </div>
  );
}

// "Remember this device" tick box, shown under the code boxes.
// Ticked by default, so most people only enter a code once per device.
function RememberDevice({ checked, onChange }) {
  return (
    <label className={`tf-remember ${checked ? 'on' : ''}`}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="tf-remember-icon">
        <MonitorSmartphone size={17} />
      </span>
      <span className="tf-remember-text">
        <strong>Remember this device</strong>
        <small>Don't ask for a code again on this phone or computer. Untick this on a shared or public computer.</small>
      </span>
    </label>
  );
}

/* ------------------------------------------------------------------
   The whole 2FA step shown inside the login card, after the password
   (or Google sign-in) is accepted.

   Props:
     challenge  - the response from /accounts/login/ or /google-login/
     onSuccess  - called with the real tokens when everything is done
     onCancel   - goes back to the sign-in form
------------------------------------------------------------------- */
export default function TwoFactorStep({ challenge, onSuccess, onCancel }) {
  const token = challenge.challenge_token;
  const isVerify = challenge.two_factor === 'verify';

  // verify | choose | code
  const [view, setView] = useState(isVerify ? 'verify' : 'choose');
  const [method, setMethod] = useState(
    challenge.method === EMAIL || challenge.method === SMS ? challenge.method : SMS
  );
  const [code, setCode] = useState('');
  const [setupData, setSetupData] = useState(null);
  const [rememberDevice, setRememberDevice] = useState(true);

  // Mobile number for SMS setup. If the account already has one, we use
  // it unless the user taps "Use a different number".
  const [phone, setPhone] = useState('');
  const [editPhone, setEditPhone] = useState(!challenge.has_phone);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(challenge.send_error || '');
  const [fatal, setFatal] = useState('');
  const [notice, setNotice] = useState('');
  const [wait, setWait] = useState(
    isVerify && challenge.code_sent ? getResendWait(challenge, challenge.method) : 0
  );

  const busyRef = useRef(false);

  // This browser is remembered: the backend already signed the user in
  // (no code needed), so just finish signing in.
  const alreadySignedIn = Boolean(challenge.trusted_device && challenge.access);
  useEffect(() => {
    if (alreadySignedIn) onSuccess(challenge);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alreadySignedIn]);

  // Countdown for the "Resend code" button
  useEffect(() => {
    if (wait <= 0) return undefined;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  function handleError(err, fallback) {
    const data = err?.response?.data;
    // Session is over: too many wrong codes, expired, or locked out
    if (data?.locked || data?.expired || err?.response?.status === 429) {
      setFatal(getApiError(err, fallback));
      return;
    }
    setError(getApiError(err, fallback));
  }

  // Where the code went, e.g. "0917***4567" or "ju***@gmail.com"
  function sentTo(currentMethod, data) {
    if (currentMethod === SMS) return data?.phone_hint || challenge.phone_hint || 'your phone';
    return data?.email_hint || challenge.email_hint || 'your email';
  }

  // ----- Sign in with a code -----
  async function submitVerify(value) {
    if (busyRef.current) return;
    const entered = (value ?? code).trim();
    if (entered.length !== 6) {
      setError('Please enter the 6-digit code.');
      return;
    }
    busyRef.current = true;
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const data = await verifyTwoFactor(token, entered, rememberDevice);
      onSuccess(data);
    } catch (err) {
      handleError(err, 'Incorrect code. Please try again.');
      setCode('');
    } finally {
      busyRef.current = false;
      setLoading(false);
    }
  }

  // Works on the sign-in screen and on the setup code screen
  async function handleResend() {
    if (wait > 0) return;
    const currentMethod = view === 'verify' ? challenge.method : method;
    setError('');
    setNotice('');
    try {
      const data = await resendTwoFactorCode(token);
      setNotice(`A new code was sent to ${sentTo(currentMethod, data)}.`);
      setWait(getResendWait(data, currentMethod));
    } catch (err) {
      const status = err?.response?.status;
      const data = err?.response?.data;
      if (status === 429 && data?.wait) {
        // Too soon - just restart the countdown
        setWait(data.wait);
        setError(data.detail);
      } else if (status === 429 || status === 503) {
        // Too many codes, or the SMS/email could not be sent.
        // Keep the screen open so they can try again.
        setError(getApiError(err, "We couldn't send a new code. Please try again."));
      } else {
        handleError(err, "We couldn't send a new code. Please try again.");
      }
    }
  }

  // ----- First-time setup -----
  async function chooseMethod() {
    if (busyRef.current) return;

    // Check the mobile number first, so a typo doesn't waste a text
    let number = '';
    if (method === SMS && editPhone) {
      number = normalizePhone(phone);
      if (!number) {
        setError('Please enter a valid mobile number (11 digits, starts with 09).');
        return;
      }
    }

    busyRef.current = true;
    setLoading(true);
    setError('');
    setNotice('');
    setCode('');
    try {
      const data = await startTwoFactorSetup(token, method, number || undefined);
      setSetupData(data);
      setView('code');
      setWait(getResendWait(data, method));
    } catch (err) {
      const data = err?.response?.data;
      if (data?.needs_phone) {
        // No valid number on the account - ask for one
        setEditPhone(true);
        setError(data.detail);
      } else {
        handleError(err, "We couldn't start the setup. Please try again.");
      }
    } finally {
      busyRef.current = false;
      setLoading(false);
    }
  }

  async function submitSetup(value) {
    if (busyRef.current) return;
    const entered = (value ?? code).trim();
    if (entered.length !== 6) {
      setError('Please enter the 6-digit code.');
      return;
    }
    busyRef.current = true;
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const data = await confirmTwoFactorSetup(token, entered, rememberDevice);
      // Signed in. (Backup codes are no longer shown - codes come by SMS or email.)
      onSuccess(data);
    } catch (err) {
      handleError(err, 'Incorrect code. Please try again.');
      setCode('');
    } finally {
      busyRef.current = false;
      setLoading(false);
    }
  }

  function backToChoose() {
    setView('choose');
    setCode('');
    setError('');
    setNotice('');
    setSetupData(null);
    setWait(0);
  }

  if (alreadySignedIn) {
    return (
      <div className="tf">
        <div className="tf-head">
          <span className="tf-icon tf-icon-success">
            <Loader2 size={24} className="tf-spin" />
          </span>
          <h2 className="tf-title">Signing you in...</h2>
          <p className="tf-text">This device is remembered, so no code is needed.</p>
        </div>
      </div>
    );
  }

  // ----- Session is over (expired / locked) -----
  if (fatal) {
    return (
      <div className="tf">
        <div className="tf-head">
          <span className="tf-icon tf-icon-danger">
            <AlertCircle size={24} />
          </span>
          <h2 className="tf-title">Please sign in again</h2>
          <p className="tf-text">{fatal}</p>
        </div>
        <button type="button" className="tf-submit" onClick={onCancel}>
          <ArrowLeft size={17} />
          Back to sign in
        </button>
      </div>
    );
  }

  const messages = (
    <>
      {error && (
        <div className="tf-error" role="alert">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}
      {notice && !error && (
        <div className="tf-notice" role="status">
          <CheckCircle2 size={16} />
          <span>{notice}</span>
        </div>
      )}
    </>
  );

  const resendButton = (
    <button type="button" className="tf-link" onClick={handleResend} disabled={wait > 0}>
      {wait > 0 ? `Resend code in ${wait}s` : 'Resend code'}
    </button>
  );

  /* ---------- VERIFY ---------- */
  if (view === 'verify') {
    const isEmail = challenge.method === EMAIL;
    return (
      <div className="tf">
        <div className="tf-head">
          <span className="tf-icon">
            {isEmail ? <Mail size={24} /> : <MessageSquareText size={24} />}
          </span>
          <h2 className="tf-title">2-step verification</h2>
          <p className="tf-text">
            {isEmail ? (
              <>
                We sent a 6-digit code to <strong>{challenge.email_hint}</strong>. It expires in 5 minutes.
              </>
            ) : (
              <>
                We sent a 6-digit code by text message to <strong>{challenge.phone_hint}</strong>. It expires in 5
                minutes.
              </>
            )}
          </p>
        </div>

        {messages}

        <form
          className="tf-form"
          onSubmit={(e) => {
            e.preventDefault();
            submitVerify();
          }}
        >
          <CodeInput
            value={code}
            onChange={(v) => {
              setCode(v);
              if (error) setError('');
            }}
            onComplete={(v) => submitVerify(v)}
            disabled={loading}
            hasError={!!error}
          />

          <RememberDevice checked={rememberDevice} onChange={setRememberDevice} />

          <button type="submit" className="tf-submit" disabled={loading}>
            {loading ? (
              <>
                <Loader2 size={17} className="tf-spin" />
                Checking...
              </>
            ) : (
              <>
                Verify and sign in
              </>
            )}
          </button>
        </form>

        <div className="tf-row-links">
          {resendButton}
          <span className="tf-muted">
            {isEmail ? 'Check your spam folder too.' : 'Texts can take up to a minute to arrive.'}
          </span>
        </div>

        <button type="button" className="tf-back" onClick={onCancel}>
          <ArrowLeft size={15} />
          Back to sign in
        </button>
      </div>
    );
  }

  /* ---------- CHOOSE METHOD (first time) ---------- */
  if (view === 'choose') {
    return (
      <div className="tf">
        <div className="tf-head">
          <span className="tf-icon">
            <ShieldCheck size={24} />
          </span>
          <h2 className="tf-title">Protect your account</h2>
          <p className="tf-text">
            Glomax now uses 2-step login. Besides your password, you'll enter a short code when you
            sign in on a new phone or computer. Pick how you want to get your code.
          </p>
        </div>

        {messages}

        <div className="tf-options">
          <button
            type="button"
            className={`tf-option ${method === SMS ? 'selected' : ''}`}
            onClick={() => {
              setMethod(SMS);
              setError('');
            }}
          >
            <span className="tf-option-icon">
              <MessageSquareText size={20} />
            </span>
            <span className="tf-option-text">
              <strong>
                Text message (SMS) <em>Recommended</em>
              </strong>
              <small>
                {challenge.has_phone && !editPhone
                  ? `We'll text a code to ${challenge.phone_hint}.`
                  : "We'll text a code to your mobile number."}
              </small>
            </span>
            <span className="tf-radio" aria-hidden="true" />
          </button>

          <button
            type="button"
            className={`tf-option ${method === EMAIL ? 'selected' : ''}`}
            onClick={() => {
              if (!challenge.has_email) return;
              setMethod(EMAIL);
              setError('');
            }}
            disabled={!challenge.has_email}
          >
            <span className="tf-option-icon">
              <Mail size={20} />
            </span>
            <span className="tf-option-text">
              <strong>Email code</strong>
              <small>
                {challenge.has_email
                  ? `We'll send a code to ${challenge.email_hint}.`
                  : 'Your account has no email address yet.'}
              </small>
            </span>
            <span className="tf-radio" aria-hidden="true" />
          </button>
        </div>

        {method === SMS && (
          <div className="tf-phone-box">
            {editPhone ? (
              <>
                <PhoneInput
                  value={phone}
                  onChange={(v) => {
                    setPhone(v);
                    if (error) setError('');
                  }}
                  disabled={loading}
                  hasError={!!error}
                  autoFocus
                />
                {challenge.has_phone && (
                  <button
                    type="button"
                    className="tf-link"
                    onClick={() => {
                      setEditPhone(false);
                      setPhone('');
                      setError('');
                    }}
                  >
                    Use {challenge.phone_hint} instead
                  </button>
                )}
              </>
            ) : (
              <div className="tf-row-links">
                <span className="tf-muted">
                  Sending to <strong>{challenge.phone_hint}</strong>
                </span>
                <button type="button" className="tf-link" onClick={() => setEditPhone(true)}>
                  Use a different number
                </button>
              </div>
            )}
          </div>
        )}

        <button type="button" className="tf-submit" onClick={chooseMethod} disabled={loading}>
          {loading ? (
            <>
              <Loader2 size={17} className="tf-spin" />
              Sending code...
            </>
          ) : (
            <>
              Send code
            </>
          )}
        </button>

        <button type="button" className="tf-back" onClick={onCancel}>
          <ArrowLeft size={15} />
          Back to sign in
        </button>
      </div>
    );
  }

  /* ---------- ENTER THE SETUP CODE (SMS or email) ---------- */
  if (view === 'code') {
    const isEmail = method === EMAIL;
    return (
      <div className="tf">
        <div className="tf-head">
          <span className="tf-icon">{isEmail ? <Mail size={24} /> : <MessageSquareText size={24} />}</span>
          <h2 className="tf-title">{isEmail ? 'Check your email' : 'Check your phone'}</h2>
          <p className="tf-text">
            We sent a 6-digit code {isEmail ? 'to' : 'by text message to'}{' '}
            <strong>{sentTo(method, setupData)}</strong>. Enter it below to turn on 2-step login.
          </p>
        </div>

        {messages}

        <form
          className="tf-form"
          onSubmit={(e) => {
            e.preventDefault();
            submitSetup();
          }}
        >
          <CodeInput
            value={code}
            onChange={(v) => {
              setCode(v);
              if (error) setError('');
            }}
            onComplete={(v) => submitSetup(v)}
            disabled={loading}
            hasError={!!error}
          />
          <RememberDevice checked={rememberDevice} onChange={setRememberDevice} />
          <button type="submit" className="tf-submit" disabled={loading}>
            {loading ? (
              <>
                <Loader2 size={17} className="tf-spin" />
                Checking...
              </>
            ) : (
              <>
                Turn on 2-step login
              </>
            )}
          </button>
        </form>

        <div className="tf-row-links">
          {resendButton}
          <span className="tf-muted">
            {isEmail ? 'Check your spam folder too.' : 'Texts can take up to a minute to arrive.'}
          </span>
        </div>

        <button type="button" className="tf-back" onClick={backToChoose}>
          <ArrowLeft size={15} />
          {isEmail ? 'Choose another method' : 'Change number or method'}
        </button>
      </div>
    );
  }

  return null;
}