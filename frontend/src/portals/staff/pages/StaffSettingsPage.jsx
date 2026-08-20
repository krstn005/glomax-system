import { useEffect, useState } from 'react';
import apiClient from '../../../api/client';
import { sanitizePhoneNumber } from '../../../utils/phone';
import StaffLayout from '../components/StaffLayout';
import '../styles/staff-settings.css';

const TABS = ['My Profile', 'Security'];

function Toast({ message, onDone }) {
  useEffect(() => {
    const timer = setTimeout(onDone, 3000);
    return () => clearTimeout(timer);
  }, [onDone]);

  return <div className="stfset-toast">{message}</div>;
}

function ConfirmModal({ title, message, confirmLabel, busy, onCancel, onConfirm }) {
  return (
    <div className="stfset-modal-overlay" onClick={onCancel}>
      <div className="stfset-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <p>{message}</p>
        <div className="stfset-modal-actions">
          <button className="stfset-btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="stfset-btn" disabled={busy} onClick={onConfirm}>
            {busy ? 'Saving...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProfileTab() {
  // ASSUMPTION TO CONFIRM: "Full Name" is mapped directly to the `username`
  // field, same simplification used on the Customer portal, since the
  // backend User model has no separate full_name field yet. The Staff
  // text guide's "Username cannot be changed" note suggests these should
  // eventually be two separate fields — flag if you want that built for real.
  const [form, setForm] = useState({ fullName: '', email: '', phone: '' });
  const [phoneWarning, setPhoneWarning] = useState('');
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
        });
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

  async function performSave() {
    setSaving(true);
    setError('');
    try {
      await apiClient.patch('/accounts/me/', {
        username: form.fullName,
        email: form.email,
        phone_number: form.phone,
      });
      localStorage.setItem('username', form.fullName);
      setSuccess(true);
    } catch {
      setError('Something went wrong saving your changes. Please try again.');
    } finally {
      setSaving(false);
      setShowConfirm(false);
    }
  }

  if (loading) return <p className="stfset-loading">Loading...</p>;

  return (
    <div className="stfset-card">
      {success && <Toast message="Changes saved successfully" onDone={() => setSuccess(false)} />}

      <h2>Account Information</h2>

      <div className="stfset-grid">
        <div className="stfset-field">
          <label>Full Name</label>
          <input value={form.fullName} onChange={(e) => updateField('fullName', e.target.value)} />
        </div>
        <div className="stfset-field">
          <label>Phone Number</label>
          <input type="tel" inputMode="numeric" value={form.phone} onChange={handlePhoneChange} />
          {phoneWarning && <p className="stfset-field-warning">{phoneWarning}</p>}
        </div>
        <div className="stfset-field">
          <label>Email Address</label>
          <input value={form.email} onChange={(e) => updateField('email', e.target.value)} />
        </div>
      </div>

      <div className="stfset-footer">
        {error && <p className="stfset-error">{error}</p>}
        <button className="stfset-btn stfset-btn-right" onClick={() => setShowConfirm(true)}>
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
      // Same guessed endpoint as Customer's Security tab — verify this
      // matches your real accounts app
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
    <div className="stfset-card">
      {success && <Toast message="Password updated successfully" onDone={() => setSuccess(false)} />}

      <h2>Change Password</h2>

      <div className="stfset-field stfset-field-wide">
        <label>Current Password</label>
        <input
          type="password"
          placeholder="Enter current password"
          value={form.current}
          onChange={(e) => updateField('current', e.target.value)}
        />
      </div>
      <div className="stfset-field stfset-field-wide">
        <label>New Password</label>
        <input
          type="password"
          placeholder="Minimum 8 characters"
          value={form.next}
          onChange={(e) => updateField('next', e.target.value)}
        />
      </div>
      <div className="stfset-field stfset-field-wide">
        <label>Confirm New Password</label>
        <input
          type="password"
          placeholder="Re-enter new password"
          value={form.confirm}
          onChange={(e) => updateField('confirm', e.target.value)}
        />
      </div>

      <div className="stfset-footer">
        {error && <p className="stfset-error">{error}</p>}
        <button className="stfset-btn stfset-btn-right" onClick={handleSaveClick}>
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

export default function StaffSettingsPage() {
  const [activeTab, setActiveTab] = useState('My Profile');

  return (
    <StaffLayout pageTitle="Settings" pageSubtitle="Manage your account preferences">
      <div className="stfset-layout">
        <div className="stfset-tabs">
          {TABS.map((tab) => (
            <button
              key={tab}
              className={`stfset-tab ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="stfset-content">
          {activeTab === 'My Profile' && <ProfileTab />}
          {activeTab === 'Security' && <SecurityTab />}
        </div>
      </div>
    </StaffLayout>
  );
}