import { useEffect, useRef, useState } from 'react';
import {
  Camera,
  User,
  Bell,
  Shield,
  MessageSquare,
  SlidersHorizontal,
  HelpCircle,
  Eye,
  EyeOff,
  Check,
  X,
  Mail,
  Phone,
  MapPin,
  Lock,
  KeyRound,
  AlertCircle,
  Upload,
  ShieldCheck,
  CheckCircle2,
  Inbox,
  UserCog,
  Megaphone,
  Plus,
  Pencil,
  Trash2,
  Info,
} from 'lucide-react';
import apiClient from '../../../api/client';
import { sanitizePhoneNumber } from '../../../utils/phone';
import { toMediaUrl } from '../../../utils/mediaUrl';
import AdminLayout from '../components/AdminLayout';
import {
  getSmsTemplates,
  createSmsTemplate,
  updateSmsTemplate,
  deleteSmsTemplate,
  getSystemSettings,
  createSystemSetting,
  updateSystemSetting,
  deleteSystemSetting,
  getFaqs,
  createFaq,
  updateFaq,
  deleteFaq,
} from '../../../api/adminconfig';
import '../styles/admin-settings.css';

// Left menu, split into two small groups
const TABS = [
  { key: 'profile', group: 'Account', label: 'My Profile', desc: 'Name, contact and photo', icon: User },
  { key: 'notifications', group: 'Account', label: 'Notifications', short: 'Alerts', desc: 'What we notify you about', icon: Bell },
  { key: 'security', group: 'Account', label: 'Security', desc: 'Change your password', icon: Shield },
  { key: 'sms', group: 'System', label: 'SMS Templates', short: 'SMS', desc: 'Reusable text messages', icon: MessageSquare },
  { key: 'system', group: 'System', label: 'System', desc: 'Key and value settings', icon: SlidersHorizontal },
  { key: 'faqs', group: 'System', label: 'FAQs', desc: 'Questions shown to customers', icon: HelpCircle },
];

const PASSWORD_RULES = [
  { key: 'length', label: 'At least 8 characters', test: (v) => v.length >= 8 },
  { key: 'upper', label: 'At least one uppercase letter', test: (v) => /[A-Z]/.test(v) },
  { key: 'number', label: 'At least one number', test: (v) => /[0-9]/.test(v) },
];

const STRENGTH_LABELS = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong'];

const MAX_PHOTO_SIZE_MB = 5;

// Philippine mobile number: 11 digits starting with 09
const PH_MOBILE = /^09\d{9}$/;

// Friendly names for the fields the server might complain about
const FIELD_LABELS = {
  username: 'Full Name',
  email: 'Email Address',
  phone_number: 'Phone Number',
  address: 'Home Address',
  profile_picture: 'Photo',
  current_password: 'Current Password',
  new_password: 'New Password',
  name: 'Name',
  message: 'Message',
  key: 'Key',
  value: 'Value',
  question: 'Question',
  answer: 'Answer',
};

// Turns the server's error into one short line people can understand
function getServerErrorMessage(err, fallback) {
  const data = err?.response?.data;
  if (!data || typeof data !== 'object') return fallback;
  if (data.detail) return data.detail;
  const firstEntry = Object.entries(data)[0];
  if (!firstEntry) return fallback;
  const [field, messages] = firstEntry;
  const message = Array.isArray(messages) ? messages[0] : String(messages);
  const label = FIELD_LABELS[field];
  return label ? `${label}: ${message}` : message;
}

// Short, unique file name for the photo (Django allows 100 characters)
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
        className={`admset-avatar admset-avatar-${size}`}
        onError={() => setBroken(true)}
      />
    );
  }
  return <div className={`admset-avatar admset-avatar-${size} admset-avatar-initials`}>{initials}</div>;
}

function Toast({ message, type = 'success', onDone }) {
  useEffect(() => {
    const timer = setTimeout(onDone, 3500);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <div className={`admset-toast ${type}`} role="status">
      {type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
      {message}
    </div>
  );
}

function ConfirmModal({ title, message, confirmLabel, busy, danger, onCancel, onConfirm }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape' && !busy) onCancel();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onCancel]);

  return (
    <div className="admset-modal-overlay" onClick={() => !busy && onCancel()}>
      <div className="admset-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className={`admset-modal-icon ${danger ? 'red' : ''}`}>
          {danger ? <Trash2 size={22} /> : <ShieldCheck size={22} />}
        </div>
        <h3>{title}</h3>
        <p>{message}</p>
        <div className="admset-modal-actions">
          <button type="button" className="admset-btn-secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className={danger ? 'admset-btn-danger' : 'admset-btn'}
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? 'Saving...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function CardTitle({ icon: Icon, title, subtitle, children }) {
  return (
    <div className="admset-card-head">
      <span className="admset-card-icon">
        <Icon size={18} />
      </span>
      <div className="admset-card-head-text">
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

// Bar at the bottom of a card: "unsaved changes" with Discard,
// or a disabled Save button when nothing has changed yet
function SaveBar({ dirty, saving, onDiscard, onSave, saveLabel = 'Save Changes' }) {
  return (
    <div className={`admset-save-bar ${dirty ? 'dirty' : ''}`}>
      <p className="admset-save-status">
        {dirty ? (
          <>
            <span className="admset-save-dot" />
            You have unsaved changes
          </>
        ) : (
          <>
            <Check size={15} />
            Everything is up to date
          </>
        )}
      </p>
      <div className="admset-save-actions">
        {dirty && (
          <button type="button" className="admset-btn-secondary" onClick={onDiscard} disabled={saving}>
            Discard
          </button>
        )}
        <button type="button" className="admset-btn" onClick={onSave} disabled={!dirty || saving}>
          {saving ? 'Saving...' : saveLabel}
        </button>
      </div>
    </div>
  );
}

function IconInput({ id, icon: Icon, error, ...inputProps }) {
  return (
    <div className={`admset-input-wrap ${error ? 'has-error' : ''}`}>
      <Icon size={16} />
      <input id={id} {...inputProps} />
    </div>
  );
}

function Notice({ tone, icon: Icon, children, className = '' }) {
  return (
    <p className={`admset-notice admset-notice-${tone} ${className}`}>
      <Icon size={15} />
      <span>{children}</span>
    </p>
  );
}

/* ================= Profile ================= */

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
    if (form.email && !/^\S+@\S+\.\S+$/.test(form.email.trim())) errors.email = 'Please enter a valid email address.';
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
      showToast('Your profile has been updated.');
    } catch (err) {
      setError(getServerErrorMessage(err, 'Something went wrong saving your changes. Please try again.'));
    } finally {
      setSaving(false);
      setShowConfirm(false);
    }
  }

  const initials = (form.fullName || 'AD').slice(0, 2).toUpperCase();
  const displayedPicture = picturePreview || pictureUrl;

  return (
    <div className="admset-card">
      <CardTitle icon={User} title="Admin Profile" subtitle="Your name and contact details." />

      <div className="admset-photo">
        <div className="admset-photo-avatar">
          <Avatar picture={displayedPicture} initials={initials} size="xl" />
          <button
            type="button"
            className="admset-photo-badge"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Change photo"
          >
            <Camera size={14} />
          </button>
        </div>
        <div className="admset-photo-text">
          <p className="admset-photo-title">Profile Photo</p>
          <p className="admset-photo-sub">JPG or PNG, up to {MAX_PHOTO_SIZE_MB} MB</p>
          <button type="button" className="admset-btn-outline" onClick={() => fileInputRef.current?.click()}>
            <Upload size={15} />
            Upload new photo
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handlePictureChange}
          className="admset-file-input"
        />
      </div>

      {pictureFile && !pictureError && (
        <Notice tone="gold" icon={Camera}>
          New photo selected. Click <strong>Save Changes</strong> to upload it.
        </Notice>
      )}
      {pictureError && (
        <Notice tone="red" icon={AlertCircle}>
          {pictureError}
        </Notice>
      )}

      <p className="admset-group-label">Contact Details</p>
      <div className="admset-grid">
        <div className="admset-field">
          <label htmlFor="admset-name">Full Name</label>
          <IconInput
            id="admset-name"
            icon={User}
            value={form.fullName}
            error={fieldErrors.fullName}
            onChange={(e) => updateField('fullName', e.target.value)}
          />
          {fieldErrors.fullName && <p className="admset-field-error">{fieldErrors.fullName}</p>}
        </div>
        <div className="admset-field">
          <label htmlFor="admset-email">Email Address</label>
          <IconInput
            id="admset-email"
            icon={Mail}
            type="email"
            placeholder="name@example.com"
            value={form.email}
            error={fieldErrors.email}
            onChange={(e) => updateField('email', e.target.value)}
          />
          {fieldErrors.email && <p className="admset-field-error">{fieldErrors.email}</p>}
        </div>
        <div className="admset-field">
          <label htmlFor="admset-phone">Phone Number</label>
          <IconInput
            id="admset-phone"
            icon={Phone}
            type="tel"
            inputMode="numeric"
            maxLength={11}
            placeholder="09123456789"
            value={form.phone}
            error={fieldErrors.phone}
            onChange={handlePhoneChange}
          />
          {phoneWarning && <p className="admset-field-error">{phoneWarning}</p>}
          {!phoneWarning && fieldErrors.phone && <p className="admset-field-error">{fieldErrors.phone}</p>}
        </div>
        <div className="admset-field">
          <label htmlFor="admset-address">Home Address</label>
          <IconInput
            id="admset-address"
            icon={MapPin}
            placeholder="Street, city, province"
            value={form.address}
            onChange={(e) => updateField('address', e.target.value)}
          />
        </div>
      </div>

      {error && (
        <Notice tone="red" icon={AlertCircle} className="admset-notice-top">
          {error}
        </Notice>
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

/* ================= Notifications ================= */

function Toggle({ checked, onClick, disabled = false, label }) {
  return (
    <button
      type="button"
      className={`admset-toggle ${checked ? 'on' : ''}`}
      onClick={onClick}
      aria-pressed={checked}
      aria-label={label}
      disabled={disabled}
    >
      <span className="admset-toggle-dot" />
    </button>
  );
}

function ToggleRow({ icon: Icon, tone, title, sub, checked, onClick }) {
  return (
    <div className="admset-toggle-row">
      <span className={`admset-toggle-icon tone-${tone}`}>
        <Icon size={17} />
      </span>
      <div className="admset-toggle-text">
        <p className="admset-toggle-title">{title}</p>
        <p className="admset-toggle-sub">{sub}</p>
      </div>
      <Toggle checked={checked} onClick={onClick} label={title} />
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
    <div className="admset-card">
      <CardTitle icon={Bell} title="Notification Preferences" subtitle="Choose how and when we contact you." />

      <p className="admset-group-label">Admin Alerts</p>
      <div className="admset-toggle-group">
        <ToggleRow
          icon={ShieldCheck}
          tone="gold"
          title="New Requests"
          sub="When a ticket reaches Admin Review and needs your approval"
          checked={prefs.notify_request_approval}
          onClick={() => toggle('notify_request_approval')}
        />
        <ToggleRow
          icon={UserCog}
          tone="green"
          title="Worker Activity"
          sub="When a Partner Installer account changes"
          checked={prefs.notify_request_rejection}
          onClick={() => toggle('notify_request_rejection')}
        />
        <ToggleRow
          icon={Megaphone}
          tone="navy"
          title="System Announcements"
          sub="General updates from Glomax Solar Enterprises"
          checked={prefs.notify_promotions}
          onClick={() => toggle('notify_promotions')}
        />
      </div>

      <p className="admset-group-label">Channels</p>
      <div className="admset-toggle-group">
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
        <Notice tone="red" icon={AlertCircle} className="admset-notice-top">
          {error}
        </Notice>
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

/* ================= Security ================= */

function PasswordField({ id, label, placeholder, value, onChange }) {
  const [show, setShow] = useState(false);
  return (
    <div className="admset-field">
      <label htmlFor={id}>{label}</label>
      <div className="admset-input-wrap">
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
          className="admset-password-toggle"
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

function SecurityTab({ showToast }) {
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);

  const rulesPassed = PASSWORD_RULES.filter((rule) => rule.test(form.next)).length;
  const strength = form.next ? Math.min(4, rulesPassed + (form.next.length >= 12 ? 1 : 0)) : 0;
  const passwordsMatch = form.confirm.length > 0 && form.next === form.confirm;

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError('');
  }

  function handleSaveClick() {
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
    setShowConfirm(true);
  }

  async function performSave() {
    setSaving(true);
    setError('');
    try {
      await apiClient.post('/accounts/change-password/', {
        current_password: form.current,
        new_password: form.next,
      });
      setForm({ current: '', next: '', confirm: '' });
      showToast('Your password has been updated.');
    } catch (err) {
      setError(getServerErrorMessage(err, 'Could not update password. Please try again.'));
    } finally {
      setSaving(false);
      setShowConfirm(false);
    }
  }

  return (
    <div className="admset-security">
      <div className="admset-card">
        <CardTitle icon={KeyRound} title="Change Password" subtitle="Use a strong password you don't use anywhere else." />

        <PasswordField
          id="admset-current"
          label="Current Password"
          placeholder="Enter your current password"
          value={form.current}
          onChange={(e) => updateField('current', e.target.value)}
        />

        <div className="admset-grid admset-grid-password">
          <div>
            <PasswordField
              id="admset-new"
              label="New Password"
              placeholder="At least 8 characters"
              value={form.next}
              onChange={(e) => updateField('next', e.target.value)}
            />
            {form.next && (
              <div className="admset-strength">
                <div className="admset-strength-bar">
                  {[1, 2, 3, 4].map((n) => (
                    <span key={n} className={`admset-strength-seg ${n <= strength ? `lvl-${strength}` : ''}`} />
                  ))}
                </div>
                <span className={`admset-strength-label lvl-${strength}`}>{STRENGTH_LABELS[strength]}</span>
              </div>
            )}
          </div>
          <div>
            <PasswordField
              id="admset-confirm"
              label="Confirm New Password"
              placeholder="Type it again"
              value={form.confirm}
              onChange={(e) => updateField('confirm', e.target.value)}
            />
            {form.confirm && (
              <p className={`admset-match ${passwordsMatch ? 'ok' : 'bad'}`}>
                {passwordsMatch ? <Check size={14} /> : <X size={14} />}
                {passwordsMatch ? 'Passwords match' : "Passwords don't match"}
              </p>
            )}
          </div>
        </div>

        <ul className="admset-rules">
          {PASSWORD_RULES.map((rule) => {
            const passed = rule.test(form.next);
            return (
              <li key={rule.key} className={passed ? 'met' : ''}>
                <span className="admset-rule-icon">{passed ? <Check size={12} /> : <X size={12} />}</span>
                {rule.label}
              </li>
            );
          })}
        </ul>

        {error && (
          <Notice tone="red" icon={AlertCircle} className="admset-notice-top">
            {error}
          </Notice>
        )}

        <div className="admset-save-bar">
          <p className="admset-save-status">
            <Shield size={15} />
            You'll use your new password the next time you sign in.
          </p>
          <div className="admset-save-actions">
            <button type="button" className="admset-btn" onClick={handleSaveClick} disabled={saving}>
              <KeyRound size={15} />
              Update Password
            </button>
          </div>
        </div>

        {showConfirm && (
          <ConfirmModal
            title="Update Password?"
            message="You'll need to use your new password the next time you sign in. Are you sure you want to continue?"
            confirmLabel="Update Password"
            busy={saving}
            onCancel={() => setShowConfirm(false)}
            onConfirm={performSave}
          />
        )}
      </div>

      <div className="admset-tip">
        <span className="admset-tip-icon">
          <ShieldCheck size={18} />
        </span>
        <div>
          <p className="admset-tip-title">Keep the admin account safe</p>
          <p className="admset-tip-text">
            This account can approve tickets and manage workers. Never share your password with anyone, including
            other staff.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ================= SMS Templates, System, FAQs ================= */
/* All three are a simple list with Add, Edit and Delete.
   One shared component does the work; each tab only says what is different. */

function FormModal({ title, icon: Icon, saving, error, onClose, onSubmit, children }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape' && !saving) onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [saving, onClose]);

  return (
    <div className="admset-modal-overlay" onClick={() => !saving && onClose()}>
      <div className="admset-modal admset-form-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="admset-form-head">
          <span className="admset-card-icon">
            <Icon size={18} />
          </span>
          <h3>{title}</h3>
          <button type="button" className="admset-modal-close" onClick={onClose} disabled={saving} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={onSubmit}>
          <div className="admset-form-body">{children}</div>

          {error && (
            <Notice tone="red" icon={AlertCircle} className="admset-notice-top">
              {error}
            </Notice>
          )}

          <div className="admset-modal-actions admset-form-actions">
            <button type="button" className="admset-btn-secondary" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="admset-btn" disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TextField({ label, hint, textarea, ...props }) {
  return (
    <div className="admset-field">
      <label>{label}</label>
      {textarea ? (
        <textarea className="admset-textarea" {...props} />
      ) : (
        <div className="admset-input-wrap admset-input-plain">
          <input {...props} />
        </div>
      )}
      {hint && <p className="admset-field-hint">{hint}</p>}
    </div>
  );
}

function SwitchField({ title, sub, checked, onClick }) {
  return (
    <div className="admset-switch-field">
      <div>
        <p className="admset-toggle-title">{title}</p>
        <p className="admset-toggle-sub">{sub}</p>
      </div>
      <Toggle checked={checked} onClick={onClick} label={title} />
    </div>
  );
}

function ConfigTab({ setup }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(setup.emptyForm([]));
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    try {
      const data = await setup.load();
      setItems(Array.isArray(data) ? data : []);
      setError('');
    } catch {
      setError(setup.loadError);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openAdd() {
    setEditing(null);
    setForm(setup.emptyForm(items));
    setFormError('');
    setShowModal(true);
  }

  function openEdit(item) {
    setEditing(item);
    setForm(setup.toForm(item));
    setFormError('');
    setShowModal(true);
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      if (editing) {
        await setup.update(editing.id, form);
      } else {
        await setup.create(form);
      }
      setShowModal(false);
      load();
    } catch (err) {
      setFormError(getServerErrorMessage(err, setup.saveError));
    } finally {
      setSaving(false);
    }
  }

  function requestDelete(item) {
    setDeleteError('');
    setDeleteTarget(item);
  }

  async function confirmDelete() {
    setDeleting(true);
    try {
      await setup.remove(deleteTarget.id);
      await load();
      setDeleteError('');
    } catch {
      setDeleteError(`Could not delete "${setup.nameOf(deleteTarget)}". Please try again.`);
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  const Icon = setup.icon;

  return (
    <div className="admset-card">
      <CardTitle icon={Icon} title={setup.title} subtitle={setup.subtitle}>
        {!loading && !error && (
          <button type="button" className="admset-btn admset-add-btn" onClick={openAdd}>
            <Plus size={16} />
            {setup.addLabel}
          </button>
        )}
      </CardTitle>

      {setup.note && (
        <Notice tone="navy" icon={Info} className="admset-notice-under-head">
          {setup.note}
        </Notice>
      )}

      {loading && (
        <div className="admset-list">
          {[1, 2, 3].map((n) => (
            <span key={n} className="admset-skel admset-skel-item" />
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="admset-empty">
          <span className="admset-empty-badge red">
            <AlertCircle size={24} />
          </span>
          <p className="admset-empty-title">Something went wrong</p>
          <p className="admset-empty-hint">{error}</p>
          <button
            type="button"
            className="admset-btn"
            onClick={() => {
              setLoading(true);
              load();
            }}
          >
            Try again
          </button>
        </div>
      )}

      {!loading && !error && (
        <>
          {deleteError && (
            <Notice tone="red" icon={AlertCircle} className="admset-notice-under-head">
              {deleteError}
            </Notice>
          )}

          {items.length === 0 ? (
            <div className="admset-empty">
              <span className="admset-empty-badge">
                <Inbox size={24} />
              </span>
              <p className="admset-empty-title">{setup.emptyTitle}</p>
              <p className="admset-empty-hint">{setup.emptyHint}</p>
              <button type="button" className="admset-btn-outline" onClick={openAdd}>
                <Plus size={15} />
                {setup.addLabel}
              </button>
            </div>
          ) : (
            <div className="admset-list">
              {items.map((item) => {
                const tag = setup.tagOf ? setup.tagOf(item) : null;
                return (
                  <div className="admset-item" key={item.id}>
                    <div className="admset-item-main">
                      <p className="admset-item-title">
                        <span className={setup.monoTitle ? 'admset-mono' : ''}>{setup.titleOf(item)}</span>
                        {tag && <span className={`admset-tag ${tag.on ? 'on' : 'off'}`}>{tag.label}</span>}
                      </p>
                      {setup.bodyOf(item) && <p className="admset-item-body">{setup.bodyOf(item)}</p>}
                      {setup.metaOf && setup.metaOf(item) && (
                        <p className="admset-item-meta">{setup.metaOf(item)}</p>
                      )}
                    </div>
                    <div className="admset-item-actions">
                      <button
                        type="button"
                        className="admset-icon-btn"
                        onClick={() => openEdit(item)}
                        aria-label={`Edit ${setup.nameOf(item)}`}
                        title="Edit"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        className="admset-icon-btn danger"
                        onClick={() => requestDelete(item)}
                        aria-label={`Delete ${setup.nameOf(item)}`}
                        title="Delete"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {showModal && (
        <FormModal
          title={editing ? setup.editTitle : setup.addTitle}
          icon={Icon}
          saving={saving}
          error={formError}
          onClose={() => setShowModal(false)}
          onSubmit={handleSave}
        >
          {setup.renderFields(form, (patch) => setForm((p) => ({ ...p, ...patch })))}
        </FormModal>
      )}

      {deleteTarget && (
        <ConfirmModal
          title={setup.deleteTitle}
          message={`"${setup.nameOf(deleteTarget)}" will be permanently deleted. This can't be undone.`}
          confirmLabel="Delete"
          danger
          busy={deleting}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}

const SMS_SETUP = {
  icon: MessageSquare,
  title: 'SMS Templates',
  subtitle: 'Reusable text messages for customer updates.',
  note: "SMS sending isn't set up yet, so these templates aren't sent to anyone for now.",
  addLabel: 'Add Template',
  addTitle: 'Add Template',
  editTitle: 'Edit Template',
  deleteTitle: 'Delete this template?',
  emptyTitle: 'No SMS templates yet',
  emptyHint: 'Add a template so you can reuse the same message.',
  loadError: 'Could not load SMS templates.',
  saveError: 'Could not save template.',
  load: getSmsTemplates,
  create: createSmsTemplate,
  update: updateSmsTemplate,
  remove: deleteSmsTemplate,
  emptyForm: () => ({ name: '', message: '', is_active: true }),
  toForm: (item) => ({ name: item.name, message: item.message, is_active: item.is_active }),
  nameOf: (item) => item.name,
  titleOf: (item) => item.name,
  tagOf: (item) => ({ on: item.is_active, label: item.is_active ? 'Active' : 'Inactive' }),
  bodyOf: (item) => item.message,
  renderFields: (form, set) => (
    <>
      <TextField
        label="Name"
        value={form.name}
        onChange={(e) => set({ name: e.target.value })}
        placeholder="e.g. Request approved"
        required
      />
      <TextField
        label="Message"
        textarea
        rows={4}
        value={form.message}
        onChange={(e) => set({ message: e.target.value })}
        placeholder="e.g. Hi {customer_name}, your request {ticket_number} is now {status}."
        hint={`${form.message.length} characters. Words in { } are filled in for each customer.`}
        required
      />
      <SwitchField
        title="Active"
        sub="Only active templates can be used"
        checked={form.is_active}
        onClick={() => set({ is_active: !form.is_active })}
      />
    </>
  ),
};

const SYSTEM_SETUP = {
  icon: SlidersHorizontal,
  title: 'System Settings',
  subtitle: 'Simple key and value settings you can define and update.',
  addLabel: 'Add Setting',
  addTitle: 'Add Setting',
  editTitle: 'Edit Setting',
  deleteTitle: 'Delete this setting?',
  emptyTitle: 'No system settings yet',
  emptyHint: 'Add a setting, for example a support email.',
  loadError: 'Could not load system settings.',
  saveError: 'Could not save setting.',
  load: getSystemSettings,
  create: createSystemSetting,
  update: updateSystemSetting,
  remove: deleteSystemSetting,
  monoTitle: true,
  emptyForm: () => ({ key: '', value: '', description: '' }),
  toForm: (item) => ({ key: item.key, value: item.value, description: item.description }),
  nameOf: (item) => item.key,
  titleOf: (item) => item.key,
  bodyOf: (item) => item.value || '(no value)',
  metaOf: (item) => item.description,
  renderFields: (form, set) => (
    <>
      <TextField
        label="Key"
        value={form.key}
        onChange={(e) => set({ key: e.target.value })}
        placeholder="e.g. support_email"
        required
      />
      <TextField
        label="Value"
        value={form.value}
        onChange={(e) => set({ value: e.target.value })}
        placeholder="e.g. support@glomax.ph"
      />
      <TextField
        label="Description (optional)"
        value={form.description}
        onChange={(e) => set({ description: e.target.value })}
        placeholder="What this setting is for"
      />
    </>
  ),
};

const FAQ_SETUP = {
  icon: HelpCircle,
  title: 'FAQs',
  subtitle: 'Frequently asked questions shown to customers.',
  addLabel: 'Add FAQ',
  addTitle: 'Add FAQ',
  editTitle: 'Edit FAQ',
  deleteTitle: 'Delete this FAQ?',
  emptyTitle: 'No FAQs yet',
  emptyHint: 'Add common questions so customers can find answers quickly.',
  loadError: 'Could not load FAQs.',
  saveError: 'Could not save FAQ.',
  load: getFaqs,
  create: createFaq,
  update: updateFaq,
  remove: deleteFaq,
  emptyForm: (items) => ({ question: '', answer: '', order: items.length, is_published: true }),
  toForm: (item) => ({
    question: item.question,
    answer: item.answer,
    order: item.order,
    is_published: item.is_published,
  }),
  nameOf: (item) => item.question,
  titleOf: (item) => item.question,
  tagOf: (item) => ({ on: item.is_published, label: item.is_published ? 'Published' : 'Draft' }),
  bodyOf: (item) => item.answer,
  metaOf: (item) => `Display order: ${item.order}`,
  renderFields: (form, set) => (
    <>
      <TextField
        label="Question"
        value={form.question}
        onChange={(e) => set({ question: e.target.value })}
        placeholder="e.g. How long does installation take?"
        required
      />
      <TextField
        label="Answer"
        textarea
        rows={4}
        value={form.answer}
        onChange={(e) => set({ answer: e.target.value })}
        required
      />
      <TextField
        label="Display Order"
        type="number"
        value={form.order}
        onChange={(e) => set({ order: Number(e.target.value) })}
        hint="Lower numbers show first."
      />
      <SwitchField
        title="Published"
        sub="Customers can only see published FAQs"
        checked={form.is_published}
        onClick={() => set({ is_published: !form.is_published })}
      />
    </>
  ),
};

/* ================= Page ================= */

function SettingsSkeleton() {
  return (
    <div className="admset-layout">
      <div className="admset-side">
        <span className="admset-skel admset-skel-user" />
        <span className="admset-skel admset-skel-tabs" />
      </div>
      <div className="admset-content">
        <span className="admset-skel admset-skel-card" />
      </div>
    </div>
  );
}

export default function AdminSettingsPage() {
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

  const initials = (me?.username || 'AD').slice(0, 2).toUpperCase();
  const picture = toMediaUrl(me?.profile_picture);
  let lastGroup = null;

  return (
    <AdminLayout pageTitle="Settings" pageSubtitle="Manage your admin account and system preferences">
      <div className="admset-page">
        {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}

        {loading && <SettingsSkeleton />}

        {!loading && error && (
          <div className="admset-card admset-error-card">
            <span className="admset-error-badge">
              <AlertCircle size={28} />
            </span>
            <p className="admset-error-title">Something went wrong</p>
            <p className="admset-error-hint">{error}</p>
            <button type="button" className="admset-btn" onClick={load}>
              Try again
            </button>
          </div>
        )}

        {!loading && !error && me && (
          <div className="admset-layout">
            <aside className="admset-side">
              <div className="admset-user">
                <Avatar picture={picture} initials={initials} size="lg" />
                <div className="admset-user-text">
                  <p className="admset-user-name">{me.username}</p>
                  <p className="admset-user-email">{me.email || 'No email yet'}</p>
                  <span className="admset-user-role">Administrator</span>
                </div>
              </div>

              <nav className="admset-tabs" aria-label="Settings sections">
                {TABS.map(({ key, group, label, short, desc, icon: Icon }) => {
                  const heading = group !== lastGroup ? group : null;
                  lastGroup = group;
                  return (
                    <div key={key} className="admset-tab-wrap">
                      {heading && <p className="admset-tab-group">{heading}</p>}
                      <button
                        type="button"
                        className={`admset-tab ${activeTab === key ? 'active' : ''}`}
                        onClick={() => setActiveTab(key)}
                        aria-current={activeTab === key ? 'page' : undefined}
                      >
                        <span className="admset-tab-icon">
                          <Icon size={17} />
                        </span>
                        <span className="admset-tab-text">
                          <span className="admset-tab-label">
                            <span className="admset-tab-long">{label}</span>
                            <span className="admset-tab-short">{short || label}</span>
                          </span>
                          <span className="admset-tab-desc">{desc}</span>
                        </span>
                      </button>
                    </div>
                  );
                })}
              </nav>
            </aside>

            <div className="admset-content">
              {activeTab === 'profile' && <ProfileTab me={me} onSaved={setMe} showToast={showToast} />}
              {activeTab === 'notifications' && <NotificationsTab me={me} onSaved={setMe} showToast={showToast} />}
              {activeTab === 'security' && <SecurityTab showToast={showToast} />}
              {activeTab === 'sms' && <ConfigTab key="sms" setup={SMS_SETUP} />}
              {activeTab === 'system' && <ConfigTab key="system" setup={SYSTEM_SETUP} />}
              {activeTab === 'faqs' && <ConfigTab key="faqs" setup={FAQ_SETUP} />}
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}