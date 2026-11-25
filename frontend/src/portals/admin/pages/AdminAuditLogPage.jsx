import { useEffect, useState } from 'react';
import { Search, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/client';
import '../styles/admin-audit-log.css';

const SEARCH_DEBOUNCE_MS = 400;

// Colour of the small label for each kind of event
const TONES = {
  REGISTERED: 'green',
  LOGIN_SUCCESS: 'green',
  PASSWORD_CHANGED: 'amber',
  LOGIN_FAILED: 'red',
  LOGIN_CODE_FAILED: 'red',
  LOGIN_BLOCKED: 'red',
  ACCOUNT_LOCKED: 'red',
};

function formatWhen(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function AdminAuditLogPage() {
  const [rows, setRows] = useState([]);
  const [actions, setActions] = useState([]);
  const [count, setCount] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  // Wait a moment after typing before searching
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchTerm(searchInput.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const res = await apiClient.get('/accounts/admin/audit-log/', {
          params: { page, action: action || undefined, q: searchTerm || undefined },
        });
        if (cancelled) return;
        setRows(res.data.results || []);
        setCount(res.data.count || 0);
        setPageSize(res.data.page_size || 25);
        if (res.data.actions) setActions(res.data.actions);
        setError('');
      } catch {
        if (!cancelled) setError('Could not load the audit log. Please try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [page, action, searchTerm, reloadKey]);

  const totalPages = Math.max(1, Math.ceil(count / pageSize));

  return (
    <AdminLayout
      pageTitle="Audit Log"
      pageSubtitle="Sign-ins, wrong passwords, lockouts, new accounts and password changes"
    >
      <div className="aal-page">
        <section className="aal-card">
          <div className="aal-tools">
            <div className="aal-search">
              <Search size={16} />
              <input
                type="text"
                placeholder="Search name, email, details or address"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
            <select
              className="aal-select"
              value={action}
              onChange={(e) => {
                setAction(e.target.value);
                setPage(1);
              }}
              aria-label="Filter by event"
            >
              <option value="">All events</option>
              {actions.map((a) => (
                <option key={a.key} value={a.key}>
                  {a.label}
                </option>
              ))}
            </select>
            <button type="button" className="aal-refresh" onClick={() => setReloadKey((k) => k + 1)} disabled={loading}>
              <RefreshCw size={15} className={loading ? 'aal-spin' : ''} />
              Refresh
            </button>
          </div>

          {error && <div className="aal-error">{error}</div>}

          <div className="aal-scroll">
            <table className="aal-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Event</th>
                  <th>Who</th>
                  <th>Details</th>
                  <th>Address</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="aal-when">{formatWhen(r.created_at)}</td>
                    <td>
                      <span className={`aal-badge ${TONES[r.action] || ''}`}>{r.action_label}</span>
                    </td>
                    <td className="aal-who">
                      <strong>{r.who}</strong>
                      {r.role && <span>{r.role.replace('_', ' ').toLowerCase()}</span>}
                    </td>
                    <td className="aal-detail">{r.detail || '—'}</td>
                    <td className="aal-ip">{r.ip_address || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && rows.length === 0 && !error && (
              <p className="aal-empty">Nothing here yet. Events show up as people sign in and register.</p>
            )}
          </div>

          <div className="aal-pager">
            <span>
              {count} event{count === 1 ? '' : 's'} · page {page} of {totalPages}
            </span>
            <div className="aal-pager-btns">
              <button type="button" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft size={15} />
                Previous
              </button>
              <button type="button" disabled={page >= totalPages || loading} onClick={() => setPage((p) => p + 1)}>
                Next
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        </section>

        <p className="aal-note">Newest first. Only Admin can see this page.</p>
      </div>
    </AdminLayout>
  );
}