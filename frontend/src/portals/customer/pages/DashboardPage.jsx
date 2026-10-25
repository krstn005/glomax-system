import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Sun,
  Sunrise,
  Moon,
  Inbox,
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  XCircle,
  Receipt,
  ChevronRight,
  ChevronDown,
  MapPin,
  CalendarDays,
  RotateCcw,
  SlidersHorizontal,
  X,
  HardHat,
  Package,
  Lightbulb,
  Star,
  SearchX,
} from 'lucide-react';
import { getMyTickets, withdrawTicket } from '../../../api/tickets';
import { formatCurrency } from '../../../utils/currency';
import CustomerLayout from '../components/CustomerLayout';
import '../styles/dashboard.css';

const STATUS_STEPS = [
  { key: 'REQUEST_SUBMITTED', label: 'Submitted' },
  { key: 'PI_ASSIGNED', label: 'Installer Assigned' },
  { key: 'ASSESSMENT_SUBMITTED', label: 'Assessment Submitted' },
  { key: 'STAFF_REVIEW', label: 'Staff Review' },
  { key: 'ADMIN_REVIEW', label: 'Admin Review' },
  { key: 'APPROVED', label: 'Approved' },
];

const ACTIVE_STATUSES = ['REQUEST_SUBMITTED', 'PI_ASSIGNED', 'ASSESSMENT_SUBMITTED', 'STAFF_REVIEW', 'ADMIN_REVIEW'];

// A ticket stops being the dashboard's "Active Request" once it
// reaches one of these - matches NewRequestPage's RESOLVED_STATUSES,
// so a Customer isn't shown a stale card for a ticket that's already
// fully done (Completed included).
const RESOLVED_STATUSES = ['APPROVED', 'COMPLETED', 'WITHDRAWN', 'NC_CANNOT_PROCEED'];

// Same badge colours as the Staff, PI and Admin portals
const STATUS_TONE = {
  REQUEST_SUBMITTED: 'navy',
  PI_ASSIGNED: 'amber',
  ASSESSMENT_SUBMITTED: 'blue',
  STAFF_REVIEW: 'violet',
  ADMIN_REVIEW: 'indigo',
  APPROVED: 'green',
  COMPLETED: 'done',
  WITHDRAWN: 'gray',
  NC_CANNOT_PROCEED: 'red',
  NC_CAN_REAPPLY: 'red',
};

function toneOf(status) {
  return STATUS_TONE[status] || 'blue';
}

// Filter choices for the Recent Requests list (instead of number cards)
const FILTER_OPTIONS = [
  { key: 'ALL', label: 'All requests', tone: 'navy', match: () => true },
  { key: 'ACTIVE', label: 'In progress', tone: 'blue', match: (t) => ACTIVE_STATUSES.includes(t.status) },
  {
    key: 'APPROVED',
    label: 'Approved and completed',
    tone: 'green',
    match: (t) => t.status === 'APPROVED' || t.status === 'COMPLETED',
  },
  {
    key: 'NOT_COMPATIBLE',
    label: 'Not compatible',
    tone: 'red',
    match: (t) => t.status === 'NC_CANNOT_PROCEED' || t.status === 'NC_CAN_REAPPLY',
  },
  { key: 'WITHDRAWN', label: 'Withdrawn', tone: 'gray', match: (t) => t.status === 'WITHDRAWN' },
];

const RECENT_LIMIT = 5;

// What happens next, in plain words, for the "What's next" card
const NEXT_STEP = {
  REQUEST_SUBMITTED: {
    title: 'We got your request',
    text: "Our staff is checking it now. Next, we'll assign a Partner Installer and set your site visit. You can still withdraw while it's at this step.",
  },
  PI_ASSIGNED: {
    title: 'Site visit is coming up',
    text: 'A Partner Installer will visit your property to check your roof. Please make sure someone is home on the visit date.',
  },
  ASSESSMENT_SUBMITTED: {
    title: 'Roof check is done',
    text: 'The installer sent the roof assessment. Our staff will look at it next and prepare your quotation.',
  },
  STAFF_REVIEW: {
    title: 'Staff is reviewing',
    text: 'Our staff is going over the roof assessment and your quotation. We will let you know once it moves to the final check.',
  },
  ADMIN_REVIEW: {
    title: 'Final check',
    text: "Your request is in the last check by our admin. You'll be notified as soon as it's approved.",
  },
  NC_CAN_REAPPLY: {
    title: 'Your property needs some changes',
    text: 'Read the note from our team. Once the changes are done, you can reapply using the same request.',
  },
};

// Reads "YYYY-MM-DD" as a local date (new Date("2026-10-15") would be read as UTC)
function parseLocalDate(value) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(value);
}

function formatDate(value) {
  const date = parseLocalDate(value);
  if (!date || Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function daysFromToday(value) {
  const date = parseLocalDate(value);
  if (!date) return null;
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((day - today) / 86400000);
}

function whenText(value) {
  const diff = daysFromToday(value);
  if (diff === null) return '';
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff > 1) return `In ${diff} days`;
  if (diff === -1) return 'Yesterday';
  return `${Math.abs(diff)} days ago`;
}

function timeAgo(value) {
  if (!value) return '';
  const diff = daysFromToday(value);
  if (diff === 0) return 'Today';
  if (diff === -1) return 'Yesterday';
  const days = Math.abs(diff);
  if (days < 30) return `${days} days ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;
  const years = Math.round(days / 365);
  return `${years} year${years === 1 ? '' : 's'} ago`;
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return { text: 'Good morning', icon: Sunrise };
  if (hour < 18) return { text: 'Good afternoon', icon: Sun };
  return { text: 'Good evening', icon: Moon };
}

// The kW number of a package, e.g. "6KW Hybrid" -> "6"
function packageKw(pkg) {
  const match = (pkg || '').match(/(\d+(?:\.\d+)?)\s*kw/i);
  return match ? match[1] : '';
}

function DashboardSkeleton() {
  return (
    <>
      <span className="db-skel db-skel-active" />
      <div className="db-grid">
        <span className="db-skel db-skel-list" />
        <div className="db-side">
          <span className="db-skel db-skel-side" />
        </div>
      </div>
    </>
  );
}

// Filter button with a gold count when a filter is on (same as the PI and Staff dashboards)
function FilterDropdown({ value, counts, onChange }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
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
  }, [open]);

  const isFiltered = value !== 'ALL';
  const current = FILTER_OPTIONS.find((o) => o.key === value) || FILTER_OPTIONS[0];

  function pick(key) {
    onChange(key);
    setOpen(false);
  }

  return (
    <div className="db-filter" ref={wrapRef}>
      <button
        type="button"
        className={`db-filter-btn ${open ? 'open' : ''} ${isFiltered ? 'filtered' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={isFiltered ? `Filter: ${current.label}` : 'Filter requests'}
      >
        <SlidersHorizontal size={15} />
        <span className="db-filter-text">{isFiltered ? current.label : 'All'}</span>
        {isFiltered && <span className="db-filter-indicator">{counts[value]}</span>}
        <ChevronDown size={15} className="db-filter-chevron" />
      </button>

      {open && (
        <div className="db-filter-menu" role="listbox">
          <p className="db-filter-menu-title">Filter by status</p>
          <div className="db-filter-list">
            {FILTER_OPTIONS.map((o) => {
              const selected = o.key === value;
              return (
                <button
                  key={o.key}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={`db-filter-option ${selected ? 'selected' : ''}`}
                  onClick={() => pick(o.key)}
                >
                  <span className={`db-dot tone-${o.tone}`} />
                  <span className="db-filter-option-label">{o.label}</span>
                  <span className="db-filter-option-count">{counts[o.key]}</span>
                  <span className="db-filter-check">{selected && <Check size={15} />}</span>
                </button>
              );
            })}
          </div>
          {isFiltered && (
            <button type="button" className="db-filter-reset" onClick={() => pick('ALL')}>
              <X size={14} />
              Clear filter
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ ticket }) {
  return (
    <span className={`db-status tone-${toneOf(ticket.status)}`}>
      <span className="db-status-dot" />
      <span className="db-status-text">{ticket.status_display}</span>
    </span>
  );
}

function InfoBox({ icon: Icon, label, value, sub, muted }) {
  return (
    <div className="db-info">
      <span className="db-info-icon">
        <Icon size={16} />
      </span>
      <div className="db-info-text">
        <span className="db-info-label">{label}</span>
        <span className={`db-info-value ${muted ? 'muted' : ''}`}>{value}</span>
        {sub && <span className="db-info-sub">{sub}</span>}
      </div>
    </div>
  );
}

function WithdrawModal({ ticketNumber, busy, onCancel, onConfirm }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape' && !busy) onCancel();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onCancel]);

  return (
    <div className="db-modal-overlay" onClick={() => !busy && onCancel()}>
      <div className="db-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="db-modal-icon">
          <XCircle size={22} />
        </div>
        <h3>Withdraw Request?</h3>
        <p>
          Are you sure you want to withdraw <strong>{ticketNumber}</strong>? This can't be undone, but you can submit a
          new request anytime.
        </p>
        <div className="db-modal-actions">
          <button type="button" className="db-btn-secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="db-btn-danger" onClick={onConfirm} disabled={busy}>
            {busy ? 'Withdrawing...' : 'Withdraw'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Toast({ message, type = 'success', onDone }) {
  useEffect(() => {
    const timer = setTimeout(onDone, 4000);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <div className={`db-toast ${type}`} role="status">
      {type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
      {message}
    </div>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [toast, setToast] = useState(null);
  const [filterKey, setFilterKey] = useState('ALL');

  useEffect(() => {
    loadTickets();
  }, []);

  // silent = refresh in the background without showing the skeleton again
  async function loadTickets({ silent = false } = {}) {
    try {
      if (!silent) setLoading(true);
      const data = await getMyTickets();
      setTickets(data);
      setError('');
    } catch {
      if (!silent) setError('Could not load your requests. Please try again.');
    } finally {
      if (!silent) setLoading(false);
    }
  }

  const activeTicket = tickets.find((t) => !RESOLVED_STATUSES.includes(t.status));

  const sortedTickets = [...tickets].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const filterCounts = Object.fromEntries(
    FILTER_OPTIONS.map((o) => [o.key, tickets.filter((t) => o.match(t)).length])
  );
  const currentFilter = FILTER_OPTIONS.find((o) => o.key === filterKey) || FILTER_OPTIONS[0];
  const recentTickets = sortedTickets.filter((t) => currentFilter.match(t)).slice(0, RECENT_LIMIT);

  // A finished job that still has no feedback
  const needsFeedback = tickets.find((t) => t.status === 'COMPLETED' && !t.feedback);

  const firstName = (localStorage.getItem('username') || 'there').split(' ')[0];
  const hello = greeting();
  const HelloIcon = hello.icon;
  const todayLabel = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const currentStepIndex = activeTicket ? STATUS_STEPS.findIndex((s) => s.key === activeTicket.status) : -1;
  const nextStep = activeTicket ? NEXT_STEP[activeTicket.status] : null;
  const hasVisit = activeTicket?.status === 'PI_ASSIGNED' && activeTicket.visit_date;
  const visitDiff = hasVisit ? daysFromToday(activeTicket.visit_date) : null;

  const initialQuotes = activeTicket?.quotations?.filter((q) => q.quotation_type === 'INITIAL') || [];
  const updatedQuotes = activeTicket?.quotations?.filter((q) => q.quotation_type === 'UPDATED') || [];
  const quotes = [
    ...initialQuotes.map((q) => ({ ...q, title: 'Initial Quotation' })),
    ...updatedQuotes.map((q) => ({ ...q, title: 'Updated Quotation' })),
  ];
  const latestQuoteId = quotes.length ? quotes[quotes.length - 1].id : null;

  async function performWithdraw() {
    if (!activeTicket) return;
    setWithdrawing(true);
    try {
      await withdrawTicket(activeTicket.id);
      await loadTickets({ silent: true });
      // Tell the sidebar, so its New Request button shows again
      window.dispatchEvent(new Event('customer-tickets-changed'));
      setToast({ message: 'Your request has been withdrawn.', type: 'success' });
    } catch {
      setToast({ message: 'Could not withdraw your request. Please try again.', type: 'error' });
    } finally {
      setWithdrawing(false);
      setShowWithdraw(false);
    }
  }

  function openTicketPage(ticket) {
    if (RESOLVED_STATUSES.includes(ticket.status)) {
      navigate('/past-requests');
    } else {
      navigate('/request-status');
    }
  }

  function rowKeyDown(e, ticket) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openTicketPage(ticket);
    }
  }

  let heroText = "Here's an overview of your roof assessment requests.";
  if (!loading && !error) {
    if (activeTicket) {
      heroText = `Your request ${activeTicket.ticket_number} is at ${activeTicket.status_display}.`;
    } else if (tickets.length > 0) {
      heroText = 'You have no request in progress right now. Ready for your next one?';
    } else {
      heroText = 'Welcome to Glomax Solar. Start your first request to book a roof assessment.';
    }
  }

  return (
    <CustomerLayout>
      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}

      <div className="db-page">
        {/* ---------- Welcome banner ---------- */}
        <section className="db-hero">
          <span className="db-hero-glow" aria-hidden="true" />
          <div className="db-hero-text">
            <span className="db-hero-date">
              <HelloIcon size={14} />
              {todayLabel}
            </span>
            <h1>
              {hello.text}, <span>{firstName}</span>
            </h1>
            <p>{heroText}</p>
          </div>
        </section>

        {loading && <DashboardSkeleton />}

        {!loading && error && (
          <div className="db-card">
            <div className="db-empty">
              <span className="db-empty-badge red">
                <AlertCircle size={26} />
              </span>
              <p className="db-empty-title">Something went wrong</p>
              <p className="db-empty-hint">{error}</p>
              <button type="button" className="db-btn-primary" onClick={() => loadTickets()}>
                Try again
              </button>
            </div>
          </div>
        )}

        {!loading && !error && (
          <>
            {/* ---------- Alert boxes (same as the other portals) ---------- */}
            {activeTicket?.status === 'NC_CAN_REAPPLY' && (
              <div className="db-alert red">
                <span className="db-alert-icon">
                  <AlertTriangle size={20} />
                </span>
                <div className="db-alert-text">
                  <p className="db-alert-title">{activeTicket.ticket_number} needs changes before it can go on</p>
                  <p className="db-alert-sub">
                    {activeTicket.admin_revision_notes || 'Our team found something that needs fixing first.'}
                  </p>
                </div>
              </div>
            )}

            {hasVisit && visitDiff !== null && visitDiff >= 0 && visitDiff <= 7 && (
              <div className="db-alert gold">
                <span className="db-alert-icon">
                  <CalendarDays size={20} />
                </span>
                <div className="db-alert-text">
                  <p className="db-alert-title">
                    Site visit {visitDiff === 0 ? 'today' : visitDiff === 1 ? 'tomorrow' : `in ${visitDiff} days`}
                  </p>
                  <p className="db-alert-sub">
                    {activeTicket.partner_installer_username
                      ? `${activeTicket.partner_installer_username} will check your roof on ${formatDate(activeTicket.visit_date)}.`
                      : `Your roof will be checked on ${formatDate(activeTicket.visit_date)}.`}{' '}
                    Please make sure someone is home.
                  </p>
                </div>
              </div>
            )}

            {needsFeedback && (
              <div className="db-alert gold">
                <span className="db-alert-icon">
                  <Star size={20} />
                </span>
                <div className="db-alert-text">
                  <p className="db-alert-title">Your installation is done. How did we do?</p>
                  <p className="db-alert-sub">
                    Tell us about {needsFeedback.ticket_number}. It only takes a minute and helps us improve.
                  </p>
                </div>
                <Link to="/feedback" className="db-alert-btn">
                  <Star size={15} />
                  Give Feedback
                </Link>
              </div>
            )}

            {/* ---------- Active request ---------- */}
            {activeTicket && (
              <section className="db-card db-active">
                <div className="db-active-head">
                  <span className="db-active-icon">
                    <Sun size={22} />
                  </span>
                  <div className="db-active-text">
                    <p className="db-active-kicker">Active Request</p>
                    <p className="db-active-title">
                      {activeTicket.ticket_number}
                      <StatusBadge ticket={activeTicket} />
                    </p>
                    <p className="db-active-meta">
                      {activeTicket.property_address && (
                        <span>
                          <MapPin size={13} />
                          <span className="db-ellipsis">{activeTicket.property_address}</span>
                        </span>
                      )}
                      <span>
                        <CalendarDays size={13} />
                        Submitted {formatDate(activeTicket.created_at)}
                      </span>
                    </p>
                  </div>
                  <div className="db-active-actions">
                    {activeTicket.status === 'REQUEST_SUBMITTED' && (
                      <button
                        type="button"
                        className="db-btn-outline-red"
                        disabled={withdrawing}
                        onClick={() => setShowWithdraw(true)}
                      >
                        Withdraw
                      </button>
                    )}
                    {activeTicket.status === 'NC_CAN_REAPPLY' && (
                      <Link className="db-btn-outline" to="/new-request">
                        <RotateCcw size={15} />
                        Reapply
                      </Link>
                    )}
                    <Link className="db-btn-gold" to="/request-status">
                      View Status
                    </Link>
                  </div>
                </div>

                {currentStepIndex >= 0 && (
                  <div className="db-steps-wrap">
                    <ol className="db-steps" aria-label="Request progress">
                      {STATUS_STEPS.map((step, index) => {
                        let state = 'todo';
                        if (index < currentStepIndex) state = 'done';
                        if (index === currentStepIndex) state = 'current';
                        return (
                          <li key={step.key} className={`db-step ${state}`}>
                            <span className="db-step-dot">{state === 'done' ? <Check size={13} /> : index + 1}</span>
                            <span className="db-step-label">{step.label}</span>
                          </li>
                        );
                      })}
                    </ol>
                    <p className="db-steps-now">
                      Step {currentStepIndex + 1} of {STATUS_STEPS.length} ·{' '}
                      <strong>{STATUS_STEPS[currentStepIndex].label}</strong>
                    </p>
                  </div>
                )}

                <div className="db-info-row">
                  <InfoBox
                    icon={Package}
                    label="Package"
                    value={activeTicket.solar_package || 'Not picked yet'}
                    muted={!activeTicket.solar_package}
                  />
                  <InfoBox
                    icon={HardHat}
                    label="Partner Installer"
                    value={activeTicket.partner_installer_username || 'Not assigned yet'}
                    muted={!activeTicket.partner_installer_username}
                  />
                  <InfoBox
                    icon={CalendarDays}
                    label="Site Visit"
                    value={activeTicket.visit_date ? formatDate(activeTicket.visit_date) : 'Not set yet'}
                    sub={activeTicket.visit_date ? whenText(activeTicket.visit_date) : ''}
                    muted={!activeTicket.visit_date}
                  />
                </div>

                {quotes.length > 0 && (
                  <div className="db-quotes">
                    {quotes.map((q) => {
                      const latest = q.id === latestQuoteId && quotes.length > 1;
                      return (
                        <div key={q.id} className={`db-quote ${latest ? 'latest' : ''}`}>
                          <span className="db-quote-icon">
                            <Receipt size={17} />
                          </span>
                          <div className="db-quote-text">
                            <p className="db-quote-title">
                              {q.title}
                              {latest && <span className="db-latest-tag">Latest</span>}
                            </p>
                            <p className="db-quote-cost">{formatCurrency(q.estimated_cost)}</p>
                            {q.payment_terms_description && (
                              <p className="db-quote-terms">{q.payment_terms_description}</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            <div className="db-grid">
              {/* ---------- Recent requests ---------- */}
              <section className="db-card db-recent">
                <div className="db-card-head">
                  <div>
                    <h2>Recent Requests</h2>
                    <p>
                      {filterKey === 'ALL'
                        ? `Your latest ${RECENT_LIMIT} requests. Click one to see more.`
                        : `${currentFilter.label} · ${filterCounts[filterKey]} in total`}
                    </p>
                  </div>
                  {tickets.length > 0 && (
                    <div className="db-card-controls">
                      <Link to="/past-requests" className="db-view-all">
                        View All
                      </Link>
                      <FilterDropdown value={filterKey} counts={filterCounts} onChange={setFilterKey} />
                    </div>
                  )}
                </div>

                {recentTickets.length === 0 ? (
                  <div className="db-empty">
                    <span className="db-empty-badge">
                      {filterKey === 'ALL' ? <Inbox size={26} /> : <SearchX size={26} />}
                    </span>
                    <p className="db-empty-title">{filterKey === 'ALL' ? 'No requests yet' : 'Nothing here'}</p>
                    <p className="db-empty-hint">
                      {filterKey === 'ALL'
                        ? 'Submit your first roof assessment request to get started.'
                        : `You have no ${currentFilter.label.toLowerCase()} requests.`}
                    </p>
                    {filterKey !== 'ALL' && (
                      <button type="button" className="db-btn-secondary" onClick={() => setFilterKey('ALL')}>
                        Show all requests
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="db-table" role="table" aria-label="Recent requests">
                    <div className="db-row db-row-head" role="row">
                      <span role="columnheader">Request</span>
                      <span role="columnheader" className="db-col-address">
                        Address
                      </span>
                      <span role="columnheader" className="db-col-date">
                        Submitted
                      </span>
                      <span role="columnheader">Status</span>
                    </div>
                    {recentTickets.map((t) => {
                      const kw = packageKw(t.solar_package);
                      const isActive = activeTicket && t.id === activeTicket.id;
                      return (
                        <div
                          key={t.id}
                          className={`db-row db-row-click ${isActive ? 'is-active' : ''}`}
                          role="row"
                          tabIndex={0}
                          onClick={() => openTicketPage(t)}
                          onKeyDown={(e) => rowKeyDown(e, t)}
                        >
                          <span className="db-request" role="cell">
                            <span className="db-avatar" aria-hidden="true">
                              {kw ? (
                                <>
                                  {kw}
                                  <small>kW</small>
                                </>
                              ) : (
                                <Sun size={16} />
                              )}
                            </span>
                            <span className="db-request-text">
                              <span className="db-ref">{t.ticket_number}</span>
                              <span className="db-package">{t.solar_package || 'No package'}</span>
                            </span>
                          </span>
                          <span className="db-col-address db-address" role="cell" title={t.property_address}>
                            {t.property_address || <span className="db-muted">No address</span>}
                          </span>
                          <span className="db-col-date db-date-cell" role="cell">
                            <span className="db-date">{formatDate(t.created_at)}</span>
                            <span className="db-date-sub">{timeAgo(t.created_at)}</span>
                          </span>
                          <span className="db-status-cell" role="cell">
                            <StatusBadge ticket={t} />
                          </span>
                          <ChevronRight size={17} className="db-row-arrow" aria-hidden="true" />
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* ---------- Side cards ---------- */}
              <aside className="db-side">
                <div className="db-card db-next">
                  <div className="db-side-head">
                    <h2>What's next</h2>
                    {currentStepIndex >= 0 && (
                      <span className="db-count">
                        {currentStepIndex + 1}/{STATUS_STEPS.length}
                      </span>
                    )}
                  </div>
                  <div className="db-next-body">
                    <span className={`db-next-icon ${activeTicket?.status === 'NC_CAN_REAPPLY' ? 'red' : ''}`}>
                      {activeTicket?.status === 'NC_CAN_REAPPLY' ? <AlertTriangle size={18} /> : <Lightbulb size={18} />}
                    </span>
                    <div>
                      <p className="db-next-title">{nextStep ? nextStep.title : 'Ready to go solar?'}</p>
                      <p className="db-next-text">
                        {nextStep
                          ? nextStep.text
                          : 'Send a new request and our team will set up a roof assessment at your property.'}
                      </p>
                    </div>
                  </div>
                  {currentStepIndex >= 0 && (
                    <div className="db-next-bar" aria-hidden="true">
                      <span style={{ width: `${((currentStepIndex + 1) / STATUS_STEPS.length) * 100}%` }} />
                    </div>
                  )}
                </div>
              </aside>
            </div>
          </>
        )}
      </div>

      {showWithdraw && activeTicket && (
        <WithdrawModal
          ticketNumber={activeTicket.ticket_number}
          busy={withdrawing}
          onCancel={() => setShowWithdraw(false)}
          onConfirm={performWithdraw}
        />
      )}
    </CustomerLayout>
  );
}