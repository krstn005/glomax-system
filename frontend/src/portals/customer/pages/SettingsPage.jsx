import { useEffect, useState, useRef } from 'react';
import { Camera } from 'lucide-react';
import apiClient from '../../../api/client';
import { sanitizePhoneNumber } from '../../../utils/phone';
import CustomerLayout from '../components/CustomerLayout';
import '../styles/settings.css';

const TABS = ['My Profile', 'Notifications', 'Security'];

function Toggle({ checked, onClick }) {
  return (
    <button className={`set-toggle ${checked ? 'on' : ''}`} onClick={onClick}>
      <span className="set-toggle-dot" />
    </button>
  );
}

function Toast({ message, onDone }) {
  useEffect(() => {
    const timer = setTimeout(onDone, 3000);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <div className="set-toast">
      {message}
    </div>
  );
}

function ConfirmModal({ title, message, confirmLabel, busy, onCancel, onConfirm }) {
  return (
    <div className="set-modal-overlay" onClick={onCancel}>
      <div className="set-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <p>{message}</p>
        <div className="set-modal-actions">
          <button className="set-btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="set-btn" disabled={busy} onClick={onConfirm}>
            {busy ? 'Saving...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProfileTab() {
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', address: '' });
  const [pictureUrl, setPictureUrl] = useState(null);
  const [pictureFile, setPictureFile] = useState(null);
  const [picturePreview, setPicturePreview] = useState(null);
  const [phoneWarning, setPhoneWarning] = useState('');
  const fileInputRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    async function loadMe() {
      try {
        const res = await apiClient.get('/accounts/me/');
        setForm({
          fullName: res.data.username || '',
          email: res.data.email || '',
          phone: res.data.phone_number || '',
          address: res.data.address || '',
        });
        setPictureUrl(res.data.profile_picture || null);
      } catch {
        setError('Could not load your profile.');
      } finally {
        setLoading(false);
      }
    }
    loadMe();
  }, []);

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handlePhoneChange(e) {
    const { value, hadInvalidChar } = sanitizePhoneNumber(e.target.value);
    updateField('phone', value);
    setPhoneWarning(hadInvalidChar ? 'Phone Number can only contain numbers.' : '');
  }

  function handlePictureChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPictureFile(file);
    setPicturePreview(URL.createObjectURL(file));
  }

  async function performSave() {
    setSaving(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('username', form.fullName);
      formData.append('email', form.email);
      formData.append('phone_number', form.phone);
      formData.append('address', form.address);
      if (pictureFile) {
        formData.append('profile_picture', pictureFile);
      }

      const res = await apiClient.patch('/accounts/me/', formData);

      localStorage.setItem('username', form.fullName);
      setPictureUrl(res.data.profile_picture || null);
      setPictureFile(null);
      setPicturePreview(null);
      setSuccess(true);
      window.dispatchEvent(new Event('profile-picture-updated'));
    } catch {
      setError('Something went wrong saving your changes. Please try again.');
    } finally {
      setSaving(false);
      setShowConfirm(false);
    }
  }

  const initials = (form.fullName || 'CU').slice(0, 2).toUpperCase();
  const displayedPicture = picturePreview || pictureUrl;

  if (loading) return <p className="set-loading">Loading...</p>;

  return (
    <div className="set-card">
      {success && <Toast message="Changes saved successfully" onDone={() => setSuccess(false)} />}

      <h2>Personal Information</h2>

      <div className="set-photo-row">
        <button
          type="button"
          className="set-avatar-clickable"
          onClick={() => fileInputRef.current?.click()}
          title="Click to change your photo"
        >
          {displayedPicture ? (
            <img src={displayedPicture} alt="Profile" className="set-avatar-img" />
          ) : (
            <div className="set-avatar">{initials}</div>
          )}
          <span className="set-avatar-edit-badge">
            <Camera size={12} />
          </span>
        </button>
        <div>
          <p className="set-photo-title">Profile Photo</p>
          <p className="set-photo-hint">Click your photo to upload a new one</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handlePictureChange}
            style={{ display: 'none' }}
          />
        </div>
      </div>

      <div className="set-grid">
        <div className="set-field">
          <label>Full Name</label>
          <input value={form.fullName} onChange={(e) => updateField('fullName', e.target.value)} />
        </div>
        <div className="set-field">
          <label>Email Address</label>
          <input value={form.email} onChange={(e) => updateField('email', e.target.value)} />
        </div>
        <div className="set-field">
          <label>Phone Number</label>
          <input type="tel" inputMode="numeric" value={form.phone} onChange={handlePhoneChange} />
          {phoneWarning && <p className="set-field-warning">{phoneWarning}</p>}
        </div>
        <div className="set-field">
          <label>Home Address</label>
          <input value={form.address} onChange={(e) => updateField('address', e.target.value)} />
        </div>
      </div>

      <div className="set-footer">
        {error && <p className="set-error">{error}</p>}
        <button className="set-btn set-btn-right" onClick={() => setShowConfirm(true)}>
          Save Changes
        </button>
      </div>

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

function NotificationsTab() {
  const [prefs, setPrefs] = useState({
    notify_email_updates: true,
    notify_sms_updates: true,
    notify_request_approval: true,
    notify_request_rejection: true,
    notify_promotions: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    async function loadMe() {
      try {
        const res = await apiClient.get('/accounts/me/');
        setPrefs({
          notify_email_updates: res.data.notify_email_updates,
          notify_sms_updates: res.data.notify_sms_updates,
          notify_request_approval: res.data.notify_request_approval,
          notify_request_rejection: res.data.notify_request_rejection,
          notify_promotions: res.data.notify_promotions,
        });
      } catch {
        setError('Could not load your notification preferences.');
      } finally {
        setLoading(false);
      }
    }
    loadMe();
  }, []);

  function toggle(key) {
    setPrefs((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function performSave() {
    setSaving(true);
    setError('');
    try {
      await apiClient.patch('/accounts/me/', prefs);
      setSuccess(true);
    } catch {
      setError('Something went wrong saving your preferences. Please try again.');
    } finally {
      setSaving(false);
      setShowConfirm(false);
    }
  }

  if (loading) return <p className="set-loading">Loading...</p>;

  return (
    <div className="set-card">
      {success && <Toast message="Preferences saved successfully" onDone={() => setSuccess(false)} />}

      <h2>Notification Preferences</h2>

      <div className="set-toggle-row">
        <div>
          <p className="set-toggle-title">Email Updates</p>
          <p className="set-toggle-sub">Receive updates via email</p>
        </div>
        <Toggle checked={prefs.notify_email_updates} onClick={() => toggle('notify_email_updates')} />
      </div>
      <div className="set-toggle-row">
        <div>
          <p className="set-toggle-title">SMS Updates</p>
          <p className="set-toggle-sub">Receive updates via SMS</p>
        </div>
        <Toggle checked={prefs.notify_sms_updates} onClick={() => toggle('notify_sms_updates')} />
      </div>

      <p className="set-section-label">Request Notifications</p>

      <div className="set-toggle-row">
        <div>
          <p className="set-toggle-title">Request Approval</p>
          <p className="set-toggle-sub">Notify when your request is approved</p>
        </div>
        <Toggle checked={prefs.notify_request_approval} onClick={() => toggle('notify_request_approval')} />
      </div>
      <div className="set-toggle-row">
        <div>
          <p className="set-toggle-title">Request Rejection</p>
          <p className="set-toggle-sub">Notify when your request is rejected</p>
        </div>
        <Toggle checked={prefs.notify_request_rejection} onClick={() => toggle('notify_request_rejection')} />
      </div>
      <div className="set-toggle-row">
        <div>
          <p className="set-toggle-title">Promotions & Offers</p>
          <p className="set-toggle-sub">Receive special offers and promotions</p>
        </div>
        <Toggle checked={prefs.notify_promotions} onClick={() => toggle('notify_promotions')} />
      </div>

      <div className="set-footer">
        {error && <p className="set-error">{error}</p>}
        <button className="set-btn set-btn-right" onClick={() => setShowConfirm(true)}>
          Save Preferences
        </button>
      </div>

      {showConfirm && (
        <ConfirmModal
          title="Save Notification Preferences?"
          message="Your notification settings will be updated. Are you sure you want to continue?"
          confirmLabel="Save Preferences"
          busy={saving}
          onCancel={() => setShowConfirm(false)}
          onConfirm={performSave}
        />
      )}
    </div>
  );
}

function SecurityTab() {
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError('');
  }

  function handleSaveClick() {
    if (form.next !== form.confirm) {
      setError('New password and confirmation do not match.');
      return;
    }
    setShowConfirm(true);
  }

  async function performSave() {
    setSaving(true);
    setError('');
    try {
      // ⚠️ Guessed endpoint — verify this matches your real accounts app
      await apiClient.post('/accounts/change-password/', {
        current_password: form.current,
        new_password: form.next,
      });
      setSuccess(true);
      setForm({ current: '', next: '', confirm: '' });
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not update password. Please try again.');
    } finally {
      setSaving(false);
      setShowConfirm(false);
    }
  }

  return (
    <div className="set-card">
      {success && <Toast message="Password updated successfully" onDone={() => setSuccess(false)} />}

      <h2>Change Password</h2>

      <div className="set-field set-field-wide">
        <label>Current Password</label>
        <input
          type="password"
          placeholder="Enter current password"
          value={form.current}
          onChange={(e) => updateField('current', e.target.value)}
        />
      </div>
      <div className="set-field set-field-wide">
        <label>New Password</label>
        <input
          type="password"
          placeholder="Minimum 8 characters"
          value={form.next}
          onChange={(e) => updateField('next', e.target.value)}
        />
      </div>
      <div className="set-field set-field-wide">
        <label>Confirm New Password</label>
        <input
          type="password"
          placeholder="Re-enter new password"
          value={form.confirm}
          onChange={(e) => updateField('confirm', e.target.value)}
        />
      </div>

      <div className="set-footer">
        {error && <p className="set-error">{error}</p>}
        <button className="set-btn set-btn-right" onClick={handleSaveClick}>
          Update Password
        </button>
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
  );
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('My Profile');

  return (
    <CustomerLayout pageTitle="Settings" pageSubtitle="Manage your account preferences">
      <div className="set-layout">
        <div className="set-tabs">
          {TABS.map((tab) => (
            <button
              key={tab}
              className={`set-tab ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="set-content">
          {activeTab === 'My Profile' && <ProfileTab />}
          {activeTab === 'Notifications' && <NotificationsTab />}
          {activeTab === 'Security' && <SecurityTab />}
        </div>
      </div>
    </CustomerLayout>
  );
}