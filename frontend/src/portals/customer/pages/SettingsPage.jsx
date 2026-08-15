import { useEffect, useState } from 'react';
import apiClient from '../../../api/client';
import CustomerLayout from '../components/CustomerLayout';
import '../styles/settings.css';

const TABS = ['My Profile', 'Notifications', 'Security'];

function ProfileTab() {
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', address: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadMe() {
      try {
        // ⚠️ Uses the already-confirmed GET /api/accounts/me/ endpoint
        const res = await apiClient.get('/accounts/me/');
        setForm({
          fullName: res.data.username || '',
          email: res.data.email || '',
          phone: res.data.phone || '',
          address: res.data.address || '',
        });
      } catch (err) {
        setError('Could not load your profile.');
      } finally {
        setLoading(false);
      }
    }
    loadMe();
  }, []);

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setSuccess(false);
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      // ⚠️ Guessed endpoint — verify this matches your real accounts app
      await apiClient.patch('/accounts/me/', {
        username: form.fullName,
        email: form.email,
        phone: form.phone,
        address: form.address,
      });
      localStorage.setItem('username', form.fullName);
      setSuccess(true);
    } catch (err) {
      setError('Something went wrong saving your changes. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  const initials = (form.fullName || 'CU').slice(0, 2).toUpperCase();

  if (loading) return <p className="set-loading">Loading...</p>;

  return (
    <div className="set-card">
      <h2>Personal Information</h2>

      <div className="set-photo-row">
        <div className="set-avatar">{initials}</div>
        <div>
          <p className="set-photo-title">Profile Photo</p>
          <p className="set-photo-sub">Your initials are used as your avatar</p>
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
          <input value={form.phone} onChange={(e) => updateField('phone', e.target.value)} />
        </div>
        <div className="set-field">
          <label>Home Address</label>
          <input value={form.address} onChange={(e) => updateField('address', e.target.value)} />
        </div>
      </div>

      <div className="set-footer">
        {success && <p className="set-success">✓ Password updated successfully!</p>}
        {error && <p className="set-error">{error}</p>}
        <button className="set-btn" disabled={saving} onClick={handleSave}>
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}

function NotificationsTab() {
  const [prefs, setPrefs] = useState({
    email: true,
    sms: true,
    approval: true,
    rejection: true,
    completed: true,
    promotions: false,
  });
  const [success, setSuccess] = useState(false);

  function toggle(key) {
    setPrefs((prev) => ({ ...prev, [key]: !prev[key] }));
    setSuccess(false);
  }

  function handleSave() {
    // ⚠️ Not connected to a backend yet — no notification-preferences model exists
    // in the project so far. This just confirms visually for now.
    setSuccess(true);
  }

  const Toggle = ({ checked, onClick }) => (
    <button className="set-btn set-btn-right" disabled={saving} onClick={handleSave}>
      <span className="set-toggle-dot" />
    </button>
  );

  return (
    <div className="set-card">
      <h2>Notification Preferences</h2>

      <div className="set-toggle-row">
        <div>
          <p className="set-toggle-title">Email Updates</p>
          <p className="set-toggle-sub">Receive updates via email</p>
        </div>
        <Toggle checked={prefs.email} onClick={() => toggle('email')} />
      </div>
      <div className="set-toggle-row">
        <div>
          <p className="set-toggle-title">SMS Updates</p>
          <p className="set-toggle-sub">Receive updates via SMS</p>
        </div>
        <Toggle checked={prefs.sms} onClick={() => toggle('sms')} />
      </div>

      <p className="set-section-label">Request Notifications</p>

      <div className="set-toggle-row">
        <div>
          <p className="set-toggle-title">Request Approval</p>
          <p className="set-toggle-sub">Notify when your request is approved</p>
        </div>
        <Toggle checked={prefs.approval} onClick={() => toggle('approval')} />
      </div>
      <div className="set-toggle-row">
        <div>
          <p className="set-toggle-title">Request Rejection</p>
          <p className="set-toggle-sub">Notify when your request is rejected</p>
        </div>
        <Toggle checked={prefs.rejection} onClick={() => toggle('rejection')} />
      </div>
      <div className="set-toggle-row">
        <div>
          <p className="set-toggle-title">Installation Complete</p>
          <p className="set-toggle-sub">Notify when installation is completed</p>
        </div>
        <Toggle checked={prefs.completed} onClick={() => toggle('completed')} />
      </div>
      <div className="set-toggle-row">
        <div>
          <p className="set-toggle-title">Promotions & Offers</p>
          <p className="set-toggle-sub">Receive special offers and promotions</p>
        </div>
        <Toggle checked={prefs.promotions} onClick={() => toggle('promotions')} />
      </div>

      <div className="set-footer">
        {success && <p className="set-success">✓ Preferences saved (not yet connected to backend)</p>}
        <button className="set-btn set-btn-right" onClick={handleSave}>Save Preferences</button>
      </div>
    </div>
  );
}

function SecurityTab() {
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setSuccess(false);
    setError('');
  }

  async function handleSave() {
    if (form.next !== form.confirm) {
      setError('New password and confirmation do not match.');
      return;
    }
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
    }
  }

  return (
    <div className="set-card">
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

      {success && <p className="set-success">✓ Password updated successfully!</p>}
      {error && <p className="set-error">{error}</p>}

      <button className="set-btn" disabled={saving} onClick={handleSave}>
        {saving ? 'Updating...' : 'Update Password'}
      </button>
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