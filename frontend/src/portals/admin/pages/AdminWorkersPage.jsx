import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Users,
  UserCheck,
  UserX,
  UserPlus,
  Search,
  X,
  Plus,
  KeyRound,
  Power,
  Phone,
  Mail,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
  Eye,
  EyeOff,
  Copy,
  Check,
  Inbox,
  HardHat,
} from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import FilterMenu from '../../../components/FilterMenu';
import { getWorkers, addWorker, toggleWorkerActive, setWorkerPassword } from '../../../api/accounts';
import '../styles/admin-workers.css';
import '../styles/admin-workers-page.css';

const EMPTY_FORM = { username: '', full_name: '', email: '', phone_number: '', password: '' };
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

// Returns the first rule that is not met, written as a short sentence
function firstPasswordProblem(value) {
  const missing = checkPassword(value).results.find((r) => !r.ok);
  return missing ? `Password needs: ${missing.label.toLowerCase()}.` : '';
}

function getStrength(value) {
  if (!value) return { level: 0, label: '', tone: '' };
  const { passed, allOk } = checkPassword(value);
  if (allOk && value.length >= 12) return { level: 4, label: 'Strong', tone: 'green' };
  if (allOk) return { level: 3, label: 'Good', tone: 'green' };
  if (passed >= 4) return { level: 2, label: 'Fair', tone: 'gold' };
  return { level: 1, label: 'Weak', tone: 'red' };
}

function PasswordRules({ value }) {
  const { results } = checkPassword(value);
  const strength = getStrength(value);
  return (
    <div className="admw-pw-rules" aria-live="polite">
      <div className="admw-pw-strength">
        <div className="admw-pw-bars">
          {[1, 2, 3, 4].map((n) => (
            <span key={n} className={n <= strength.level ? `on tone-${strength.tone}` : ''} />
          ))}
        </div>
        <span className={`admw-pw-strength-label ${strength.tone ? `tone-${strength.tone}` : ''}`}>
          {strength.label || 'Password strength'}
        </span>
      </div>
      <ul className="admw-pw-list">
        {results.map((rule) => (
          <li key={rule.key} className={rule.ok ? 'ok' : ''}>
            <span className="admw-pw-dot">{rule.ok ? <Check size={11} strokeWidth={3} /> : null}</span>
            {rule.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

function PasswordMatch({ password, confirm }) {
  if (!confirm) return null;
  const ok = password === confirm;
  return (
    <p className={`admw-pw-match ${ok ? 'ok' : 'bad'}`}>
      {ok ? <Check size={13} strokeWidth={3} /> : <X size={13} strokeWidth={3} />}
      {ok ? 'Passwords match' : 'Passwords do not match yet'}
    </p>
  );
}

// Filter options - shown in the Filter drop-down button
const FILTERS = [
  { key: 'ALL', label: 'All Workers', icon: Users, tone: 'navy' },
  { key: 'ACTIVE', label: 'Active', icon: UserCheck, tone: 'green' },
  { key: 'INACTIVE', label: 'Inactive', icon: UserX, tone: 'gray' },
];

const FIELD_LABELS = {
  username: 'Username',
  full_name: 'Full name',
  email: 'Email',
  phone_number: 'Phone number',
  password: 'Password',
  new_password: 'Password',
};

// Turns a backend error into one short, readable line
function getErrorMessage(err, fallback) {
  const data = err?.response?.data;
  if (!data || typeof data === 'string') return fallback;
  if (data.detail) return String(data.detail);
  const [field, value] = Object.entries(data)[0] || [];
  if (!field) return fallback;
  const msg = Array.isArray(value) ? value[0] : value;
  if (typeof msg !== 'string') return fallback;
  if (!FIELD_LABELS[field]) return msg;
  return `${FIELD_LABELS[field]}: ${msg}`;
}

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function Modal({ icon: Icon, tone, title, subtitle, onClose, busy, wide, children }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape' && !busy) onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  return (
    <div className="admw-overlay" onMouseDown={() => !busy && onClose()}>
      <div
        className={`admw-modal ${wide ? 'wide' : ''}`}
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="admw-modal-head">
          <span className={`admw-modal-icon tone-${tone}`}>
            <Icon size={20} />
          </span>
          <div className="admw-modal-titles">
            <h3>{title}</h3>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" className="admw-modal-close" onClick={onClose} disabled={busy} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function PasswordInput({ value, onChange, placeholder, autoFocus }) {
  const [show, setShow] = useState(false);
  return (
    <div className="admw-password">
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
        className="admw-password-toggle"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? 'Hide password' : 'Show password'}
      >
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

function RowSkeleton() {
  return (
    <div className="admw-row admw-row-skeleton" aria-hidden="true">
      <span className="admw-skel-person">
        <span className="admw-skel admw-skel-avatar" />
        <span className="admw-skel admw-skel-w-md" />
      </span>
      <span className="hide-lg">
        <span className="admw-skel admw-skel-w-lg" />
      </span>
      <span className="hide-sm">
        <span className="admw-skel admw-skel-pill" />
      </span>
      <span className="admw-center">
        <span className="admw-skel admw-skel-w-sm" />
      </span>
      <span className="admw-center">
        <span className="admw-skel admw-skel-w-sm" />
      </span>
      <span className="admw-right">
        <span className="admw-skel admw-skel-w-md" />
      </span>
    </div>
  );
}

function ListHead() {
  return (
    <div className="admw-row admw-row-head" role="row">
      <span role="columnheader">Worker</span>
      <span role="columnheader" className="hide-lg">
        Contact
      </span>
      <span role="columnheader" className="hide-sm">
        Status
      </span>
      <span role="columnheader" className="admw-center">
        Active
      </span>
      <span role="columnheader" className="admw-center">
        Done
      </span>
      <span role="columnheader" className="admw-right">
        Actions
      </span>
    </div>
  );
}

export default function AdminWorkersPage() {
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(null); // { type: 'success' | 'error', text }

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const [credWorker, setCredWorker] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [credError, setCredError] = useState('');
  const [credSuccess, setCredSuccess] = useState(false);
  const [credSaving, setCredSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const [busyId, setBusyId] = useState(null);
  const [toggleTarget, setToggleTarget] = useState(null);

  const loadWorkers = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const data = await getWorkers();
      setWorkers(Array.isArray(data) ? data : []);
      setError('');
    } catch {
      if (!silent) setError('Could not load workers. Please check your connection and try again.');
      else setNotice({ type: 'error', text: 'Could not refresh the list. Please reload the page.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWorkers();
  }, [loadWorkers]);

  // Success messages go away on their own
  useEffect(() => {
    if (!notice || notice.type !== 'success') return undefined;
    const timer = setTimeout(() => setNotice(null), 4500);
    return () => clearTimeout(timer);
  }, [notice]);

  const counts = useMemo(() => {
    const active = workers.filter((w) => w.is_active).length;
    return {
      ALL: workers.length,
      ACTIVE: active,
      INACTIVE: workers.length - active,
      jobs: workers.reduce((sum, w) => sum + (Number(w.active_tickets_count) || 0), 0),
    };
  }, [workers]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return workers
      .filter((w) => {
        if (statusFilter === 'ACTIVE' && !w.is_active) return false;
        if (statusFilter === 'INACTIVE' && w.is_active) return false;
        if (!term) return true;
        return [w.full_name, w.username, w.phone_number, w.email]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(term);
      })
      .sort((a, b) => {
        if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
        return (a.full_name || a.username).localeCompare(b.full_name || b.username);
      });
  }, [workers, search, statusFilter]);


  function clearAll() {
    setSearch('');
    setStatusFilter('ALL');
  }

  // ----- Add worker -----
  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function openAddModal() {
    setFormError('');
    setShowAddModal(true);
  }

  const closeAddModal = useCallback(() => {
    setShowAddModal(false);
    setFormError('');
  }, []);

  async function handleAddWorker(e) {
    e.preventDefault();
    setFormError('');

    const passwordProblem = firstPasswordProblem(form.password);
    if (passwordProblem) {
      setFormError(passwordProblem);
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...form,
        username: form.username.trim(),
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        phone_number: form.phone_number.trim(),
      };
      await addWorker(payload);
      setShowAddModal(false);
      setForm(EMPTY_FORM);
      setNotice({
        type: 'success',
        text: `Account for ${payload.full_name || payload.username} was created. They can now log in as "${payload.username}".`,
      });
      loadWorkers({ silent: true });
    } catch (err) {
      setFormError(getErrorMessage(err, 'Could not create the worker account. Please try again.'));
    } finally {
      setSaving(false);
    }
  }

  // ----- Activate / deactivate -----
  function requestToggle(worker) {
    setNotice(null);
    setToggleTarget(worker);
  }

  const closeToggle = useCallback(() => setToggleTarget(null), []);

  async function confirmToggle() {
    const worker = toggleTarget;
    const name = worker.full_name || worker.username;
    setBusyId(worker.id);
    try {
      await toggleWorkerActive(worker.id);
      await loadWorkers({ silent: true });
      setNotice({
        type: 'success',
        text: worker.is_active ? `${name} was deactivated.` : `${name} is active again.`,
      });
    } catch {
      setNotice({ type: 'error', text: `Could not update ${name}'s status. Please try again.` });
    } finally {
      setBusyId(null);
      setToggleTarget(null);
    }
  }

  // ----- Credentials -----
  function openCredentials(worker) {
    setCredWorker(worker);
    setNewPassword('');
    setConfirmPassword('');
    setCredError('');
    setCredSuccess(false);
    setCopied(false);
  }

  const closeCredentials = useCallback(() => {
    setCredWorker(null);
    setNewPassword('');
    setConfirmPassword('');
    setCredError('');
    setCredSuccess(false);
    setCopied(false);
  }, []);

  async function copyUsername() {
    try {
      await navigator.clipboard.writeText(credWorker.username);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Copy isn't allowed here; the username is still shown on screen.
    }
  }

  async function handleSetPassword(e) {
    e.preventDefault();
    setCredError('');

    const passwordProblem = firstPasswordProblem(newPassword);
    if (passwordProblem) {
      setCredError(passwordProblem);
      return;
    }
    if (newPassword !== confirmPassword) {
      setCredError('The two passwords do not match.');
      return;
    }

    setCredSaving(true);
    try {
      await setWorkerPassword(credWorker.id, newPassword);
      setCredSuccess(true);
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setCredError(getErrorMessage(err, 'Could not update the password. Please try again.'));
    } finally {
      setCredSaving(false);
    }
  }

  const toggleName = toggleTarget ? toggleTarget.full_name || toggleTarget.username : '';
  const toggleOpenTickets = toggleTarget ? Number(toggleTarget.active_tickets_count) || 0 : 0;

  return (
    <AdminLayout pageTitle="Workers" pageSubtitle="Manage partner installer accounts and their login details">
      <div className="admw-page">
        {/* ---------- Banner ---------- */}
        <section className="admw-hero">
          <div className="admw-hero-glow" aria-hidden="true" />
          <div className="admw-hero-icon">
            <HardHat size={26} />
          </div>
          <div className="admw-hero-text">
            <h1>Partner Installers</h1>
            <p>
              {loading || error
                ? 'Worker accounts and their login details.'
                : counts.jobs > 0
                  ? `${counts.jobs} job${counts.jobs === 1 ? '' : 's'} in progress across all workers.`
                  : 'No jobs in progress right now.'}
            </p>
          </div>
          <div className="admw-hero-actions">
            <button type="button" className="admw-hero-btn gold" onClick={openAddModal}>
              <Plus size={17} />
              Add Worker
            </button>
          </div>
        </section>

        {notice && (
          <div className={`admw-notice ${notice.type}`} role="status">
            {notice.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            <span>{notice.text}</span>
            <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss">
              <X size={15} />
            </button>
          </div>
        )}

        {/* ---------- List ---------- */}
        <div className="admw-card">
          <div className="admw-card-head">
            <div className="admw-card-title">
              <h2>Worker Accounts</h2>
              <p>Active workers can get new tickets</p>
            </div>
            <div className="admw-tools">
              <div className="admw-search">
                <Search size={17} />
                <input
                  type="text"
                  placeholder="Search name, phone, or email"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="Search workers"
                />
                {search && (
                  <button type="button" className="admw-search-clear" onClick={() => setSearch('')} aria-label="Clear search">
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Counts show "—" while the list is loading */}
              <FilterMenu
                options={FILTERS}
                activeKey={statusFilter}
                counts={loading ? {} : counts}
                onPick={setStatusFilter}
                ariaLabel="Filter by status"
              />
            </div>
          </div>

          {error ? (
            <div className="admw-state">
              <span className="admw-state-icon red">
                <AlertCircle size={26} />
              </span>
              <p className="admw-state-title">Something went wrong</p>
              <p className="admw-state-hint">{error}</p>
              <button type="button" className="admw-btn-primary" onClick={() => loadWorkers()}>
                <RefreshCw size={15} />
                Try again
              </button>
            </div>
          ) : loading ? (
            <div className="admw-list">
              <ListHead />
              {[1, 2, 3].map((n) => (
                <RowSkeleton key={n} />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="admw-state">
              <span className="admw-state-icon">
                {workers.length === 0 ? <UserPlus size={26} /> : <Inbox size={26} />}
              </span>
              {workers.length === 0 ? (
                <>
                  <p className="admw-state-title">No workers yet</p>
                  <p className="admw-state-hint">Add your first partner installer so tickets can be assigned to them.</p>
                  <button type="button" className="admw-btn-primary" onClick={openAddModal}>
                    <Plus size={15} />
                    Add Worker
                  </button>
                </>
              ) : (
                <>
                  <p className="admw-state-title">No workers match your search or filter</p>
                  <p className="admw-state-hint">Try a different name or username, or try another filter.</p>
                  <button type="button" className="admw-btn-secondary" onClick={clearAll}>
                    Show all workers
                  </button>
                </>
              )}
            </div>
          ) : (
            <>
              <div className="admw-list" role="table" aria-label="Workers">
                <ListHead />
                {filtered.map((w) => {
                  const name = w.full_name || w.username;
                  const activeCount = Number(w.active_tickets_count) || 0;
                  const doneCount = Number(w.completed_tickets_count) || 0;
                  const busy = busyId === w.id;

                  return (
                    <div key={w.id} className={`admw-row ${w.is_active ? '' : 'is-inactive'}`} role="row">
                      <span role="cell" className="admw-person">
                        <span className="admw-avatar">{getInitials(name)}</span>
                        <span className="admw-person-text">
                          <span className="admw-person-name">{name}</span>
                          <span className="admw-person-sub">
                            @{w.username}
                            <span className={`admw-inline-status show-sm ${w.is_active ? 'active' : 'inactive'}`}>
                              {w.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </span>
                          {w.phone_number && (
                            <span className="admw-person-phone show-lg">
                              <Phone size={12} />
                              {w.phone_number}
                            </span>
                          )}
                        </span>
                      </span>

                      <span role="cell" className="hide-lg">
                        <span className="admw-contact">
                          <span>
                            <Phone size={13} />
                            {w.phone_number || <em>No phone</em>}
                          </span>
                          {w.email && (
                            <span title={w.email}>
                              <Mail size={13} />
                              {w.email}
                            </span>
                          )}
                        </span>
                      </span>

                      <span role="cell" className="hide-sm">
                        <span className={`admw-status ${w.is_active ? 'active' : 'inactive'}`}>
                          <span className="admw-status-dot" />
                          {w.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </span>

                      <span role="cell" className="admw-center admw-cell-active">
                        <span className={`admw-count ${activeCount > 0 ? 'blue' : 'zero'}`}>{activeCount}</span>
                        <span className="admw-count-label">Active</span>
                      </span>

                      <span role="cell" className="admw-center admw-cell-done">
                        <span className={`admw-count ${doneCount > 0 ? 'navy' : 'zero'}`}>{doneCount}</span>
                        <span className="admw-count-label">Done</span>
                      </span>

                      <span role="cell" className="admw-right admw-cell-actions">
                        <span className="admw-actions">
                          <button type="button" className="admw-btn-cred" onClick={() => openCredentials(w)}>
                            <KeyRound size={14} />
                            Credentials
                          </button>
                          <button
                            type="button"
                            className={`admw-btn-toggle ${w.is_active ? 'deactivate' : 'activate'}`}
                            disabled={busy}
                            onClick={() => requestToggle(w)}
                          >
                            <Power size={14} />
                            {busy ? 'Saving...' : w.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>

              {(search.trim() || statusFilter !== 'ALL') && (
                <div className="admw-card-foot">
                  <span>
                    Showing <strong>{filtered.length}</strong> of <strong>{workers.length}</strong> worker
                    {workers.length === 1 ? '' : 's'}
                  </span>
                  <button type="button" className="admw-link-btn" onClick={clearAll}>
                    Show all
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Add worker */}
      {showAddModal && (
        <Modal
          icon={UserPlus}
          tone="navy"
          title="Add Worker"
          subtitle="Create a login for a new partner installer"
          onClose={closeAddModal}
          busy={saving}
          wide
        >
          <form onSubmit={handleAddWorker} className="admw-form">
            <div className="admw-form-grid">
              <label className="admw-field">
                <span>Full Name</span>
                <input
                  value={form.full_name}
                  onChange={(e) => updateField('full_name', e.target.value)}
                  placeholder="e.g. Juan Dela Cruz"
                  autoFocus
                  required
                />
              </label>
              <label className="admw-field">
                <span>Username</span>
                <input
                  value={form.username}
                  onChange={(e) => updateField('username', e.target.value)}
                  placeholder="e.g. installer2"
                  autoComplete="off"
                  required
                />
              </label>
              <label className="admw-field">
                <span>Email</span>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => updateField('email', e.target.value)}
                  placeholder="name@example.com"
                  required
                />
              </label>
              <label className="admw-field">
                <span>Phone Number</span>
                <input
                  type="tel"
                  value={form.phone_number}
                  onChange={(e) => updateField('phone_number', e.target.value)}
                  placeholder="e.g. 09171234567"
                  required
                />
              </label>
              <label className="admw-field admw-field-full">
                <span>Password</span>
                <PasswordInput
                  value={form.password}
                  onChange={(e) => updateField('password', e.target.value)}
                  placeholder="Create a strong password"
                />
              </label>
              <div className="admw-field-full">
                <PasswordRules value={form.password} />
              </div>
            </div>

            <p className="admw-form-note">
              Give the username and password to the worker so they can log in. They can change their password later in
              their Settings.
            </p>

            {formError && (
              <p className="admw-form-error">
                <AlertCircle size={15} />
                {formError}
              </p>
            )}

            <div className="admw-modal-actions">
              <button type="button" className="admw-btn-secondary" onClick={closeAddModal} disabled={saving}>
                Cancel
              </button>
              <button type="submit" className="admw-btn-primary" disabled={saving}>
                {saving ? 'Creating...' : 'Create Worker'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Activate / deactivate */}
      {toggleTarget && (
        <Modal
          icon={toggleTarget.is_active ? UserX : UserCheck}
          tone={toggleTarget.is_active ? 'red' : 'green'}
          title={toggleTarget.is_active ? 'Deactivate this worker?' : 'Activate this worker?'}
          subtitle={`${toggleName} · @${toggleTarget.username}`}
          onClose={closeToggle}
          busy={Boolean(busyId)}
        >
          <p className="admw-modal-text">
            {toggleTarget.is_active
              ? `${toggleName} won't be able to get new tickets until you activate them again.`
              : `${toggleName} will be able to get new tickets again.`}
          </p>

          {toggleTarget.is_active && toggleOpenTickets > 0 && (
            <p className="admw-warning">
              <AlertTriangle size={16} />
              They still have {toggleOpenTickets} active ticket{toggleOpenTickets === 1 ? '' : 's'}. Check those tickets
              so nothing gets stuck.
            </p>
          )}

          <div className="admw-modal-actions">
            <button type="button" className="admw-btn-secondary" onClick={closeToggle} disabled={Boolean(busyId)}>
              Cancel
            </button>
            <button
              type="button"
              className={toggleTarget.is_active ? 'admw-btn-danger' : 'admw-btn-success'}
              onClick={confirmToggle}
              disabled={Boolean(busyId)}
            >
              {busyId ? 'Saving...' : toggleTarget.is_active ? 'Deactivate' : 'Activate'}
            </button>
          </div>
        </Modal>
      )}

      {/* Credentials */}
      {credWorker && (
        <Modal
          icon={KeyRound}
          tone="gold"
          title="Login Credentials"
          subtitle={credWorker.full_name || credWorker.username}
          onClose={closeCredentials}
          busy={credSaving}
        >
          <div className="admw-cred-box">
            <div>
              <span className="admw-cred-label">Username</span>
              <span className="admw-cred-value">{credWorker.username}</span>
            </div>
            <button type="button" className="admw-copy-btn" onClick={copyUsername}>
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>

          {credSuccess ? (
            <>
              <div className="admw-success-box">
                <CheckCircle2 size={22} />
                <div>
                  <strong>Password updated</strong>
                  <span>Give the new password to the worker. It can't be shown again.</span>
                </div>
              </div>
              <div className="admw-modal-actions">
                <button type="button" className="admw-btn-primary" onClick={closeCredentials}>
                  Done
                </button>
              </div>
            </>
          ) : (
            <form onSubmit={handleSetPassword} className="admw-form">
              <p className="admw-modal-hint">
                Passwords can't be viewed once set. You can only replace it with a new one.
              </p>

              <label className="admw-field">
                <span>New Password</span>
                <PasswordInput
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Create a strong password"
                  autoFocus
                />
              </label>
              <PasswordRules value={newPassword} />

              <label className="admw-field">
                <span>Confirm Password</span>
                <PasswordInput
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Type it again"
                />
              </label>
              <PasswordMatch password={newPassword} confirm={confirmPassword} />

              {credError && (
                <p className="admw-form-error">
                  <AlertCircle size={15} />
                  {credError}
                </p>
              )}

              <div className="admw-modal-actions">
                <button type="button" className="admw-btn-secondary" onClick={closeCredentials} disabled={credSaving}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="admw-btn-primary"
                  disabled={credSaving || !checkPassword(newPassword).allOk || newPassword !== confirmPassword}
                >
                  {credSaving ? 'Saving...' : 'Set New Password'}
                </button>
              </div>
            </form>
          )}
        </Modal>
      )}
    </AdminLayout>
  );
}