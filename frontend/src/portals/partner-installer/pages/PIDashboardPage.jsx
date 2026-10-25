import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  SlidersHorizontal,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  CalendarDays,
  Inbox,
  ArrowRight,
  Check,
  X,
  AlertCircle,
  Clock,
  PartyPopper,
  Sun,
  Moon,
  Sunrise,
  MapPin,
} from 'lucide-react';
import PILayout from '../components/PILayout';
import { getInstallerTickets } from '../../../api/piTickets';
import '../styles/pi-dashboard.css';

const WAITING_STATUSES = ['ASSESSMENT_SUBMITTED', 'STAFF_REVIEW', 'ADMIN_REVIEW'];

// Same colors as the rest of the system
const STATUS_BADGE_CLASS = {
  PI_ASSIGNED: 'pending',
  ASSESSMENT_SUBMITTED: 'review',
  STAFF_REVIEW: 'review',
  ADMIN_REVIEW: 'admin',
  APPROVED: 'approved',
  COMPLETED: 'completed',
  NC_CANNOT_PROCEED: 'not-compatible',
  NC_CAN_REAPPLY: 'not-compatible',
  WITHDRAWN: 'withdrawn',
};

const POLL_INTERVAL_MS = 15000;

// Reads "YYYY-MM-DD" as a local date. new Date("2026-09-17") would be
// read as UTC, which can show the wrong day in the Philippines.
function parseLocalDate(value) {
  if (!value) return null;
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function visitKey(t) {
  return t.visit_date ? t.visit_date.slice(0, 10) : null;
}

function isOverdue(t) {
  const key = visitKey(t);
  return t.status === 'PI_ASSIGNED' && Boolean(key) && key < todayKey();
}

function formatDate(value) {
  const date = parseLocalDate(value);
  if (!date) return '—';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Days from today: 0 = today, 1 = tomorrow, -2 = 2 days ago
function daysFromToday(value) {
  const date = parseLocalDate(value);
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((date - today) / 86400000);
}

function timeAgo(value) {
  if (!value) return '';
  const diff = Date.now() - new Date(value).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hr${hours > 1 ? 's' : ''} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days > 1 ? 's' : ''} ago`;
  return new Date(value).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length > 1) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return { text: 'Good morning', icon: Sunrise };
  if (h < 18) return { text: 'Good afternoon', icon: Sun };
  return { text: 'Good evening', icon: Moon };
}

function customerName(t) {
  return t.full_name || t.customer_username || 'Customer';
}

// Filter options for the Recent Tickets list
const FILTER_OPTIONS = [
  { key: 'ALL', label: 'All', tone: 'navy', match: () => true },
  { key: 'TO_VISIT', label: 'To Visit', tone: 'amber', match: (t) => t.status === 'PI_ASSIGNED' && !isOverdue(t) },
  { key: 'OVERDUE', label: 'Overdue', tone: 'red', match: (t) => isOverdue(t) },
  { key: 'WAITING', label: 'Waiting for Review', tone: 'violet', match: (t) => WAITING_STATUSES.includes(t.status) },
  { key: 'APPROVED', label: 'Approved', tone: 'green-light', match: (t) => t.status === 'APPROVED' },
  { key: 'COMPLETED', label: 'Completed', tone: 'green', match: (t) => t.status === 'COMPLETED' },
  { key: 'NOT_COMPATIBLE', label: 'Not Compatible', tone: 'red', match: (t) => t.status === 'NC_CANNOT_PROCEED' || t.status === 'NC_CAN_REAPPLY' },
  { key: 'WITHDRAWN', label: 'Withdrawn', tone: 'gray', match: (t) => t.status === 'WITHDRAWN' },
];

/* ------------------------------------------------------------------ */

function RecentRowSkeleton() {
  return (
    <div className="pid-row pid-row-skeleton">
      <span className="pid-skel-customer">
        <span className="pid-skel pid-skel-avatar" />
        <span className="pid-skel-stack">
          <span className="pid-skel pid-skel-w-md" />
          <span className="pid-skel pid-skel-w-sm" />
        </span>
      </span>
      <span className="pid-skel pid-skel-w-sm" />
      <span className="pid-skel pid-skel-w-sm" />
      <span className="pid-skel pid-skel-pill" />
    </div>
  );
}

// Filter button with a gold indicator and count when a filter is on
function FilterDropdown({ value, counts, onChange }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    function handleKey(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, []);

  const current = FILTER_OPTIONS.find((o) => o.key === value) || FILTER_OPTIONS[0];
  const isFiltered = value !== 'ALL';

  function pick(key) {
    onChange(key);
    setOpen(false);
  }

  return (
    <div className="pid-filter" ref={wrapRef}>
      <button
        type="button"
        className={`pid-filter-btn ${open ? 'open' : ''} ${isFiltered ? 'filtered' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <SlidersHorizontal size={15} />
        <span>{current.label}</span>
        {isFiltered && <span className="pid-filter-indicator">{counts[value]}</span>}
        <ChevronDown size={15} className="pid-filter-chevron" />
      </button>

      {open && (
        <div className="pid-filter-menu" role="listbox">
          <p className="pid-filter-menu-title">Filter by status</p>
          <div className="pid-filter-list">
            {FILTER_OPTIONS.map((o) => {
              const selected = o.key === value;
              return (
                <button
                  key={o.key}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={`pid-filter-option ${selected ? 'selected' : ''}`}
                  onClick={() => pick(o.key)}
                >
                  <span className={`pid-dot tone-${o.tone}`} />
                  <span className="pid-filter-option-label">{o.label}</span>
                  <span className="pid-filter-option-count">{counts[o.key]}</span>
                  <span className="pid-filter-check">{selected && <Check size={15} />}</span>
                </button>
              );
            })}
          </div>
          {isFiltered && (
            <button type="button" className="pid-filter-reset" onClick={() => pick('ALL')}>
              <X size={14} />
              Clear filter
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Visit date cell: date on top, then "Overdue", "Today" or "In 3 days"
function VisitCell({ ticket }) {
  if (!ticket.visit_date) return <span className="pid-muted">Not set</span>;
  const days = daysFromToday(ticket.visit_date);
  const waiting = ticket.status === 'PI_ASSIGNED';

  let flag = null;
  if (waiting && days < 0) {
    flag = (
      <span className="pid-visit-flag overdue">
        <Clock size={11} />
        Overdue · {Math.abs(days)}d
      </span>
    );
  } else if (waiting && days === 0) {
    flag = <span className="pid-visit-flag today">Visit today</span>;
  } else if (waiting && days > 0) {
    flag = <span className="pid-visit-sub">{days === 1 ? 'Tomorrow' : `In ${days} days`}</span>;
  }

  return (
    <span className="pid-visit-cell">
      <span className="pid-visit-date">{formatDate(ticket.visit_date)}</span>
      {flag}
    </span>
  );
}

/* ------------------------------------------------------------------ */

export default function PIDashboardPage() {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterKey, setFilterKey] = useState('ALL');
  const [reloadKey, setReloadKey] = useState(0);
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load(isInitial) {
      try {
        if (isInitial) setLoading(true);
        const data = await getInstallerTickets();
        if (cancelled) return;
        setTickets(data);
        setLastUpdated(new Date());
        if (isInitial) setError('');
      } catch {
        if (isInitial && !cancelled) setError('Could not load your tickets. Please try again.');
      } finally {
        if (isInitial && !cancelled) setLoading(false);
      }
    }

    load(true);
    const interval = setInterval(() => load(false), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [reloadKey]);

  const today = todayKey();
  const overdue = tickets.filter(isOverdue);
  const toVisit = tickets.filter((t) => t.status === 'PI_ASSIGNED' && !isOverdue(t));

  const filterCounts = Object.fromEntries(
    FILTER_OPTIONS.map((o) => [o.key, tickets.filter((t) => o.match(t)).length])
  );
  const currentFilter = FILTER_OPTIONS.find((o) => o.key === filterKey) || FILTER_OPTIONS[0];

  const recentTickets = [...tickets]
    .filter((t) => currentFilter.match(t))
    .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
    .slice(0, 8);

  // Things to act on: overdue first (oldest first), then visits today, then the rest
  const needsAction = tickets
    .filter((t) => t.status === 'PI_ASSIGNED')
    .map((t) => {
      const key = visitKey(t);
      let kind = 'visit';
      if (key && key < today) kind = 'overdue';
      else if (key === today) kind = 'today';
      return { ticket: t, kind };
    })
    .sort((a, b) => {
      const order = { overdue: 0, today: 1, visit: 2 };
      if (order[a.kind] !== order[b.kind]) return order[a.kind] - order[b.kind];
      return (visitKey(a.ticket) || '9999').localeCompare(visitKey(b.ticket) || '9999');
    });

  // Site visits from today onwards
  const upcomingVisits = tickets
    .filter((t) => t.status === 'PI_ASSIGNED' && visitKey(t) && visitKey(t) >= today)
    .sort((a, b) => visitKey(a).localeCompare(visitKey(b)))
    .slice(0, 4);

  const username = localStorage.getItem('username') || 'there';
  const hello = greeting();
  const HelloIcon = hello.icon;
  const todayText = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  let heroLine = 'Everything is up to date. New assignments from Staff will show up here.';
  if (!loading && (overdue.length > 0 || toVisit.length > 0)) {
    const parts = [];
    if (toVisit.length > 0) parts.push(`${toVisit.length} site visit${toVisit.length > 1 ? 's' : ''} to do`);
    if (overdue.length > 0) parts.push(`${overdue.length} overdue assessment${overdue.length > 1 ? 's' : ''}`);
    heroLine = `You have ${parts.join(' and ')}.`;
  }

  function goToTicket(id) {
    navigate(`/partner-installer/incoming-tickets/${id}`);
  }

  function handleViewOverdue() {
    if (overdue.length === 1) goToTicket(overdue[0].id);
    else setFilterKey('OVERDUE');
  }

  function rowKeyDown(e, id) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      goToTicket(id);
    }
  }

  return (
    <PILayout pageTitle="Dashboard" pageSubtitle="Your site visits and assessments">
      <div className="pid-page">
        {error && !loading ? (
          <div className="pid-card">
            <div className="pid-empty">
              <span className="pid-empty-badge red">
                <AlertCircle size={26} />
              </span>
              <p className="pid-empty-title">Something went wrong</p>
              <p className="pid-empty-hint">{error}</p>
              <button type="button" className="pid-btn-primary" onClick={() => setReloadKey((k) => k + 1)}>
                Try again
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* ---------- Welcome banner ---------- */}
            <section className="pid-hero">
              <div className="pid-hero-glow" aria-hidden="true" />
              <div className="pid-hero-text">
                <span className="pid-hero-date">
                  <HelloIcon size={14} />
                  {todayText}
                </span>
                <h1>
                  {hello.text}, <span>{username}</span>
                </h1>
                <p>{loading ? "Loading today's work..." : heroLine}</p>
              </div>
              <div className="pid-hero-actions">
                <button
                  type="button"
                  className="pid-hero-btn gold"
                  onClick={() => navigate('/partner-installer/incoming-tickets')}
                >
                  <ClipboardList size={16} />
                  My tickets
                </button>
                <button
                  type="button"
                  className="pid-hero-btn glass"
                  onClick={() => navigate('/partner-installer/calendar')}
                >
                  <CalendarDays size={16} />
                  Calendar
                </button>
              </div>
            </section>

            {/* ---------- Overdue assessments ---------- */}
            {!loading && overdue.length > 0 && (
              <div className="pid-alert">
                <span className="pid-alert-icon">
                  <AlertTriangle size={20} />
                </span>
                <div className="pid-alert-text">
                  <p className="pid-alert-title">
                    {overdue.length} assessment{overdue.length > 1 ? 's' : ''} overdue
                  </p>
                  <p className="pid-alert-sub">The visit date has passed. Open the ticket and send the roof assessment.</p>
                </div>
                <button type="button" className="pid-alert-btn" onClick={handleViewOverdue}>
                  {overdue.length === 1 ? 'Open ticket' : 'Show them'}
                  <ArrowRight size={15} />
                </button>
              </div>
            )}

            {/* ---------- Main grid ---------- */}
            <div className="pid-grid">
              {/* Recent tickets */}
              <section className="pid-card pid-recent">
                <div className="pid-card-head">
                  <div>
                    <h2>Recent Tickets</h2>
                    <p>
                      {filterKey === 'ALL'
                        ? 'The latest 8 tickets that were updated'
                        : `Latest ${currentFilter.label.toLowerCase()} · ${filterCounts[filterKey]} in total`}
                      {lastUpdated && <span className="pid-live"> · Live, refreshes every 15s</span>}
                    </p>
                  </div>
                  <div className="pid-card-controls">
                    <button
                      type="button"
                      className="pid-view-all"
                      onClick={() => navigate('/partner-installer/incoming-tickets')}
                    >
                      View All Tickets
                      <ArrowRight size={15} />
                    </button>
                    <FilterDropdown value={filterKey} counts={filterCounts} onChange={setFilterKey} />
                  </div>
                </div>

                <div className="pid-table">
                  <div className="pid-row pid-row-head">
                    <span>Customer</span>
                    <span>Visit Date</span>
                    <span>Updated</span>
                    <span>Status</span>
                  </div>

                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => <RecentRowSkeleton key={i} />)
                  ) : recentTickets.length === 0 ? (
                    <div className="pid-empty">
                      <span className="pid-empty-badge">
                        <Inbox size={26} />
                      </span>
                      <p className="pid-empty-title">
                        {filterKey === 'ALL' ? 'No tickets assigned yet' : 'Nothing here right now'}
                      </p>
                      <p className="pid-empty-hint">
                        {filterKey === 'ALL'
                          ? 'New assignments from Staff will show up here.'
                          : `No ${currentFilter.label.toLowerCase()} tickets right now.`}
                      </p>
                      {filterKey !== 'ALL' && (
                        <button type="button" className="pid-btn-secondary" onClick={() => setFilterKey('ALL')}>
                          Show all
                        </button>
                      )}
                    </div>
                  ) : (
                    recentTickets.map((t) => {
                      const badgeClass = STATUS_BADGE_CLASS[t.status] || 'review';
                      const name = customerName(t);
                      return (
                        <div
                          className={`pid-row pid-row-click ${isOverdue(t) ? 'is-overdue' : ''}`}
                          key={t.id}
                          onClick={() => goToTicket(t.id)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => rowKeyDown(e, t.id)}
                        >
                          <span className="pid-customer">
                            <span className="pid-avatar">{getInitials(name)}</span>
                            <span className="pid-customer-text">
                              <span className="pid-customer-name">{name}</span>
                              <span className="pid-ticket-no">
                                {t.ticket_number}
                                {t.solar_package && <> · {t.solar_package}</>}
                              </span>
                              {/* Visit date shows here on phones */}
                              <span className="pid-inline-visit">
                                <VisitCell ticket={t} />
                              </span>
                            </span>
                          </span>
                          <span className="pid-visit-col">
                            <VisitCell ticket={t} />
                          </span>
                          <span className="pid-updated" title={formatDate(t.updated_at)}>
                            {timeAgo(t.updated_at)}
                          </span>
                          <span>
                            <span className={`pid-badge ${badgeClass}`}>
                              <span className="pid-badge-dot" />
                              {t.status_display}
                            </span>
                          </span>
                          <ChevronRight size={17} className="pid-row-arrow" />
                        </div>
                      );
                    })
                  )}
                </div>
              </section>

              {/* Side column */}
              <aside className="pid-side">
                {/* Needs attention */}
                <section className="pid-card pid-todo">
                  <div className="pid-side-head">
                    <h2>Needs your attention</h2>
                    {!loading && needsAction.length > 0 && <span className="pid-count">{needsAction.length}</span>}
                  </div>

                  {loading ? (
                    <div className="pid-skel-stack">
                      <span className="pid-skel pid-skel-todo" />
                      <span className="pid-skel pid-skel-todo" />
                    </div>
                  ) : needsAction.length === 0 ? (
                    <div className="pid-allclear">
                      <PartyPopper size={22} />
                      <div>
                        <strong>All caught up</strong>
                        <span>No site visits or assessments waiting on you.</span>
                      </div>
                    </div>
                  ) : (
                    <ul className="pid-todo-list">
                      {needsAction.slice(0, 5).map(({ ticket, kind }) => {
                        const days = daysFromToday(ticket.visit_date);
                        let label = 'No visit date yet';
                        let when = '—';
                        if (kind === 'overdue') {
                          label = 'Send roof assessment';
                          when = `${Math.abs(days)}d late`;
                        } else if (kind === 'today') {
                          label = 'Site visit today';
                          when = 'Today';
                        } else if (ticket.visit_date) {
                          label = `Visit on ${formatDate(ticket.visit_date)}`;
                          when = days === 1 ? 'Tomorrow' : `${days}d`;
                        }
                        return (
                          <li key={ticket.id}>
                            <button type="button" className="pid-todo-item" onClick={() => goToTicket(ticket.id)}>
                              <span className={`pid-todo-icon ${kind}`}>
                                {kind === 'overdue' ? <AlertTriangle size={15} /> : <MapPin size={15} />}
                              </span>
                              <span className="pid-todo-text">
                                <strong>{customerName(ticket)}</strong>
                                <span>
                                  {ticket.ticket_number} · {label}
                                </span>
                              </span>
                              <span className={`pid-wait ${kind === 'overdue' ? 'late' : kind === 'today' ? 'soon' : ''}`}>
                                <Clock size={11} />
                                {when}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {!loading && needsAction.length > 5 && (
                    <button
                      type="button"
                      className="pid-side-link"
                      onClick={() => navigate('/partner-installer/incoming-tickets')}
                    >
                      See all {needsAction.length} <ArrowRight size={14} />
                    </button>
                  )}
                </section>

                {/* Upcoming visits */}
                <section className="pid-card">
                  <div className="pid-side-head">
                    <h2>Upcoming site visits</h2>
                    <button
                      type="button"
                      className="pid-side-link small"
                      onClick={() => navigate('/partner-installer/calendar')}
                    >
                      Calendar <ArrowRight size={13} />
                    </button>
                  </div>
                  {loading ? (
                    <div className="pid-skel-stack">
                      <span className="pid-skel pid-skel-todo" />
                    </div>
                  ) : upcomingVisits.length === 0 ? (
                    <p className="pid-side-empty">
                      <CalendarDays size={16} />
                      No visits scheduled yet.
                    </p>
                  ) : (
                    <ul className="pid-visits">
                      {upcomingVisits.map((t) => {
                        const d = parseLocalDate(t.visit_date);
                        const left = daysFromToday(t.visit_date);
                        return (
                          <li key={t.id}>
                            <button type="button" className="pid-visit" onClick={() => goToTicket(t.id)}>
                              <span className="pid-visit-cal">
                                <span>{d.toLocaleDateString('en-US', { month: 'short' })}</span>
                                <strong>{d.getDate()}</strong>
                              </span>
                              <span className="pid-visit-text">
                                <strong>{customerName(t)}</strong>
                                <span>{t.property_address || t.ticket_number}</span>
                              </span>
                              <span className={`pid-visit-when ${left <= 1 ? 'soon' : ''}`}>
                                {left === 0 ? 'Today' : left === 1 ? 'Tomorrow' : `In ${left} days`}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              </aside>
            </div>
          </>
        )}
      </div>
    </PILayout>
  );
}