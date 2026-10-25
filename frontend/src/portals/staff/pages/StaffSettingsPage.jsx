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
  Phone,
  MapPin,
  MessageSquare,
  CheckCircle2,
  ClipboardCheck,
  UserPlus,
  Megaphone,
  Lock,
  KeyRound,
  AlertCircle,
  Upload,
  ShieldCheck,
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
import StaffLayout from '../components/StaffLayout';
import '../styles/staff-settings.css';

const TABS = [
  { key: 'profile', label: 'My Profile', desc: 'Name, email, phone and address', icon: User },
  { key: 'notifications', label: 'Notifications', desc: 'Choose what you get notified about', icon: Bell },
  { key: 'security', label: 'Security', desc: 'Change your password', icon: Shield },
];

// Philippine mobile number: 11 digits starting with 09
const PH_MOBILE = /^09\d{9}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const STRENGTH_LABELS = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong'];

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
        className={`stset-avatar stset-avatar-${size}`}
        onError={() => setBroken(true)}
      />
    );
  }
  return <div className={`stset-avatar stset-avatar-${size} stset-avatar-initials`}>{initials}</div>;
}

function Toast({ message, type = 'success', onDone }) {
  useEffect(() => {
    const timer = setTimeout(onDone, 3500);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <div className={`stset-toast ${type}`}>
      {type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
      {message}
    </div>
  );
}

function ConfirmModal({ title, message, confirmLabel, busy, onCancel, onConfirm }) {
  return (
    <div className="stset-modal-overlay" onClick={() => !busy && onCancel()}>
      <div className="stset-modal" onClick={(e) => e.stopPropagation()}>
        <div className="stset-modal-icon">
          <ShieldCheck size={22} />
        </div>
        <h3>{title}</h3>
        <p>{message}</p>
        <div className="stset-modal-actions">
          <button type="button" className="stset-btn-secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="stset-btn" disabled={busy} onClick={onConfirm}>
            {busy ? 'Saving...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function CardTitle({ icon: Icon, title, subtitle }) {
  return (
    <div className="stset-card-head">
      <span className="stset-card-icon">
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
    <div className={`stset-save-bar ${dirty ? 'dirty' : ''}`}>
      <p className="stset-save-status">
        {dirty ? (
          <>
            <span className="stset-save-dot" />
            You have unsaved changes
          </>
        ) : (
          <>
            <Check size={15} />
            Everything is up to date
          </>
        )}
      </p>
      <div className="stset-save-actions">
        {dirty && (
          <button type="button" className="stset-btn-secondary" onClick={onDiscard} disabled={saving}>
            Discard
          </button>
        )}
        <button type="button" className="stset-btn" onClick={onSave} disabled={!dirty || saving}>
          {saving ? 'Saving...' : saveLabel}
        </button>
      </div>
    </div>
  );
}

function IconInput({ id, icon: Icon, error, ...inputProps }) {
  return (
    <div className={`stset-input-wrap ${error ? 'has-error' : ''}`}>
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
      const savedUrl = toMediaUrl(res.data.profile_picture);

      // The Staff header reads these, so it updates right away
      localStorage.setItem('username', next.fullName);
      if (savedUrl) {
        localStorage.setItem('profilePicture', savedUrl);
      } else {
        localStorage.removeItem('profilePicture');
      }

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

  const initials = (form.fullName || 'ST').slice(0, 2).toUpperCase();
  const displayedPicture = picturePreview || pictureUrl;

  return (
    <div className="stset-card">
      <CardTitle icon={User} title="Personal Information" subtitle="This is how the team and customers see you." />

      <div className="stset-photo">
        <div className="stset-photo-avatar">
          <Avatar picture={displayedPicture} initials={initials} size="xl" />
          <button
            type="button"
            className="stset-photo-badge"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Change photo"
          >
            <Camera size={14} />
          </button>
        </div>
        <div className="stset-photo-text">
          <p className="stset-photo-title">Profile Photo</p>
          <p className="stset-photo-sub">JPG or PNG, up to {MAX_PHOTO_SIZE_MB} MB</p>
          <button type="button" className="stset-btn-outline" onClick={() => fileInputRef.current?.click()}>
            <Upload size={15} />
            Upload new photo
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handlePictureChange}
          className="stset-file-input"
        />
      </div>

      {pictureFile && !pictureError && (
        <p className="stset-notice stset-notice-amber">
          <Camera size={15} />
          New photo selected. Click <strong>Save Changes</strong> to upload it.
        </p>
      )}
      {pictureError && (
        <p className="stset-notice stset-notice-red">
          <AlertCircle size={15} />
          {pictureError}
        </p>
      )}

      <div className="stset-grid">
        <div className="stset-field">
          <label htmlFor="stset-name">Full Name</label>
          <IconInput
            id="stset-name"
            icon={User}
            value={form.fullName}
            error={fieldErrors.fullName}
            onChange={(e) => updateField('fullName', e.target.value)}
          />
          {fieldErrors.fullName && <p className="stset-field-error">{fieldErrors.fullName}</p>}
        </div>
        <div className="stset-field">
          <label htmlFor="stset-email">Email Address</label>
          <IconInput
            id="stset-email"
            icon={Mail}
            type="email"
            value={form.email}
            error={fieldErrors.email}
            onChange={(e) => updateField('email', e.target.value)}
          />
          {fieldErrors.email && <p className="stset-field-error">{fieldErrors.email}</p>}
        </div>
        <div className="stset-field">
          <label htmlFor="stset-phone">Phone Number</label>
          <IconInput
            id="stset-phone"
            icon={Phone}
            type="tel"
            inputMode="numeric"
            maxLength={11}
            placeholder="09123456789"
            value={form.phone}
            error={fieldErrors.phone}
            onChange={handlePhoneChange}
          />
          {phoneWarning && <p className="stset-field-error">{phoneWarning}</p>}
          {!phoneWarning && fieldErrors.phone && <p className="stset-field-error">{fieldErrors.phone}</p>}
        </div>
        <div className="stset-field">
          <label htmlFor="stset-address">Home Address</label>
          <IconInput
            id="stset-address"
            icon={MapPin}
            value={form.address}
            onChange={(e) => updateField('address', e.target.value)}
          />
        </div>
      </div>

      {error && (
        <p className="stset-notice stset-notice-red stset-notice-bottom">
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
      className={`stset-toggle ${checked ? 'on' : ''}`}
      onClick={onClick}
      aria-pressed={checked}
      disabled={disabled}
    >
      <span className="stset-toggle-dot" />
    </button>
  );
}

function ToggleRow({ icon: Icon, tone, title, sub, checked, onClick, disabled, tag }) {
  return (
    <div className={`stset-toggle-row ${disabled ? 'disabled' : ''}`}>
      <span className={`stset-toggle-icon tone-${tone}`}>
        <Icon size={17} />
      </span>
      <div className="stset-toggle-text">
        <p className="stset-toggle-title">
          {title}
          {tag && <span className="stset-tag">{tag}</span>}
        </p>
        <p className="stset-toggle-sub">{sub}</p>
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
    <div className="stset-card">
      <CardTitle icon={Bell} title="Notification Preferences" subtitle="Choose how and when we contact you." />

      <p className="stset-group-label">Channels</p>
      <div className="stset-toggle-group">
        <ToggleRow
          icon={Mail}
          tone="navy"
          title="Email Updates"
          sub="Get ticket updates by email"
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

      <p className="stset-group-label">Ticket Notifications</p>
      <div className="stset-toggle-group">
        <ToggleRow
          icon={UserPlus}
          tone="amber"
          title="New Ticket Assignments"
          sub="When a new request needs your attention"
          checked={prefs.notify_request_approval}
          onClick={() => toggle('notify_request_approval')}
        />
        <ToggleRow
          icon={ClipboardCheck}
          tone="green"
          title="Assessment Submissions"
          sub="When a Partner Installer submits an assessment"
          checked={prefs.notify_request_rejection}
          onClick={() => toggle('notify_request_rejection')}
        />
        <ToggleRow
          icon={Megaphone}
          tone="blue"
          title="System Announcements"
          sub="General updates from Glomax Solar Enterprises"
          checked={prefs.notify_promotions}
          onClick={() => toggle('notify_promotions')}
        />
      </div>

      {error && (
        <p className="stset-notice stset-notice-red stset-notice-bottom">
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
    <div className="stset-field">
      <label htmlFor={id}>{label}</label>
      <div className="stset-input-wrap">
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
          className="stset-password-toggle"
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
  const hasInput = Boolean(form.current || form.next || form.confirm);

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
      setError(getServerErrorMessage(err, 'Could not update your password. Please try again.'));
    } finally {
      setSaving(false);
      setShowConfirm(false);
    }
  }

  return (
    <div className="stset-security">
      <div className="stset-card">
        <CardTitle icon={KeyRound} title="Change Password" subtitle="Use a strong password you don't use anywhere else." />

        <div className="stset-field stset-field-block">
          <PasswordField
            id="stset-current"
            label="Current Password"
            placeholder="Enter your current password"
            value={form.current}
            onChange={(e) => updateField('current', e.target.value)}
          />
        </div>

        <div className="stset-grid stset-grid-password">
          <div>
            <PasswordField
              id="stset-new"
              label="New Password"
              placeholder="At least 8 characters"
              value={form.next}
              onChange={(e) => updateField('next', e.target.value)}
            />
            {form.next && (
              <div className="stset-strength">
                <div className="stset-strength-bar">
                  {[1, 2, 3, 4].map((n) => (
                    <span key={n} className={`stset-strength-seg ${n <= strength ? `lvl-${strength}` : ''}`} />
                  ))}
                </div>
                <span className={`stset-strength-label lvl-${strength}`}>{STRENGTH_LABELS[strength]}</span>
              </div>
            )}
          </div>
          <div>
            <PasswordField
              id="stset-confirm"
              label="Confirm New Password"
              placeholder="Type it again"
              value={form.confirm}
              onChange={(e) => updateField('confirm', e.target.value)}
            />
            {form.confirm && (
              <p className={`stset-match ${passwordsMatch ? 'ok' : 'bad'}`}>
                {passwordsMatch ? <Check size={14} /> : <X size={14} />}
                {passwordsMatch ? 'Passwords match' : "Passwords don't match"}
              </p>
            )}
          </div>
        </div>

        <ul className="stset-rules">
          {PASSWORD_RULES.map((rule) => {
            const passed = rule.test(form.next);
            return (
              <li key={rule.key} className={passed ? 'met' : ''}>
                <span className="stset-rule-icon">{passed ? <Check size={12} /> : <X size={12} />}</span>
                {rule.label}
              </li>
            );
          })}
        </ul>

        {error && (
          <p className="stset-notice stset-notice-red stset-notice-bottom">
            <AlertCircle size={15} />
            {error}
          </p>
        )}

        <div className="stset-save-bar">
          <p className="stset-save-status">
            <Shield size={15} />
            You'll use your new password the next time you sign in.
          </p>
          <div className="stset-save-actions">
            {hasInput && (
              <button
                type="button"
                className="stset-btn-secondary"
                onClick={() => {
                  setForm({ current: '', next: '', confirm: '' });
                  setError('');
                }}
                disabled={saving}
              >
                Clear
              </button>
            )}
            <button type="button" className="stset-btn" onClick={handleSaveClick} disabled={saving || !hasInput}>
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

      <div className="stset-tip">
        <span className="stset-tip-icon">
          <ShieldCheck size={18} />
        </span>
        <div>
          <p className="stset-tip-title">Keep your account safe</p>
          <p className="stset-tip-text">
            Never share your password with anyone, including co-workers. Staff accounts can see
            customer details, so keep yours private and sign out on shared computers.
          </p>
        </div>
      </div>
    </div>
  );
}

function SettingsSkeleton() {
  return (
    <div className="stset-layout">
      <div className="stset-side">
        <span className="stset-skel stset-skel-user" />
        <span className="stset-skel stset-skel-tabs" />
      </div>
      <div className="stset-content">
        <span className="stset-skel stset-skel-card" />
      </div>
    </div>
  );
}

export default function StaffSettingsPage() {
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

  const initials = (me?.username || 'ST').slice(0, 2).toUpperCase();
  const picture = toMediaUrl(me?.profile_picture);

  return (
    <StaffLayout pageTitle="Settings" pageSubtitle="Manage your account preferences">
      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}

      {loading && <SettingsSkeleton />}

      {!loading && error && (
        <div className="stset-card stset-error-card">
          <span className="stset-error-badge">
            <AlertCircle size={28} />
          </span>
          <p className="stset-error-title">Something went wrong</p>
          <p className="stset-error-hint">{error}</p>
          <button type="button" className="stset-btn" onClick={load}>
            Try again
          </button>
        </div>
      )}

      {!loading && !error && me && (
        <div className="stset-layout">
          <aside className="stset-side">
            <div className="stset-user">
              <Avatar picture={picture} initials={initials} size="lg" />
              <div className="stset-user-text">
                <p className="stset-user-name">{me.username}</p>
                <p className="stset-user-email">{me.email || 'No email yet'}</p>
                <span className="stset-user-role">Staff</span>
              </div>
            </div>

            <nav className="stset-tabs">
              {TABS.map(({ key, label, desc, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  className={`stset-tab ${activeTab === key ? 'active' : ''}`}
                  onClick={() => setActiveTab(key)}
                >
                  <span className="stset-tab-icon">
                    <Icon size={17} />
                  </span>
                  <span className="stset-tab-text">
                    <span className="stset-tab-label">{label}</span>
                    <span className="stset-tab-desc">{desc}</span>
                  </span>
                </button>
              ))}
            </nav>
          </aside>

          <div className="stset-content">
            {activeTab === 'profile' && <ProfileTab me={me} onSaved={setMe} showToast={showToast} />}
            {activeTab === 'notifications' && (
              <NotificationsTab me={me} onSaved={setMe} showToast={showToast} />
            )}
            {activeTab === 'security' && <SecurityTab showToast={showToast} />}
          </div>
        </div>
      )}
    </StaffLayout>
  );
}