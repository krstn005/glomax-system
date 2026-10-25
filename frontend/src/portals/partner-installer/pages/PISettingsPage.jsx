import { useEffect, useRef, useState } from 'react';
import {
  Camera,
  User,
  CalendarClock,
  Bell,
  Shield,
  Eye,
  EyeOff,
  Check,
  X,
  Mail,
  MailCheck,
  Phone,
  Lock,
  KeyRound,
  AlertCircle,
  Info,
  Upload,
  ShieldCheck,
  ArrowLeft,
  Clock,
  RotateCw,
  Send,
  CheckCircle2,
  MessageSquare,
  ClipboardCheck,
  RefreshCw,
  BadgeCheck,
  Wrench,
  Award,
  ChevronDown,
  PauseCircle,
} from 'lucide-react';
import PILayout from '../components/PILayout';
import apiClient from '../../../api/client';
import { sanitizePhoneNumber } from '../../../utils/phone';
import { toMediaUrl } from '../../../utils/mediaUrl';
import '../styles/pi-settings.css';

const TABS = [
  { key: 'profile', label: 'My Profile', desc: 'Name, phone and work details', icon: User },
  { key: 'availability', label: 'Availability', desc: 'Take new tickets or pause', icon: CalendarClock },
  { key: 'notifications', label: 'Notifications', desc: 'Choose what we notify you about', icon: Bell },
  { key: 'security', label: 'Security', desc: 'Change your password', icon: Shield },
];

const SPECIALIZATION_OPTIONS = [
  { value: 'ON_GRID', label: 'On-Grid Systems' },
  { value: 'HYBRID', label: 'Hybrid Systems' },
  { value: 'BOTH', label: 'Both' },
];

const AVAILABILITY_STORAGE_KEY = 'pi-settings-availability';

const PASSWORD_RULES = [
  { key: 'length', label: 'At least 8 characters', test: (v) => v.length >= 8 },
  { key: 'upper', label: 'At least one uppercase letter', test: (v) => /[A-Z]/.test(v) },
  { key: 'number', label: 'At least one number', test: (v) => /[0-9]/.test(v) },
];

const MAX_PHOTO_SIZE_MB = 5;

// Philippine mobile number: 11 digits starting with 09
const PH_MOBILE = /^09\d{9}$/;

const STRENGTH_LABELS = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong'];

// Matches the backend: codes expire after 10 minutes
const OTP_LENGTH = 6;
const OTP_LIFETIME_MS = 10 * 60 * 1000;
const RESEND_WAIT_MS = 60 * 1000;

// Friendly names for the fields the server might complain about
const FIELD_LABELS = {
  username: 'Full Name',
  phone_number: 'Phone Number',
  employee_id: 'Employee ID',
  specialization: 'Specialization',
  years_experience: 'Years of Experience',
  profile_picture: 'Photo',
  current_password: 'Current Password',
  new_password: 'New Password',
  code: 'Code',
};

// Turns the server's error into a short message people can understand.
// Example: { username: ["A user with that username already exists."] }
// becomes "Full Name: A user with that username already exists."
function getServerErrorMessage(err, fallback) {
  const data = err?.response?.data;
  if (!data || typeof data !== 'object') {
    const status = err?.response?.status;
    return status ? `${fallback} (error ${status})` : fallback;
  }
  if (data.detail) return data.detail;

  const firstEntry = Object.entries(data)[0];
  if (!firstEntry) return fallback;

  const [field, messages] = firstEntry;
  const message = Array.isArray(messages) ? messages[0] : String(messages);
  const label = FIELD_LABELS[field];
  return label ? `${label}: ${message}` : message;
}

// Gives the photo a short, unique file name before uploading.
// Django only allows 100 characters for the saved file path.
function shortPhotoName(file) {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().slice(0, 5);
  return `profile-${Date.now()}.${ext}`;
}

function checkPhoto(file) {
  if (!file.type.startsWith('image/')) return 'Please choose an image file (JPG or PNG).';
  if (file.size > MAX_PHOTO_SIZE_MB * 1024 * 1024) {
    return `Photo is too large. Please choose one under ${MAX_PHOTO_SIZE_MB} MB.`;
  }
  return '';
}

function toProfileForm(me) {
  return {
    fullName: me.username || '',
    phone: me.phone_number || '',
    specialization: me.specialization || 'ON_GRID',
    yearsExperience: me.years_experience ?? '',
  };
}

function toPrefs(me) {
  return {
    notify_email_updates: Boolean(me.notify_email_updates),
    notify_sms_updates: Boolean(me.notify_sms_updates),
    notify_request_approval: Boolean(me.notify_request_approval),
    notify_request_rejection: Boolean(me.notify_request_rejection),
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

function readAvailability() {
  try {
    const stored = localStorage.getItem(AVAILABILITY_STORAGE_KEY);
    return stored === null ? true : stored === 'true';
  } catch {
    return true;
  }
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
        className={`pi-set-avatar pi-set-avatar-${size}`}
        onError={() => setBroken(true)}
      />
    );
  }
  return <div className={`pi-set-avatar pi-set-avatar-${size} pi-set-avatar-initials`}>{initials}</div>;
}

function Toast({ message, type = 'success', onDone }) {
  useEffect(() => {
    const timer = setTimeout(onDone, 3500);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <div className={`pi-set-toast ${type}`} role="status">
      {type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
      {message}
    </div>
  );
}

function ConfirmModal({ title, message, confirmLabel, busy, onCancel, onConfirm }) {
  return (
    <div className="pi-set-modal-overlay" onClick={() => !busy && onCancel()}>
      <div className="pi-set-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="pi-set-modal-icon">
          <ShieldCheck size={22} />
        </div>
        <h3>{title}</h3>
        <p>{message}</p>
        <div className="pi-set-modal-actions">
          <button type="button" className="pi-set-btn-secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="pi-set-btn" disabled={busy} onClick={onConfirm}>
            {busy ? 'Saving...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function CardTitle({ icon: Icon, title, subtitle }) {
  return (
    <div className="pi-set-card-head">
      <span className="pi-set-card-icon">
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
    <div className={`pi-set-save-bar ${dirty ? 'dirty' : ''}`}>
      <p className="pi-set-save-status">
        {dirty ? (
          <>
            <span className="pi-set-save-dot" />
            You have unsaved changes
          </>
        ) : (
          <>
            <Check size={15} />
            Everything is up to date
          </>
        )}
      </p>
      <div className="pi-set-save-actions">
        {dirty && (
          <button type="button" className="pi-set-btn-secondary" onClick={onDiscard} disabled={saving}>
            Discard
          </button>
        )}
        <button type="button" className="pi-set-btn" onClick={onSave} disabled={!dirty || saving}>
          {saving ? 'Saving...' : saveLabel}
        </button>
      </div>
    </div>
  );
}

function IconInput({ id, icon: Icon, error, readOnly, ...inputProps }) {
  return (
    <div className={`pi-set-input-wrap ${error ? 'has-error' : ''} ${readOnly ? 'is-readonly' : ''}`}>
      <Icon size={16} />
      <input id={id} readOnly={readOnly} {...inputProps} />
      {readOnly && <Lock size={14} className="pi-set-lock" />}
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
    if (form.phone && !PH_MOBILE.test(form.phone)) {
      errors.phone = 'Please enter an 11-digit mobile number starting with 09.';
    }
    if (form.yearsExperience !== '' && Number(form.yearsExperience) < 0) {
      errors.yearsExperience = 'Years of experience cannot be negative.';
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setShowConfirm(true);
  }

  async function performSave() {
    setSaving(true);
    setError('');
    try {
      // 1) Save the text details
      let res = await apiClient.patch('/accounts/me/', {
        username: form.fullName.trim(),
        phone_number: form.phone,
        employee_id: me.employee_id || '',
        specialization: form.specialization,
        years_experience: form.yearsExperience,
      });

      // 2) Upload the new photo, if one was picked
      let photoFailed = false;
      if (pictureFile) {
        try {
          const formData = new FormData();
          formData.append('profile_picture', pictureFile, shortPhotoName(pictureFile));
          res = await apiClient.patch('/accounts/me/', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
        } catch {
          photoFailed = true;
        }
      }

      const next = toProfileForm(res.data);
      localStorage.setItem('username', next.fullName);
      setSaved(next);
      setForm(next);
      setPictureFile(null);
      setPicturePreview(null);
      onSaved(res.data);
      window.dispatchEvent(new Event('profile-picture-updated'));

      if (photoFailed) {
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

  const initials = (form.fullName || 'PI').slice(0, 2).toUpperCase();
  const displayedPicture = picturePreview || pictureUrl;

  return (
    <div className="pi-set-card">
      <CardTitle icon={User} title="Worker Profile" subtitle="This is how Staff and customers will see you." />

      <div className="pi-set-photo">
        <div className="pi-set-photo-avatar">
          <Avatar picture={displayedPicture} initials={initials} size="xl" />
          <button
            type="button"
            className="pi-set-photo-badge"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Change photo"
          >
            <Camera size={14} />
          </button>
        </div>
        <div className="pi-set-photo-text">
          <p className="pi-set-photo-title">Profile Photo</p>
          <p className="pi-set-photo-sub">JPG or PNG, up to {MAX_PHOTO_SIZE_MB} MB</p>
          <button type="button" className="pi-set-btn-outline" onClick={() => fileInputRef.current?.click()}>
            <Upload size={15} />
            Upload new photo
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handlePictureChange}
          className="pi-set-file-input"
        />
      </div>

      {pictureFile && !pictureError && (
        <p className="pi-set-notice pi-set-notice-gold">
          <Camera size={15} />
          <span>
            New photo selected. Click <strong>Save Changes</strong> to upload it.
          </span>
        </p>
      )}
      {pictureError && (
        <p className="pi-set-notice pi-set-notice-red">
          <AlertCircle size={15} />
          <span>{pictureError}</span>
        </p>
      )}

      <p className="pi-set-group-label">Contact</p>
      <div className="pi-set-grid">
        <div className="pi-set-field">
          <label htmlFor="pi-set-name">Full Name</label>
          <IconInput
            id="pi-set-name"
            icon={User}
            value={form.fullName}
            error={fieldErrors.fullName}
            onChange={(e) => updateField('fullName', e.target.value)}
          />
          {fieldErrors.fullName && <p className="pi-set-field-error">{fieldErrors.fullName}</p>}
        </div>
        <div className="pi-set-field">
          <label htmlFor="pi-set-phone">Phone Number</label>
          <IconInput
            id="pi-set-phone"
            icon={Phone}
            type="tel"
            inputMode="numeric"
            maxLength={11}
            placeholder="09123456789"
            value={form.phone}
            error={fieldErrors.phone}
            onChange={handlePhoneChange}
          />
          {phoneWarning && <p className="pi-set-field-error">{phoneWarning}</p>}
          {!phoneWarning && fieldErrors.phone && <p className="pi-set-field-error">{fieldErrors.phone}</p>}
        </div>
        <div className="pi-set-field">
          <label htmlFor="pi-set-email">Email Address</label>
          <IconInput id="pi-set-email" icon={Mail} value={me.email || ''} placeholder="No email yet" readOnly />
        </div>
        <div className="pi-set-field">
          <label htmlFor="pi-set-employee">Employee ID</label>
          <IconInput
            id="pi-set-employee"
            icon={BadgeCheck}
            value={me.employee_id || ''}
            placeholder="Not assigned yet"
            readOnly
          />
        </div>
      </div>

      <p className="pi-set-notice pi-set-notice-navy pi-set-admin-note">
        <Info size={15} />
        <span>Email and Employee ID are managed by Admin. Please contact support if they need changing.</span>
      </p>

      <p className="pi-set-group-label">Work Details</p>
      <div className="pi-set-grid">
        <div className="pi-set-field">
          <label htmlFor="pi-set-spec">Specialization</label>
          <div className="pi-set-input-wrap pi-set-select-wrap">
            <Wrench size={16} />
            <select
              id="pi-set-spec"
              value={form.specialization}
              onChange={(e) => updateField('specialization', e.target.value)}
            >
              {SPECIALIZATION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <ChevronDown size={16} className="pi-set-select-arrow" />
          </div>
        </div>
        <div className="pi-set-field">
          <label htmlFor="pi-set-years">Years of Experience</label>
          <IconInput
            id="pi-set-years"
            icon={Award}
            type="number"
            min="0"
            placeholder="0"
            value={form.yearsExperience}
            error={fieldErrors.yearsExperience}
            onChange={(e) => updateField('yearsExperience', e.target.value)}
          />
          {fieldErrors.yearsExperience && <p className="pi-set-field-error">{fieldErrors.yearsExperience}</p>}
        </div>
      </div>

      {error && (
        <p className="pi-set-notice pi-set-notice-red pi-set-notice-top">
          <AlertCircle size={15} />
          <span>{error}</span>
        </p>
      )}

      <SaveBar dirty={dirty} saving={saving} onDiscard={handleDiscard} onSave={handleSaveClick} />

      {showConfirm && (
        <ConfirmModal
          title="Save Profile Changes?"
          message="This will update your worker profile. Are you sure you want to continue?"
          confirmLabel="Save Changes"
          busy={saving}
          onCancel={() => setShowConfirm(false)}
          onConfirm={performSave}
        />
      )}
    </div>
  );
}

function Toggle({ checked, onClick, disabled = false, label }) {
  return (
    <button
      type="button"
      className={`pi-set-toggle ${checked ? 'on' : ''}`}
      onClick={onClick}
      aria-pressed={checked}
      aria-label={label}
      disabled={disabled}
    >
      <span className="pi-set-toggle-dot" />
    </button>
  );
}

function ToggleRow({ icon: Icon, tone, title, sub, checked, onClick, disabled }) {
  return (
    <div className={`pi-set-toggle-row ${disabled ? 'disabled' : ''}`}>
      <span className={`pi-set-toggle-icon tone-${tone}`}>
        <Icon size={17} />
      </span>
      <div className="pi-set-toggle-text">
        <p className="pi-set-toggle-title">{title}</p>
        <p className="pi-set-toggle-sub">{sub}</p>
      </div>
      <Toggle checked={checked} onClick={onClick} disabled={disabled} label={title} />
    </div>
  );
}

function AvailabilityTab({ available, onChange }) {
  return (
    <div className="pi-set-card">
      <CardTitle
        icon={CalendarClock}
        title="Availability"
        subtitle="Let Staff know if you can take new tickets right now."
      />

      <div className={`pi-set-avail ${available ? 'on' : 'off'}`}>
        <span className="pi-set-avail-icon">
          {available ? <CheckCircle2 size={26} /> : <PauseCircle size={26} />}
        </span>
        <div className="pi-set-avail-text">
          <p className="pi-set-avail-title">
            {available ? 'You are available for new assignments' : 'New assignments are paused'}
          </p>
          <p className="pi-set-avail-sub">
            {available
              ? 'Staff can assign new tickets to you.'
              : "Staff won't assign new tickets to you until you turn this back on."}
          </p>
        </div>
        <Toggle checked={available} onClick={() => onChange(!available)} label="Available for new assignments" />
      </div>

      <p className="pi-set-notice pi-set-notice-navy pi-set-notice-top pi-set-notice-last">
        <Info size={15} />
        <span>Tickets already assigned to you stay in your list either way.</span>
      </p>
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
    <div className="pi-set-card">
      <CardTitle icon={Bell} title="Notification Preferences" subtitle="Choose how and when we contact you." />

      <p className="pi-set-group-label">Ticket Updates</p>
      <div className="pi-set-toggle-group">
        <ToggleRow
          icon={ClipboardCheck}
          tone="green"
          title="Ticket Assignments & Approvals"
          sub="When Staff assigns you a new ticket or approves your assessment"
          checked={prefs.notify_request_approval}
          onClick={() => toggle('notify_request_approval')}
        />
        <ToggleRow
          icon={RefreshCw}
          tone="red"
          title="Status Changes"
          sub="When an assessment is marked not compatible or needs changes"
          checked={prefs.notify_request_rejection}
          onClick={() => toggle('notify_request_rejection')}
        />
      </div>

      <p className="pi-set-group-label">Channels</p>
      <div className="pi-set-toggle-group">
        <ToggleRow
          icon={Mail}
          tone="navy"
          title="Email Updates"
          sub="Also send these updates to your email, not just in-app"
          checked={prefs.notify_email_updates}
          onClick={() => toggle('notify_email_updates')}
        />
        <ToggleRow
          icon={MessageSquare}
          tone="blue"
          title="SMS Updates"
          sub="Also send these updates by text message"
          checked={prefs.notify_sms_updates}
          onClick={() => toggle('notify_sms_updates')}
        />
      </div>

      {error && (
        <p className="pi-set-notice pi-set-notice-red pi-set-notice-top">
          <AlertCircle size={15} />
          <span>{error}</span>
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
    <div className="pi-set-field">
      <label htmlFor={id}>{label}</label>
      <div className="pi-set-input-wrap">
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
          className="pi-set-password-toggle"
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
    <div className={`pi-set-otp ${hasError ? 'shake' : ''}`}>
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
          className={`pi-set-otp-box ${digit ? 'filled' : ''} ${hasError ? 'error' : ''}`}
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
      setError('Your account has no email yet, so we cannot send a code. Please contact Admin.');
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
      setOtpError(getServerErrorMessage(err, 'Incorrect or expired code. Please try again.'));
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
      <div className="pi-set-security">
        <div className="pi-set-card pi-set-otp-card">
          <button type="button" className="pi-set-back-link" onClick={handleBack} disabled={verifying}>
            <ArrowLeft size={15} />
            Back
          </button>

          <div className="pi-set-otp-hero">
            <span className="pi-set-otp-icon">
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

          <p className={`pi-set-otp-timer ${expired ? 'expired' : timeLeft < 60000 ? 'soon' : ''}`}>
            <Clock size={14} />
            {expired ? 'This code has expired.' : `Code expires in ${formatCountdown(timeLeft)}`}
          </p>

          {otpError && (
            <p className="pi-set-notice pi-set-notice-red pi-set-otp-error">
              <AlertCircle size={15} />
              <span>{otpError}</span>
            </p>
          )}

          <button
            type="button"
            className="pi-set-btn pi-set-otp-verify"
            onClick={() => handleVerify()}
            disabled={verifying || expired || code.length !== OTP_LENGTH}
          >
            <ShieldCheck size={16} />
            {verifying ? 'Verifying...' : 'Verify & Update Password'}
          </button>

          <p className="pi-set-otp-resend">
            Didn't get the code?{' '}
            <button
              type="button"
              className="pi-set-link-btn"
              onClick={handleResend}
              disabled={resendIn > 0 || sending}
            >
              <RotateCw size={13} />
              {sending ? 'Sending...' : resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
            </button>
          </p>
          <p className="pi-set-otp-hint">Check your spam folder too. The code works only once.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="pi-set-security">
      <div className="pi-set-card">
        <CardTitle icon={KeyRound} title="Change Password" subtitle="Use a strong password you don't use anywhere else." />

        <PasswordField
          id="pi-set-current"
          label="Current Password"
          placeholder="Enter your current password"
          value={form.current}
          onChange={(e) => updateField('current', e.target.value)}
        />

        <div className="pi-set-grid pi-set-grid-password">
          <div>
            <PasswordField
              id="pi-set-new"
              label="New Password"
              placeholder="At least 8 characters"
              value={form.next}
              onChange={(e) => updateField('next', e.target.value)}
            />
            {form.next && (
              <div className="pi-set-strength">
                <div className="pi-set-strength-bar">
                  {[1, 2, 3, 4].map((n) => (
                    <span key={n} className={`pi-set-strength-seg ${n <= strength ? `lvl-${strength}` : ''}`} />
                  ))}
                </div>
                <span className={`pi-set-strength-label lvl-${strength}`}>{STRENGTH_LABELS[strength]}</span>
              </div>
            )}
          </div>
          <div>
            <PasswordField
              id="pi-set-confirm"
              label="Confirm New Password"
              placeholder="Type it again"
              value={form.confirm}
              onChange={(e) => updateField('confirm', e.target.value)}
            />
            {form.confirm && (
              <p className={`pi-set-match ${passwordsMatch ? 'ok' : 'bad'}`}>
                {passwordsMatch ? <Check size={14} /> : <X size={14} />}
                {passwordsMatch ? 'Passwords match' : "Passwords don't match"}
              </p>
            )}
          </div>
        </div>

        <ul className="pi-set-rules">
          {PASSWORD_RULES.map((rule) => {
            const passed = rule.test(form.next);
            return (
              <li key={rule.key} className={passed ? 'met' : ''}>
                <span className="pi-set-rule-icon">{passed ? <Check size={12} /> : <X size={12} />}</span>
                {rule.label}
              </li>
            );
          })}
        </ul>

        <div className="pi-set-otp-note">
          <Mail size={16} />
          <p>
            For your safety, we'll email a 6-digit code to <strong>{maskEmail(email)}</strong>. Your
            password only changes after you enter it.
          </p>
        </div>

        {error && (
          <p className="pi-set-notice pi-set-notice-red pi-set-notice-top">
            <AlertCircle size={15} />
            <span>{error}</span>
          </p>
        )}

        <div className="pi-set-save-bar">
          <p className="pi-set-save-status">
            <Shield size={15} />
            You'll use your new password the next time you sign in.
          </p>
          <div className="pi-set-save-actions">
            <button type="button" className="pi-set-btn" onClick={handleSendCode} disabled={sending}>
              <Send size={15} />
              {sending ? 'Sending code...' : 'Send Verification Code'}
            </button>
          </div>
        </div>
      </div>

      <div className="pi-set-tip">
        <span className="pi-set-tip-icon">
          <ShieldCheck size={18} />
        </span>
        <div>
          <p className="pi-set-tip-title">Keep your account safe</p>
          <p className="pi-set-tip-text">
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
    <div className="pi-set-layout">
      <div className="pi-set-side">
        <span className="pi-set-skel pi-set-skel-user" />
        <span className="pi-set-skel pi-set-skel-tabs" />
      </div>
      <div className="pi-set-content">
        <span className="pi-set-skel pi-set-skel-card" />
      </div>
    </div>
  );
}

export default function PISettingsPage() {
  const [activeTab, setActiveTab] = useState('profile');
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);
  const [available, setAvailable] = useState(readAvailability);

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

  function changeAvailability(next) {
    setAvailable(next);
    try {
      localStorage.setItem(AVAILABILITY_STORAGE_KEY, String(next));
    } catch {
      // Storage can be blocked in private windows - the switch still works for this visit
    }
    showToast(next ? 'You are now available for new assignments.' : 'New assignments are paused.');
  }

  const initials = (me?.username || 'PI').slice(0, 2).toUpperCase();
  const picture = toMediaUrl(me?.profile_picture);

  return (
    <PILayout pageTitle="Settings" pageSubtitle="Manage your worker account and preferences">
      <div className="pi-set-page">
        {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}

        {loading && <SettingsSkeleton />}

        {!loading && error && (
          <div className="pi-set-card pi-set-error-card">
            <span className="pi-set-error-badge">
              <AlertCircle size={28} />
            </span>
            <p className="pi-set-error-title">Something went wrong</p>
            <p className="pi-set-error-hint">{error}</p>
            <button type="button" className="pi-set-btn" onClick={load}>
              Try again
            </button>
          </div>
        )}

        {!loading && !error && me && (
          <div className="pi-set-layout">
            <aside className="pi-set-side">
              <div className="pi-set-user">
                <Avatar picture={picture} initials={initials} size="lg" />
                <div className="pi-set-user-text">
                  <p className="pi-set-user-name">{me.username}</p>
                  <p className="pi-set-user-email">{me.email || 'No email yet'}</p>
                  <span className="pi-set-user-role">Partner Installer</span>
                </div>
              </div>

              <nav className="pi-set-tabs" aria-label="Settings sections">
                {TABS.map(({ key, label, desc, icon: Icon }) => (
                  <button
                    key={key}
                    type="button"
                    className={`pi-set-tab ${activeTab === key ? 'active' : ''}`}
                    onClick={() => setActiveTab(key)}
                    aria-current={activeTab === key ? 'page' : undefined}
                  >
                    <span className="pi-set-tab-icon">
                      <Icon size={17} />
                    </span>
                    <span className="pi-set-tab-text">
                      <span className="pi-set-tab-label">{label}</span>
                      <span className="pi-set-tab-desc">{desc}</span>
                    </span>
                  </button>
                ))}
              </nav>
            </aside>

            <div className="pi-set-content">
              {activeTab === 'profile' && <ProfileTab me={me} onSaved={setMe} showToast={showToast} />}
              {activeTab === 'availability' && (
                <AvailabilityTab available={available} onChange={changeAvailability} />
              )}
              {activeTab === 'notifications' && (
                <NotificationsTab me={me} onSaved={setMe} showToast={showToast} />
              )}
              {activeTab === 'security' && <SecurityTab email={me.email} showToast={showToast} />}
            </div>
          </div>
        )}
      </div>
    </PILayout>
  );
}