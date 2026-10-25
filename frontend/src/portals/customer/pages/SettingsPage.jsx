import { useEffect, useRef, useState } from 'react';
import {
  Camera,
  User,
  Bell,
  Shield,
  Eye,
  EyeOff,
  Check,
  X,
  Mail,
  MailCheck,
  Phone,
  MapPin,
  MessageSquare,
  CheckCircle2,
  XCircle,
  Megaphone,
  Lock,
  KeyRound,
  AlertCircle,
  Upload,
  ShieldCheck,
  ArrowLeft,
  Clock,
  RotateCw,
  Send,
} from 'lucide-react';
import apiClient from '../../../api/client';
import { sanitizePhoneNumber } from '../../../utils/phone';
import { toMediaUrl } from '../../../utils/mediaUrl';
import {
  getServerErrorMessage,
  shortPhotoName,
  checkPhoto,
  PASSWORD_RULES,
  MAX_PHOTO_SIZE_MB,
} from '../../../utils/profileHelpers';
import CustomerLayout from '../components/CustomerLayout';
import '../styles/settings.css';

const TABS = [
  { key: 'profile', label: 'My Profile', desc: 'Name, email, phone and address', icon: User },
  { key: 'notifications', label: 'Notifications', desc: 'Choose what we notify you about', icon: Bell },
  { key: 'security', label: 'Security', desc: 'Change your password', icon: Shield },
];

// Philippine mobile number: 11 digits starting with 09
const PH_MOBILE = /^09\d{9}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const STRENGTH_LABELS = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong'];

// Matches the backend: codes expire after 10 minutes
const OTP_LENGTH = 6;
const OTP_LIFETIME_MS = 10 * 60 * 1000;
const RESEND_WAIT_MS = 60 * 1000;

function toProfileForm(me) {
  return {
    fullName: me.username || '',
    email: me.email || '',
    phone: me.phone_number || '',
    address: me.address || '',
  };
}

function toPrefs(me) {
  return {
    notify_email_updates: Boolean(me.notify_email_updates),
    notify_sms_updates: Boolean(me.notify_sms_updates),
    notify_request_approval: Boolean(me.notify_request_approval),
    notify_request_rejection: Boolean(me.notify_request_rejection),
    notify_promotions: Boolean(me.notify_promotions),
  };
}

function sameObject(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// "beta@gmail.com" becomes "be**@gmail.com"
function maskEmail(email) {
  if (!email) return 'your email';
  const [name, domain] = email.split('@');
  if (!domain) return email;
  const shown = name.slice(0, 2);
  return `${shown}${'*'.repeat(Math.max(1, name.length - 2))}@${domain}`;
}

function formatCountdown(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = String(Math.floor(total / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function Avatar({ picture, initials, size = 'md' }) {
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    setBroken(false);
  }, [picture]);

  if (picture && !broken) {
    return (
      <img
        src={picture}
        alt="Profile"
        className={`set-avatar set-avatar-${size}`}
        onError={() => setBroken(true)}
      />
    );
  }
  return <div className={`set-avatar set-avatar-${size} set-avatar-initials`}>{initials}</div>;
}

function Toast({ message, type = 'success', onDone }) {
  useEffect(() => {
    const timer = setTimeout(onDone, 3500);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <div className={`set-toast ${type}`}>
      {type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
      {message}
    </div>
  );
}

function ConfirmModal({ title, message, confirmLabel, busy, onCancel, onConfirm }) {
  return (
    <div className="set-modal-overlay" onClick={() => !busy && onCancel()}>
      <div className="set-modal" onClick={(e) => e.stopPropagation()}>
        <div className="set-modal-icon">
          <ShieldCheck size={22} />
        </div>
        <h3>{title}</h3>
        <p>{message}</p>
        <div className="set-modal-actions">
          <button type="button" className="set-btn-secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="set-btn" disabled={busy} onClick={onConfirm}>
            {busy ? 'Saving...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function CardTitle({ icon: Icon, title, subtitle }) {
  return (
    <div className="set-card-head">
      <span className="set-card-icon">
        <Icon size={18} />
      </span>
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
    </div>
  );
}

// Bar at the bottom of a card: shows "unsaved changes" with Discard,
// or a disabled Save button when nothing has changed yet
function SaveBar({ dirty, saving, onDiscard, onSave, saveLabel = 'Save Changes' }) {
  return (
    <div className={`set-save-bar ${dirty ? 'dirty' : ''}`}>
      <p className="set-save-status">
        {dirty ? (
          <>
            <span className="set-save-dot" />
            You have unsaved changes
          </>
        ) : (
          <>
            <Check size={15} />
            Everything is up to date
          </>
        )}
      </p>
      <div className="set-save-actions">
        {dirty && (
          <button type="button" className="set-btn-secondary" onClick={onDiscard} disabled={saving}>
            Discard
          </button>
        )}
        <button type="button" className="set-btn" onClick={onSave} disabled={!dirty || saving}>
          {saving ? 'Saving...' : saveLabel}
        </button>
      </div>
    </div>
  );
}

function IconInput({ id, icon: Icon, error, ...inputProps }) {
  return (
    <div className={`set-input-wrap ${error ? 'has-error' : ''}`}>
      <Icon size={16} />
      <input id={id} {...inputProps} />
    </div>
  );
}

function ProfileTab({ me, onSaved, showToast }) {
  const [saved, setSaved] = useState(() => toProfileForm(me));
  const [form, setForm] = useState(() => toProfileForm(me));
  const [pictureFile, setPictureFile] = useState(null);
  const [picturePreview, setPicturePreview] = useState(null);
  const [pictureError, setPictureError] = useState('');
  const [phoneWarning, setPhoneWarning] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const fileInputRef = useRef(null);

  const pictureUrl = toMediaUrl(me.profile_picture);
  const dirty = !sameObject(form, saved) || Boolean(pictureFile);

  // Free the temporary preview link when it's no longer used
  useEffect(() => {
    return () => {
      if (picturePreview) URL.revokeObjectURL(picturePreview);
    };
  }, [picturePreview]);

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setFieldErrors((prev) => ({ ...prev, [field]: '' }));
  }

  function handlePhoneChange(e) {
    const { value, hadInvalidChar } = sanitizePhoneNumber(e.target.value);
    updateField('phone', value);
    setPhoneWarning(hadInvalidChar ? 'Phone Number can only contain numbers.' : '');
  }

  function handlePictureChange(e) {
    const file = e.target.files?.[0];
    // Clear the input so picking the same file again still works
    e.target.value = '';
    if (!file) return;

    const problem = checkPhoto(file);
    if (problem) {
      setPictureError(problem);
      return;
    }

    setPictureError('');
    setPictureFile(file);
    setPicturePreview(URL.createObjectURL(file));
  }

  function handleDiscard() {
    setForm(saved);
    setPictureFile(null);
    setPicturePreview(null);
    setPictureError('');
    setFieldErrors({});
    setPhoneWarning('');
    setError('');
  }

  function handleSaveClick() {
    const errors = {};
    if (!form.fullName.trim()) errors.fullName = 'Please enter your name.';
    if (form.email.trim() && !EMAIL_PATTERN.test(form.email.trim())) {
      errors.email = 'Please enter a valid email address.';
    }
    if (form.phone && !PH_MOBILE.test(form.phone)) {
      errors.phone = 'Please enter an 11-digit mobile number starting with 09.';
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setShowConfirm(true);
  }

  async function performSave() {
    setSaving(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('username', form.fullName.trim());
      formData.append('email', form.email.trim());
      formData.append('phone_number', form.phone);
      formData.append('address', form.address.trim());
      if (pictureFile) {
        formData.append('profile_picture', pictureFile, shortPhotoName(pictureFile));
      }

      const res = await apiClient.patch('/accounts/me/', formData);
      const next = toProfileForm(res.data);

      localStorage.setItem('username', next.fullName);
      setSaved(next);
      setForm(next);
      setPictureFile(null);
      setPicturePreview(null);
      onSaved(res.data);
      window.dispatchEvent(new Event('profile-picture-updated'));

      if (pictureFile && !res.data.profile_picture) {
        setError('Your details were saved, but the photo was not. Please try again.');
      } else {
        showToast('Your profile has been updated.');
      }
    } catch (err) {
      setError(getServerErrorMessage(err, 'Something went wrong saving your changes. Please try again.'));
    } finally {
      setSaving(false);
      setShowConfirm(false);
    }
  }

  const initials = (form.fullName || 'CU').slice(0, 2).toUpperCase();
  const displayedPicture = picturePreview || pictureUrl;

  return (
    <div className="set-card">
      <CardTitle icon={User} title="Personal Information" subtitle="This is how our team will reach you." />

      <div className="set-photo">
        <div className="set-photo-avatar">
          <Avatar picture={displayedPicture} initials={initials} size="xl" />
          <button
            type="button"
            className="set-photo-badge"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Change photo"
          >
            <Camera size={14} />
          </button>
        </div>
        <div className="set-photo-text">
          <p className="set-photo-title">Profile Photo</p>
          <p className="set-photo-sub">JPG or PNG, up to {MAX_PHOTO_SIZE_MB} MB</p>
          <button type="button" className="set-btn-outline" onClick={() => fileInputRef.current?.click()}>
            <Upload size={15} />
            Upload new photo
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handlePictureChange}
          className="set-file-input"
        />
      </div>

      {pictureFile && !pictureError && (
        <p className="set-notice set-notice-amber">
          <Camera size={15} />
          New photo selected. Click <strong>Save Changes</strong> to upload it.
        </p>
      )}
      {pictureError && (
        <p className="set-notice set-notice-red">
          <AlertCircle size={15} />
          {pictureError}
        </p>
      )}

      <div className="set-grid">
        <div className="set-field">
          <label htmlFor="set-name">Full Name</label>
          <IconInput
            id="set-name"
            icon={User}
            value={form.fullName}
            error={fieldErrors.fullName}
            onChange={(e) => updateField('fullName', e.target.value)}
          />
          {fieldErrors.fullName && <p className="set-field-error">{fieldErrors.fullName}</p>}
        </div>
        <div className="set-field">
          <label htmlFor="set-email">Email Address</label>
          <IconInput
            id="set-email"
            icon={Mail}
            type="email"
            value={form.email}
            error={fieldErrors.email}
            onChange={(e) => updateField('email', e.target.value)}
          />
          {fieldErrors.email && <p className="set-field-error">{fieldErrors.email}</p>}
        </div>
        <div className="set-field">
          <label htmlFor="set-phone">Phone Number</label>
          <IconInput
            id="set-phone"
            icon={Phone}
            type="tel"
            inputMode="numeric"
            maxLength={11}
            placeholder="09123456789"
            value={form.phone}
            error={fieldErrors.phone}
            onChange={handlePhoneChange}
          />
          {phoneWarning && <p className="set-field-error">{phoneWarning}</p>}
          {!phoneWarning && fieldErrors.phone && <p className="set-field-error">{fieldErrors.phone}</p>}
        </div>
        <div className="set-field">
          <label htmlFor="set-address">Home Address</label>
          <IconInput
            id="set-address"
            icon={MapPin}
            value={form.address}
            onChange={(e) => updateField('address', e.target.value)}
          />
        </div>
      </div>

      {error && (
        <p className="set-notice set-notice-red">
          <AlertCircle size={15} />
          {error}
        </p>
      )}

      <SaveBar dirty={dirty} saving={saving} onDiscard={handleDiscard} onSave={handleSaveClick} />

      {showConfirm && (
        <ConfirmModal
          title="Save Profile Changes?"
          message="This will update your account information. Are you sure you want to continue?"
          confirmLabel="Save Changes"
          busy={saving}
          onCancel={() => setShowConfirm(false)}
          onConfirm={performSave}
        />
      )}
    </div>
  );
}

function Toggle({ checked, onClick, disabled = false }) {
  return (
    <button
      type="button"
      className={`set-toggle ${checked ? 'on' : ''}`}
      onClick={onClick}
      aria-pressed={checked}
      disabled={disabled}
    >
      <span className="set-toggle-dot" />
    </button>
  );
}

function ToggleRow({ icon: Icon, tone, title, sub, checked, onClick, disabled, tag }) {
  return (
    <div className={`set-toggle-row ${disabled ? 'disabled' : ''}`}>
      <span className={`set-toggle-icon tone-${tone}`}>
        <Icon size={17} />
      </span>
      <div className="set-toggle-text">
        <p className="set-toggle-title">
          {title}
          {tag && <span className="set-tag">{tag}</span>}
        </p>
        <p className="set-toggle-sub">{sub}</p>
      </div>
      <Toggle checked={checked} onClick={onClick} disabled={disabled} />
    </div>
  );
}

function NotificationsTab({ me, onSaved, showToast }) {
  const [saved, setSaved] = useState(() => toPrefs(me));
  const [prefs, setPrefs] = useState(() => toPrefs(me));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const dirty = !sameObject(prefs, saved);

  function toggle(key) {
    setPrefs((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const res = await apiClient.patch('/accounts/me/', prefs);
      const next = toPrefs(res.data);
      setSaved(next);
      setPrefs(next);
      onSaved(res.data);
      showToast('Your notification preferences have been saved.');
    } catch (err) {
      setError(getServerErrorMessage(err, 'Something went wrong saving your preferences. Please try again.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="set-card">
      <CardTitle icon={Bell} title="Notification Preferences" subtitle="Choose how and when we contact you." />

      <p className="set-group-label">Channels</p>
      <div className="set-toggle-group">
        <ToggleRow
          icon={Mail}
          tone="navy"
          title="Email Updates"
          sub="Get updates about your requests by email"
          checked={prefs.notify_email_updates}
          onClick={() => toggle('notify_email_updates')}
        />
        <ToggleRow
          icon={MessageSquare}
          tone="gray"
          title="SMS Updates"
          sub="Text message updates aren't offered yet"
          checked={false}
          onClick={() => {}}
          disabled
          tag="Not available yet"
        />
      </div>

      <p className="set-group-label">Request Updates</p>
      <div className="set-toggle-group">
        <ToggleRow
          icon={CheckCircle2}
          tone="green"
          title="Request Approval"
          sub="When your request is approved"
          checked={prefs.notify_request_approval}
          onClick={() => toggle('notify_request_approval')}
        />
        <ToggleRow
          icon={XCircle}
          tone="red"
          title="Request Not Compatible"
          sub="When your property isn't a good fit for solar"
          checked={prefs.notify_request_rejection}
          onClick={() => toggle('notify_request_rejection')}
        />
        <ToggleRow
          icon={Megaphone}
          tone="amber"
          title="Promotions & Offers"
          sub="Special offers and news from Glomax Solar"
          checked={prefs.notify_promotions}
          onClick={() => toggle('notify_promotions')}
        />
      </div>

      {error && (
        <p className="set-notice set-notice-red">
          <AlertCircle size={15} />
          {error}
        </p>
      )}

      <SaveBar
        dirty={dirty}
        saving={saving}
        onDiscard={() => setPrefs(saved)}
        onSave={handleSave}
        saveLabel="Save Preferences"
      />
    </div>
  );
}

function PasswordField({ id, label, placeholder, value, onChange }) {
  const [show, setShow] = useState(false);
  return (
    <div className="set-field">
      <label htmlFor={id}>{label}</label>
      <div className="set-input-wrap">
        <Lock size={16} />
        <input
          id={id}
          type={show ? 'text' : 'password'}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          autoComplete="new-password"
        />
        <button
          type="button"
          className="set-password-toggle"
          onClick={() => setShow((v) => !v)}
          tabIndex={-1}
          aria-label={show ? 'Hide password' : 'Show password'}
        >
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </div>
  );
}

// 6 separate boxes for the email code. Typing moves to the next box,
// Backspace goes back, and pasting the whole code fills every box.
function OtpInput({ digits, onChange, disabled, hasError, onComplete }) {
  const refs = useRef([]);

  useEffect(() => {
    refs.current[0]?.focus();
  }, []);

  function setAt(index, value) {
    const next = [...digits];
    next[index] = value;
    onChange(next);
    return next;
  }

  function fillFrom(index, text) {
    const clean = text.replace(/\D/g, '').slice(0, OTP_LENGTH - index);
    if (!clean) return;
    const next = [...digits];
    clean.split('').forEach((ch, i) => {
      next[index + i] = ch;
    });
    onChange(next);
    const last = Math.min(index + clean.length, OTP_LENGTH - 1);
    refs.current[last]?.focus();
    if (next.every((d) => d !== '')) onComplete(next.join(''));
  }

  function handleChange(index, e) {
    const value = e.target.value.replace(/\D/g, '');
    if (!value) {
      setAt(index, '');
      return;
    }
    if (value.length > 1) {
      fillFrom(index, value);
      return;
    }
    const next = setAt(index, value);
    if (index < OTP_LENGTH - 1) refs.current[index + 1]?.focus();
    if (next.every((d) => d !== '')) onComplete(next.join(''));
  }

  function handleKeyDown(index, e) {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      e.preventDefault();
      setAt(index - 1, '');
      refs.current[index - 1]?.focus();
    }
    if (e.key === 'ArrowLeft' && index > 0) refs.current[index - 1]?.focus();
    if (e.key === 'ArrowRight' && index < OTP_LENGTH - 1) refs.current[index + 1]?.focus();
  }

  function handlePaste(index, e) {
    e.preventDefault();
    fillFrom(index, e.clipboardData.getData('text'));
  }

  return (
    <div className={`set-otp ${hasError ? 'shake' : ''}`}>
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(el) => {
            refs.current[index] = el;
          }}
          type="text"
          inputMode="numeric"
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          maxLength={OTP_LENGTH}
          value={digit}
          disabled={disabled}
          className={`set-otp-box ${digit ? 'filled' : ''} ${hasError ? 'error' : ''}`}
          onChange={(e) => handleChange(index, e)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={(e) => handlePaste(index, e)}
          onFocus={(e) => e.target.select()}
          aria-label={`Digit ${index + 1}`}
        />
      ))}
    </div>
  );
}

const EMPTY_OTP = Array(OTP_LENGTH).fill('');

// Two steps: (1) enter passwords and get a code by email,
// (2) type the 6-digit code to actually change the password
function SecurityTab({ email, showToast }) {
  const [step, setStep] = useState('form'); // form | verify
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [otp, setOtp] = useState(EMPTY_OTP);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');
  const [otpError, setOtpError] = useState('');
  const [expiresAt, setExpiresAt] = useState(0);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(Date.now());

  const rulesPassed = PASSWORD_RULES.filter((rule) => rule.test(form.next)).length;
  const strength = form.next ? Math.min(4, rulesPassed + (form.next.length >= 12 ? 1 : 0)) : 0;
  const passwordsMatch = form.confirm.length > 0 && form.next === form.confirm;

  // Tick every second while waiting for the code, for the timers
  useEffect(() => {
    if (step !== 'verify') return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [step]);

  const timeLeft = expiresAt - now;
  const expired = step === 'verify' && timeLeft <= 0;
  const resendIn = Math.max(0, Math.ceil((resendAt - now) / 1000));
  const code = otp.join('');

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError('');
  }

  async function requestCode() {
    await apiClient.post('/accounts/change-password/request-otp/', {
      current_password: form.current,
      new_password: form.next,
    });
    const start = Date.now();
    setNow(start);
    setExpiresAt(start + OTP_LIFETIME_MS);
    setResendAt(start + RESEND_WAIT_MS);
    setOtp(EMPTY_OTP);
    setOtpError('');
  }

  async function handleSendCode() {
    if (!email) {
      setError('Please add an email address in My Profile first, so we can send you the code.');
      return;
    }
    if (!form.current || !form.next || !form.confirm) {
      setError('Please fill in all three fields.');
      return;
    }
    if (!PASSWORD_RULES.every((rule) => rule.test(form.next))) {
      setError('Your new password does not meet all the requirements.');
      return;
    }
    if (form.next !== form.confirm) {
      setError('New password and confirmation do not match.');
      return;
    }
    if (form.next === form.current) {
      setError('Your new password must be different from your current one.');
      return;
    }

    setSending(true);
    setError('');
    try {
      await requestCode();
      setStep('verify');
      showToast(`We sent a 6-digit code to ${maskEmail(email)}.`);
    } catch (err) {
      setError(getServerErrorMessage(err, 'Could not send the code. Please try again.'));
    } finally {
      setSending(false);
    }
  }

  async function handleResend() {
    if (resendIn > 0 || sending) return;
    setSending(true);
    setOtpError('');
    try {
      await requestCode();
      showToast('A new code is on its way.');
    } catch (err) {
      setOtpError(getServerErrorMessage(err, 'Could not send a new code. Please try again.'));
    } finally {
      setSending(false);
    }
  }

  async function handleVerify(fullCode = code) {
    if (verifying) return;
    if (fullCode.length !== OTP_LENGTH) {
      setOtpError('Please enter all 6 digits.');
      return;
    }
    if (expired) {
      setOtpError('This code has expired. Please send a new one.');
      return;
    }

    setVerifying(true);
    setOtpError('');
    try {
      await apiClient.post('/accounts/change-password/verify-otp/', { code: fullCode });
      setForm({ current: '', next: '', confirm: '' });
      setOtp(EMPTY_OTP);
      setStep('form');
      showToast('Your password has been updated.');
    } catch (err) {
      setOtpError(getServerErrorMessage(err, 'Could not verify the code. Please try again.'));
      setOtp(EMPTY_OTP);
    } finally {
      setVerifying(false);
    }
  }

  function handleBack() {
    setStep('form');
    setOtp(EMPTY_OTP);
    setOtpError('');
  }

  if (step === 'verify') {
    return (
      <div className="set-security">
        <div className="set-card set-otp-card">
          <button type="button" className="set-back-link" onClick={handleBack} disabled={verifying}>
            <ArrowLeft size={15} />
            Back
          </button>

          <div className="set-otp-hero">
            <span className="set-otp-icon">
              <MailCheck size={28} />
            </span>
            <h2>Check your email</h2>
            <p>
              We sent a 6-digit verification code to <strong>{maskEmail(email)}</strong>. Enter it
              below to confirm your new password.
            </p>
          </div>

          <OtpInput
            key={expiresAt}
            digits={otp}
            onChange={(next) => {
              setOtp(next);
              setOtpError('');
            }}
            disabled={verifying || expired}
            hasError={Boolean(otpError)}
            onComplete={(full) => handleVerify(full)}
          />

          <p className={`set-otp-timer ${expired ? 'expired' : timeLeft < 60000 ? 'soon' : ''}`}>
            <Clock size={14} />
            {expired ? 'This code has expired.' : `Code expires in ${formatCountdown(timeLeft)}`}
          </p>

          {otpError && (
            <p className="set-notice set-notice-red set-otp-error">
              <AlertCircle size={15} />
              {otpError}
            </p>
          )}

          <button
            type="button"
            className="set-btn set-otp-verify"
            onClick={() => handleVerify()}
            disabled={verifying || expired || code.length !== OTP_LENGTH}
          >
            <ShieldCheck size={16} />
            {verifying ? 'Verifying...' : 'Verify & Update Password'}
          </button>

          <p className="set-otp-resend">
            Didn't get the code?{' '}
            <button
              type="button"
              className="set-link-btn"
              onClick={handleResend}
              disabled={resendIn > 0 || sending}
            >
              <RotateCw size={13} />
              {sending ? 'Sending...' : resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
            </button>
          </p>
          <p className="set-otp-hint">Check your spam folder too. The code works only once.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="set-security">
      <div className="set-card">
        <CardTitle icon={KeyRound} title="Change Password" subtitle="Use a strong password you don't use anywhere else." />

        <PasswordField
          id="set-current"
          label="Current Password"
          placeholder="Enter your current password"
          value={form.current}
          onChange={(e) => updateField('current', e.target.value)}
        />

        <div className="set-grid set-grid-password">
          <div>
            <PasswordField
              id="set-new"
              label="New Password"
              placeholder="At least 8 characters"
              value={form.next}
              onChange={(e) => updateField('next', e.target.value)}
            />
            {form.next && (
              <div className="set-strength">
                <div className="set-strength-bar">
                  {[1, 2, 3, 4].map((n) => (
                    <span key={n} className={`set-strength-seg ${n <= strength ? `lvl-${strength}` : ''}`} />
                  ))}
                </div>
                <span className={`set-strength-label lvl-${strength}`}>{STRENGTH_LABELS[strength]}</span>
              </div>
            )}
          </div>
          <div>
            <PasswordField
              id="set-confirm"
              label="Confirm New Password"
              placeholder="Type it again"
              value={form.confirm}
              onChange={(e) => updateField('confirm', e.target.value)}
            />
            {form.confirm && (
              <p className={`set-match ${passwordsMatch ? 'ok' : 'bad'}`}>
                {passwordsMatch ? <Check size={14} /> : <X size={14} />}
                {passwordsMatch ? 'Passwords match' : "Passwords don't match"}
              </p>
            )}
          </div>
        </div>

        <ul className="set-rules">
          {PASSWORD_RULES.map((rule) => {
            const passed = rule.test(form.next);
            return (
              <li key={rule.key} className={passed ? 'met' : ''}>
                <span className="set-rule-icon">{passed ? <Check size={12} /> : <X size={12} />}</span>
                {rule.label}
              </li>
            );
          })}
        </ul>

        <div className="set-otp-note">
          <Mail size={16} />
          <p>
            For your safety, we'll email a 6-digit code to <strong>{maskEmail(email)}</strong>. Your
            password only changes after you enter it.
          </p>
        </div>

        {error && (
          <p className="set-notice set-notice-red set-security-error">
            <AlertCircle size={15} />
            {error}
          </p>
        )}

        <div className="set-save-bar">
          <p className="set-save-status">
            <Shield size={15} />
            You'll use your new password the next time you sign in.
          </p>
          <div className="set-save-actions">
            <button type="button" className="set-btn" onClick={handleSendCode} disabled={sending}>
              <Send size={15} />
              {sending ? 'Sending code...' : 'Send Verification Code'}
            </button>
          </div>
        </div>
      </div>

      <div className="set-tip">
        <span className="set-tip-icon">
          <ShieldCheck size={18} />
        </span>
        <div>
          <p className="set-tip-title">Keep your account safe</p>
          <p className="set-tip-text">
            Never share your password or verification code with anyone, including people who say
            they're from Glomax. Our team will never ask for them.
          </p>
        </div>
      </div>
    </div>
  );
}

function SettingsSkeleton() {
  return (
    <div className="set-layout">
      <div className="set-side">
        <span className="set-skel set-skel-user" />
        <span className="set-skel set-skel-tabs" />
      </div>
      <div className="set-content">
        <span className="set-skel set-skel-card" />
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('profile');
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);

  // Load the account once and share it with every tab
  async function load() {
    try {
      setLoading(true);
      const res = await apiClient.get('/accounts/me/');
      setMe(res.data);
      setError('');
    } catch {
      setError('Could not load your account. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function showToast(message, type = 'success') {
    setToast({ message, type });
  }

  const initials = (me?.username || 'CU').slice(0, 2).toUpperCase();
  const picture = toMediaUrl(me?.profile_picture);

  return (
    <CustomerLayout pageTitle="Settings" pageSubtitle="Manage your account preferences">
      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}

      {loading && <SettingsSkeleton />}

      {!loading && error && (
        <div className="set-card set-error-card">
          <span className="set-error-badge">
            <AlertCircle size={28} />
          </span>
          <p className="set-error-title">Something went wrong</p>
          <p className="set-error-hint">{error}</p>
          <button type="button" className="set-btn" onClick={load}>
            Try again
          </button>
        </div>
      )}

      {!loading && !error && me && (
        <div className="set-layout">
          <aside className="set-side">
            <div className="set-user">
              <Avatar picture={picture} initials={initials} size="lg" />
              <div className="set-user-text">
                <p className="set-user-name">{me.username}</p>
                <p className="set-user-email">{me.email || 'No email yet'}</p>
                <span className="set-user-role">Customer</span>
              </div>
            </div>

            <nav className="set-tabs">
              {TABS.map(({ key, label, desc, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  className={`set-tab ${activeTab === key ? 'active' : ''}`}
                  onClick={() => setActiveTab(key)}
                >
                  <span className="set-tab-icon">
                    <Icon size={17} />
                  </span>
                  <span className="set-tab-text">
                    <span className="set-tab-label">{label}</span>
                    <span className="set-tab-desc">{desc}</span>
                  </span>
                </button>
              ))}
            </nav>
          </aside>

          <div className="set-content">
            {activeTab === 'profile' && <ProfileTab me={me} onSaved={setMe} showToast={showToast} />}
            {activeTab === 'notifications' && (
              <NotificationsTab me={me} onSaved={setMe} showToast={showToast} />
            )}
            {activeTab === 'security' && <SecurityTab email={me.email} showToast={showToast} />}
          </div>
        </div>
      )}
    </CustomerLayout>
  );
}