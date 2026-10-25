import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  X,
  Inbox,
  Layers,
  Clock,
  UserCheck,
  ClipboardList,
  ShieldCheck,
  CheckCircle2,
  Award,
  XCircle,
  MinusCircle,
  MapPin,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  ArrowRight,
  RefreshCw,
  HardHat,
  CalendarDays,
  SlidersHorizontal,
  ChevronDown,
  Check,
} from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import { getAdminTicketsPage } from '../../../api/adminTickets';
import '../styles/admin-requests.css';

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 400;

const IN_PROGRESS_STATUSES = ['PI_ASSIGNED', 'ASSESSMENT_SUBMITTED', 'STAFF_REVIEW'];

const ALL_STATUSES = [
  'REQUEST_SUBMITTED',
  ...IN_PROGRESS_STATUSES,
  'ADMIN_REVIEW',
  'APPROVED',
  'COMPLETED',
  'NC_CANNOT_PROCEED',
  'NC_CAN_REAPPLY',
  'WITHDRAWN',
];

// Choices in the Filter drop-down. "group" puts them under a small heading.
const FILTERS = [
  { key: 'ALL', group: null, label: 'All Requests', short: 'All', statuses: ALL_STATUSES, icon: Layers, tone: 'navy' },
  { key: 'APPROVAL', group: 'Needs your action', label: 'Awaiting Your Approval', short: 'Approval', statuses: ['ADMIN_REVIEW'], icon: ShieldCheck, tone: 'gold' },
  { key: 'NEW', group: 'Still in progress', label: 'New Requests', short: 'New', statuses: ['REQUEST_SUBMITTED'], icon: Clock, tone: 'navy' },
  { key: 'IN_PROGRESS', group: 'Still in progress', label: 'In Progress', short: 'In Progress', statuses: IN_PROGRESS_STATUSES, icon: ClipboardList, tone: 'blue' },
  { key: 'APPROVED', group: 'Still in progress', label: 'Approved', short: 'Approved', statuses: ['APPROVED'], icon: CheckCircle2, tone: 'green' },
  { key: 'COMPLETED', group: 'Closed', label: 'Completed', short: 'Completed', statuses: ['COMPLETED'], icon: Award, tone: 'navy' },
  { key: 'NOT_COMPATIBLE', group: 'Closed', label: 'Not Compatible', short: 'Not Compatible', statuses: ['NC_CANNOT_PROCEED', 'NC_CAN_REAPPLY'], icon: XCircle, tone: 'red' },
  { key: 'WITHDRAWN', group: 'Closed', label: 'Withdrawn', short: 'Withdrawn', statuses: ['WITHDRAWN'], icon: MinusCircle, tone: 'gray' },
];

// Badge look for each ticket status
const STATUS_BADGE = {
  REQUEST_SUBMITTED: { tone: 'navy', icon: Clock },
  PI_ASSIGNED: { tone: 'blue', icon: UserCheck },
  ASSESSMENT_SUBMITTED: { tone: 'blue', icon: ClipboardList },
  STAFF_REVIEW: { tone: 'blue', icon: ClipboardList },
  ADMIN_REVIEW: { tone: 'gold', icon: ShieldCheck },
  APPROVED: { tone: 'green', icon: CheckCircle2 },
  COMPLETED: { tone: 'navy', icon: Award, solid: true },
  NC_CANNOT_PROCEED: { tone: 'red', icon: XCircle },
  NC_CAN_REAPPLY: { tone: 'red', icon: XCircle },
  WITHDRAWN: { tone: 'gray', icon: MinusCircle },
};

// What happens next for each status. "action" = Admin needs to do something.
const NEXT_STEP = {
  REQUEST_SUBMITTED: { text: 'Waiting for installer assignment' },
  PI_ASSIGNED: { text: 'Waiting for site visit' },
  ASSESSMENT_SUBMITTED: { text: 'Staff reviewing assessment' },
  STAFF_REVIEW: { text: 'Staff reviewing assessment' },
  ADMIN_REVIEW: { text: 'Approve assessment', action: true },
  APPROVED: { text: 'Waiting for installation' },
  COMPLETED: { text: 'Done', muted: true },
  NC_CANNOT_PROCEED: { text: 'Closed', muted: true },
  NC_CAN_REAPPLY: { text: 'Customer can reapply', muted: true },
  WITHDRAWN: { text: 'Closed by customer', muted: true },
};

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getInitials(name) {
  const parts = (name || '?').trim().split(/\s+/);
  const first = parts[0]?.[0] || '?';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : parts[0]?.[1] || '';
  return (first + last).toUpperCase();
}

// Page numbers with "..." when there are many pages
function getPageNumbers(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set([1, total, current, current - 1, current + 1]);
  const list = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const result = [];
  list.forEach((p, i) => {
    if (i > 0 && p - list[i - 1] > 1) result.push('...');
    result.push(p);
  });
  return result;
}

// The Filter button and its drop-down list
function FilterMenu({ activeKey, counts, onPick }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const current = FILTERS.find((f) => f.key === activeKey) || FILTERS[0];
  const CurrentIcon = current.icon;
  const approvalCount = counts.APPROVAL || 0;
  const filtered = activeKey !== 'ALL';

  // Close when clicking outside or pressing Escape
  useEffect(() => {
    if (!open) return undefined;
    function onDown(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function pick(key) {
    onPick(key);
    setOpen(false);
  }

  let lastGroup = null;

  return (
    <div className="admr-filter" ref={wrapRef}>
      <button
        type="button"
        className={`admr-filter-btn ${open ? 'open' : ''} ${filtered ? 'filtered' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {filtered ? <CurrentIcon size={16} /> : <SlidersHorizontal size={16} />}
        <span className="admr-filter-text">{filtered ? current.label : 'Filter'}</span>
        {/* Gold dot: something waits for approval and it's not the picked filter */}
        {approvalCount > 0 && activeKey !== 'APPROVAL' && <span className="admr-filter-alert" aria-hidden="true" />}
        <ChevronDown size={16} className="admr-filter-chevron" />
      </button>

      {filtered && (
        <button type="button" className="admr-filter-clear" onClick={() => onPick('ALL')} aria-label="Clear filter">
          <X size={14} />
        </button>
      )}

      {open && (
        <div className="admr-filter-menu" role="listbox" aria-label="Filter requests">
          {FILTERS.map(({ key, group, label, icon: Icon, tone }) => {
            const selected = key === activeKey;
            const value = counts[key];
            const heading = group && group !== lastGroup ? group : null;
            lastGroup = group;
            return (
              <div key={key}>
                {heading && <p className="admr-filter-group">{heading}</p>}
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={`admr-filter-item tone-${tone} ${selected ? 'selected' : ''} ${
                    key === 'APPROVAL' && approvalCount > 0 ? 'flag' : ''
                  }`}
                  onClick={() => pick(key)}
                >
                  <span className="admr-filter-icon">
                    <Icon size={15} />
                  </span>
                  <span className="admr-filter-label">{label}</span>
                  <span className="admr-filter-count">{value !== undefined ? value : '—'}</span>
                  <span className="admr-filter-check">{selected && <Check size={15} />}</span>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ListHead() {
  return (
    <div className="admr-row admr-head" role="row">
      <span>Ticket #</span>
      <span>Customer</span>
      <span className="admr-hide-md">Property Address</span>
      <span className="admr-hide-md">Partner Installer</span>
      <span className="admr-hide-sm">Submitted</span>
      <span>Status</span>
      <span className="admr-hide-lg">Next Step</span>
      <span aria-hidden="true" />
    </div>
  );
}

function RowSkeleton() {
  return (
    <div className="admr-row admr-row-skeleton">
      <span className="admr-skel admr-skel-sm" />
      <span className="admr-skel-customer">
        <span className="admr-skel admr-skel-avatar" />
        <span className="admr-skel-stack">
          <span className="admr-skel admr-skel-md" />
          <span className="admr-skel admr-skel-xs" />
        </span>
      </span>
      <span className="admr-hide-md">
        <span className="admr-skel admr-skel-md" />
      </span>
      <span className="admr-hide-md">
        <span className="admr-skel admr-skel-sm" />
      </span>
      <span className="admr-hide-sm">
        <span className="admr-skel admr-skel-sm" />
      </span>
      <span>
        <span className="admr-skel admr-skel-pill" />
      </span>
      <span className="admr-hide-lg">
        <span className="admr-skel admr-skel-md" />
      </span>
      <span />
    </div>
  );
}

function RequestRow({ ticket: t, onOpen }) {
  const name = t.full_name || t.customer_username;
  const installer = t.partner_installer_username;
  const badge = STATUS_BADGE[t.status] || STATUS_BADGE.PI_ASSIGNED;
  const BadgeIcon = badge.icon;
  const next = NEXT_STEP[t.status] || { text: '—' };
  const needsApproval = t.status === 'ADMIN_REVIEW';

  return (
    <div
      className={`admr-row admr-item ${needsApproval ? 'needs-approval' : ''}`}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(t.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(t.id);
        }
      }}
    >
      <span className="admr-ticket">{t.ticket_number}</span>

      <span className="admr-customer">
        <span className="admr-avatar">{getInitials(name)}</span>
        <span className="admr-customer-text">
          <span className="admr-customer-name">{name}</span>
          <span className="admr-customer-sub">
            {t.solar_package && <span className="admr-package">{t.solar_package}</span>}
            {/* Installer and date show here on smaller screens */}
            <span className={`admr-inline admr-inline-installer ${installer ? '' : 'none'}`}>
              <HardHat size={12} />
              {installer || 'No installer yet'}
            </span>
            <span className="admr-inline admr-inline-date">
              <CalendarDays size={12} />
              {formatDate(t.created_at)}
            </span>
          </span>
        </span>
      </span>

      <span className="admr-hide-md">
        {t.property_address ? (
          <span className="admr-address" title={t.property_address}>
            <MapPin size={14} />
            <span>{t.property_address}</span>
          </span>
        ) : (
          <span className="admr-muted">No address</span>
        )}
      </span>

      <span className="admr-hide-md">
        {installer ? (
          <span className="admr-installer">
            <span className="admr-installer-icon">
              <HardHat size={14} />
            </span>
            <span className="admr-installer-name">{installer}</span>
          </span>
        ) : (
          <span className="admr-unassigned">Not assigned</span>
        )}
      </span>

      <span className="admr-hide-sm">
        <span className="admr-date">{formatDate(t.created_at)}</span>
      </span>

      <span>
        <span className={`admr-status tone-${badge.tone} ${badge.solid ? 'solid' : ''}`}>
          <BadgeIcon size={12} />
          {t.status_display}
        </span>
      </span>

      <span className="admr-hide-lg">
        <span className={`admr-next ${next.action ? 'action' : ''} ${next.muted ? 'muted' : ''}`}>
          {next.action && <span className="admr-next-dot" />}
          {next.text}
        </span>
      </span>

      <span className="admr-arrow" aria-hidden="true">
        <ChevronRight size={18} />
      </span>
    </div>
  );
}

export default function AdminRequestsPage() {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState([]);
  const [count, setCount] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrevious, setHasPrevious] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeFilter, setActiveFilter] = useState('ALL');
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCounts, setFilterCounts] = useState({});
  const [reloadKey, setReloadKey] = useState(0);

  const currentFilter = FILTERS.find((f) => f.key === activeFilter) || FILTERS[0];

  // Wait a moment after typing before searching
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchTerm(searchInput.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Load the current page of requests
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const data = await getAdminTicketsPage(page, currentFilter.statuses.join(','), searchTerm || null);
        if (cancelled) return;
        setTickets(data.results);
        setCount(data.count);
        setHasNext(Boolean(data.next));
        setHasPrevious(Boolean(data.previous));
        setError('');
      } catch {
        if (!cancelled) setError('Could not load requests. Please try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, activeFilter, searchTerm, reloadKey]);

  // Filter counts - when the page opens and on Refresh
  useEffect(() => {
    let cancelled = false;

    async function loadCounts() {
      try {
        const results = await Promise.all(
          FILTERS.map(async (f) => {
            const data = await getAdminTicketsPage(1, f.statuses.join(','));
            return [f.key, data.count];
          })
        );
        if (!cancelled) setFilterCounts(Object.fromEntries(results));
      } catch {
        // Counts are a nice-to-have; the tabs just show without numbers.
      }
    }

    loadCounts();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  function changeFilter(key) {
    setActiveFilter(key);
    setPage(1);
  }

  function clearAll() {
    setSearchInput('');
    changeFilter('ALL');
  }

  function openTicket(id) {
    navigate(`/admin/requests/${id}`);
  }

  function refresh() {
    setError('');
    setReloadKey((k) => k + 1);
  }

  function goToPage(p) {
    setPage(p);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const rangeStart = count === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, count);
  const hasActiveFilters = activeFilter !== 'ALL' || Boolean(searchTerm);
  const totalCount = filterCounts.ALL;
  const approvalCount = filterCounts.APPROVAL || 0;
  const urgent = approvalCount > 0;

  let heroText;
  if (totalCount === undefined) heroText = 'Every installation request from customers, newest first.';
  else if (urgent)
    heroText = `${approvalCount} request${approvalCount === 1 ? ' is' : 's are'} waiting for your approval · ${totalCount} in total.`;
  else heroText = `${totalCount} request${totalCount === 1 ? '' : 's'} in total. Nothing needs your approval right now.`;

  return (
    <AdminLayout pageTitle="Requests" pageSubtitle="All installation requests from customers">
      <div className="admr-page">
        {/* ---------- Banner ---------- */}
        <section className={`admr-hero ${urgent ? 'urgent' : ''}`}>
          <div className="admr-hero-glow" aria-hidden="true" />
          <div className="admr-hero-icon">{urgent ? <ShieldCheck size={26} /> : <Inbox size={26} />}</div>
          <div className="admr-hero-text">
            <h1>Customer Requests</h1>
            <p>{heroText}</p>
          </div>
          <div className="admr-hero-actions">
            {urgent && activeFilter !== 'APPROVAL' && (
              <button type="button" className="admr-hero-btn gold" onClick={() => changeFilter('APPROVAL')}>
                Review now
                <ArrowRight size={16} />
              </button>
            )}
            <button type="button" className="admr-hero-btn glass" onClick={refresh} disabled={loading}>
              <RefreshCw size={16} className={loading ? 'spin' : ''} />
              Refresh
            </button>
          </div>
        </section>

        {/* ---------- Request list ---------- */}
        <section className="admr-card">
          <div className="admr-card-head">
            <div className="admr-card-title">
              <h2>Request List</h2>
              <p>Click a row to open it. Gold rows are waiting for your approval.</p>
            </div>

            <div className="admr-tools">
              <div className="admr-search">
                <Search size={17} className="admr-search-icon" />
                <input
                  type="text"
                  placeholder="Search name, ticket # or address"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  aria-label="Search requests"
                />
                {searchInput && (
                  <button
                    type="button"
                    className="admr-search-clear"
                    onClick={() => setSearchInput('')}
                    aria-label="Clear search"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              <FilterMenu activeKey={activeFilter} counts={filterCounts} onPick={changeFilter} />
            </div>
          </div>

          {error ? (
            <div className="admr-empty">
              <span className="admr-empty-badge red">
                <AlertCircle size={26} />
              </span>
              <p className="admr-empty-title">Something went wrong</p>
              <p className="admr-empty-hint">{error}</p>
              <button type="button" className="admr-btn-primary" onClick={refresh}>
                <RefreshCw size={15} />
                Try again
              </button>
            </div>
          ) : loading ? (
            <div className="admr-list" role="table">
              <ListHead />
              {Array.from({ length: 6 }).map((_, i) => (
                <RowSkeleton key={i} />
              ))}
            </div>
          ) : tickets.length === 0 ? (
            <div className="admr-empty">
              <span className="admr-empty-badge">
                <Inbox size={26} />
              </span>
              <p className="admr-empty-title">
                {hasActiveFilters ? 'No requests match your search or filter' : 'No requests yet'}
              </p>
              <p className="admr-empty-hint">
                {hasActiveFilters
                  ? 'Try a different name, ticket number, address, or filter.'
                  : 'New customer requests will show up here.'}
              </p>
              {hasActiveFilters && (
                <button type="button" className="admr-btn-secondary" onClick={clearAll}>
                  Show all requests
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="admr-list" role="table">
                <ListHead />
                {tickets.map((t) => (
                  <RequestRow key={t.id} ticket={t} onOpen={openTicket} />
                ))}
              </div>

              <div className="admr-pagination">
                <span className="admr-pagination-info">
                  Showing <strong>{rangeStart}–{rangeEnd}</strong> of <strong>{count}</strong> request
                  {count === 1 ? '' : 's'}
                </span>
                {totalPages > 1 && (
                  <div className="admr-pagination-controls">
                    <button
                      type="button"
                      className="admr-page-btn"
                      disabled={!hasPrevious}
                      onClick={() => goToPage(page - 1)}
                      aria-label="Previous page"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    {getPageNumbers(page, totalPages).map((p, i) =>
                      p === '...' ? (
                        <span key={`gap-${i}`} className="admr-page-gap">…</span>
                      ) : (
                        <button
                          key={p}
                          type="button"
                          className={`admr-page-num ${p === page ? 'active' : ''}`}
                          onClick={() => goToPage(p)}
                        >
                          {p}
                        </button>
                      )
                    )}
                    <button
                      type="button"
                      className="admr-page-btn"
                      disabled={!hasNext}
                      onClick={() => goToPage(page + 1)}
                      aria-label="Next page"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </AdminLayout>
  );
}