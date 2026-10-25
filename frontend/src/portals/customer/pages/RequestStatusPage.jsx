import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Check,
  X,
  Download,
  ClipboardList,
  ClipboardCheck,
  CalendarClock,
  CalendarDays,
  Package,
  Zap,
  MapPin,
  HardHat,
  Wallet,
  AlertCircle,
  Inbox,
  Plus,
  Info,
  FileText,
  Sun,
  ArrowDown,
  Clock,
  ShieldCheck,
  CheckCircle2,
  HelpCircle,
  History,
  Star,
  ChevronDown,
  Activity,
  CheckCircle,
  RotateCcw,
} from 'lucide-react';
import { getMyTickets, downloadFinalSheetPDF, requestReschedule } from '../../../api/tickets';
import { formatCurrency } from '../../../utils/currency';
import VisitCalendar, { toDateKey } from '../../../components/VisitCalendar';
import CustomerLayout from '../components/CustomerLayout';
import '../styles/request-status.css';

const RESOLVED_STATUSES = ['APPROVED', 'COMPLETED', 'WITHDRAWN', 'NC_CANNOT_PROCEED'];

// These can be reapplied using the same ticket (same reference number)
const REAPPLY_STATUSES = ['WITHDRAWN', 'NC_CAN_REAPPLY'];
const IN_PROGRESS_STATUSES = ['REQUEST_SUBMITTED', 'PI_ASSIGNED', 'ASSESSMENT_SUBMITTED', 'STAFF_REVIEW', 'ADMIN_REVIEW'];

function canReapply(ticket) {
  return typeof ticket.can_reapply === 'boolean' ? ticket.can_reapply : REAPPLY_STATUSES.includes(ticket.status);
}

// Same colours as the Dashboard and the other portals
const STATUS_TONE = {
  REQUEST_SUBMITTED: 'navy',
  APPROVED: 'green',
  COMPLETED: 'done',
  WITHDRAWN: 'gray',
  NC_CANNOT_PROCEED: 'red',
  NC_CAN_REAPPLY: 'red',
};

function badgeTone(status) {
  return STATUS_TONE[status] || 'blue';
}

// Shown to customers who haven't submitted anything yet
const HOW_IT_WORKS = [
  { icon: FileText, title: 'Submit a request', text: 'Tell us your address, preferred visit date, and package.' },
  { icon: HardHat, title: 'Site assessment', text: 'A Partner Installer visits and checks your roof.' },
  { icon: ClipboardCheck, title: 'Review & approval', text: 'Our team reviews the results and confirms your final price.' },
  { icon: Sun, title: 'Installation', text: 'Your solar system gets installed and marked complete.' },
];

function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function formatShortDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// For "YYYY-MM-DD" values picked on the calendar
function formatKey(key) {
  if (!key) return '';
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function tomorrowKey() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return toDateKey(d);
}

// Newest Updated Quotation first, then the Initial one
function getLatestQuote(quotations = []) {
  const updated = quotations
    .filter((q) => q.quotation_type === 'UPDATED')
    .sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at));
  if (updated.length > 0) return updated[0];
  return quotations.find((q) => q.quotation_type === 'INITIAL') || null;
}

// Plain-words message for the "Where your request is now" box.
// Withdrawn and Not Compatible have their own boxes, so they return null.
function getStatusMessage(ticket) {
  const installer = ticket.partner_installer_username || 'A Partner Installer';
  switch (ticket.status) {
    case 'REQUEST_SUBMITTED':
      return {
        tone: 'gold',
        icon: Clock,
        title: 'We received your request',
        text: 'Our team is reviewing it and will assign a Partner Installer to visit your property soon.',
      };
    case 'PI_ASSIGNED':
      return {
        tone: 'blue',
        icon: HardHat,
        title: 'A site visit is scheduled',
        text: ticket.visit_date
          ? `${installer} will visit on ${formatDate(ticket.visit_date)}. Make sure someone is home so they can check your roof.`
          : `${installer} has been assigned to visit your property. We'll confirm the date soon.`,
      };
    case 'ASSESSMENT_SUBMITTED':
    case 'STAFF_REVIEW':
      return {
        tone: 'blue',
        icon: ClipboardCheck,
        title: 'Your roof assessment is being reviewed',
        text: "Our team is checking the Partner Installer's findings to confirm the right system and final price.",
      };
    case 'ADMIN_REVIEW':
      return {
        tone: 'blue',
        icon: ShieldCheck,
        title: 'Waiting for final approval',
        text: "Your request is with our Admin for final approval. You'll get a notification once it's done.",
      };
    case 'APPROVED':
      return {
        tone: 'green',
        icon: CheckCircle2,
        title: 'Your request is approved!',
        text: 'Your final sheet is ready to download. Our team will get in touch to schedule your installation.',
      };
    case 'COMPLETED':
      return {
        tone: 'green',
        icon: Sun,
        title: 'Installation complete',
        text: 'Your solar system has been installed. Thank you for choosing Glomax! We would love to hear how it went.',
        action: { to: '/feedback', label: 'Leave Feedback', icon: Star },
      };
    default:
      return null;
  }
}

// Works out each timeline step's state: done, current, stopped, or todo
function buildTimeline(ticket) {
  const isWithdrawn = ticket.status === 'WITHDRAWN';
  const isNotCompatible = ['NC_CANNOT_PROCEED', 'NC_CAN_REAPPLY'].includes(ticket.status);
  const stopped = isWithdrawn || isNotCompatible;
  const hasFinalSheet = ['APPROVED', 'COMPLETED'].includes(ticket.status);
  const isCompleted = ticket.status === 'COMPLETED';
  const hasAssessment = Boolean(ticket.assessment);

  let assessmentState = 'todo';
  if (hasAssessment) assessmentState = 'done';
  else if (!stopped) assessmentState = 'current';

  let decisionState = 'todo';
  let decisionLabel = 'Decision';
  if (stopped) {
    decisionState = 'stopped';
    decisionLabel = isWithdrawn ? 'Withdrawn' : 'Not Compatible';
  } else if (hasFinalSheet) {
    decisionState = 'done';
  } else if (hasAssessment) {
    decisionState = 'current';
  }

  const decisionDate = stopped
    ? ticket.withdrawn_at || ticket.updated_at
    : ticket.final_sheet?.approved_at;

  return [
    { key: 'submitted', label: 'Submitted', state: 'done', date: ticket.created_at },
    { key: 'assessment', label: 'Assessment', state: assessmentState, date: ticket.assessment?.submitted_at },
    {
      key: 'decision',
      label: decisionLabel,
      state: decisionState,
      date: decisionState === 'done' || decisionState === 'stopped' ? decisionDate : null,
    },
    {
      key: 'approved',
      label: 'Approved',
      state: hasFinalSheet ? 'done' : 'todo',
      date: ticket.final_sheet?.approved_at,
    },
    {
      key: 'completed',
      label: 'Completed',
      state: isCompleted ? 'done' : hasFinalSheet ? 'current' : 'todo',
      date: ticket.completed_at,
    },
  ];
}

// Custom "Viewing" dropdown - shows each request with its date and
// colored status badge, instead of the plain browser dropdown
function TicketPicker({ tickets, selected, onSelect }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function handleClickOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
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

  function pick(id) {
    onSelect(id);
    setOpen(false);
  }

  return (
    <div className="rs-picker" ref={wrapRef}>
      <button
        type="button"
        className={`rs-picker-btn ${open ? 'open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="rs-picker-icon">
          <FileText size={16} />
        </span>
        <span className="rs-picker-text">
          <span className="rs-picker-label">Viewing request</span>
          <span className="rs-picker-value">{selected.ticket_number}</span>
        </span>
        <ChevronDown size={16} className="rs-picker-chevron" />
      </button>

      {open && (
        <div className="rs-picker-menu" role="listbox">
          <p className="rs-picker-menu-title">Your requests</p>
          <div className="rs-picker-list">
            {tickets.map((t) => {
              const isSelected = t.id === selected.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={`rs-picker-option ${isSelected ? 'selected' : ''}`}
                  onClick={() => pick(t.id)}
                >
                  <span className="rs-picker-option-main">
                    <span className="rs-picker-option-number">{t.ticket_number}</span>
                    <span className="rs-picker-option-date">Submitted {formatShortDate(t.created_at)}</span>
                  </span>
                  <span className={`rs-pill tone-${badgeTone(t.status)}`}>{t.status_display}</span>
                  <span className="rs-picker-check">
                    {isSelected && <Check size={15} />}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function SectionTitle({ icon: Icon, tone, children }) {
  return (
    <div className="rs-section-title">
      <span className={`rs-section-icon tone-${tone}`}>
        <Icon size={16} />
      </span>
      <h3>{children}</h3>
    </div>
  );
}

// One detail tile. "pending" shows the value in light gray italics.
// "highlight" gives the tile a gold look (used for the price).
function InfoField({ icon: Icon, label, value, pending = false, highlight = false }) {
  return (
    <div className={`rs-info-field ${highlight ? 'highlight' : ''}`}>
      <span className="rs-info-icon">
        <Icon size={16} />
      </span>
      <div className="rs-info-text">
        <p className="rs-info-label">{label}</p>
        <p className={`rs-info-value ${pending ? 'pending' : ''}`}>{value}</p>
      </div>
    </div>
  );
}

function StatusCallout({ ticket }) {
  const info = getStatusMessage(ticket);
  if (!info) return null;
  const Icon = info.icon;
  const ActionIcon = info.action?.icon;

  return (
    <div className={`rs-callout tone-${info.tone}`}>
      <span className="rs-callout-icon">
        <Icon size={20} />
      </span>
      <div className="rs-callout-text">
        <p className="rs-callout-label">Where your request is now</p>
        <p className="rs-callout-title">{info.title}</p>
        <p className="rs-callout-body">{info.text}</p>
      </div>
      {info.action && (
        <Link to={info.action.to} className="rs-callout-btn">
          <ActionIcon size={15} />
          {info.action.label}
        </Link>
      )}
    </div>
  );
}

// Older tries of this same ticket, saved each time the customer reapplied.
// Newest first. Each row shows what that try looked like when it ended.
function EarlierTries({ attempts }) {
  const list = [...attempts].sort((a, b) => b.attempt_number - a.attempt_number);
  return (
    <section className="rs-section">
      <SectionTitle icon={History} tone="navy">
        Earlier Tries
      </SectionTitle>
      <p className="rs-tries-hint">
        You reapplied using this same reference number. Here is what happened before.
      </p>
      <div className="rs-table-wrap">
        <table className="rs-table">
          <thead>
            <tr>
              <th>Try</th>
              <th>Status</th>
              <th>Package</th>
              <th>Address</th>
              <th>Installer</th>
              <th>Visit Date</th>
              <th>Dates</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {list.map((a) => {
              const snap = a.snapshot || {};
              return (
                <tr key={a.id}>
                  <td className="rs-table-try">Try {a.attempt_number}</td>
                  <td>
                    <span className={`rs-pill tone-${badgeTone(a.status)}`}>{a.status_display}</span>
                  </td>
                  <td>{snap.solar_package || '—'}</td>
                  <td className="rs-table-wrap-text">{snap.property_address || '—'}</td>
                  <td>{snap.partner_installer_username || '—'}</td>
                  <td className="rs-table-nowrap">{snap.visit_date ? formatShortDate(snap.visit_date) : '—'}</td>
                  <td className="rs-table-nowrap">
                    {formatShortDate(a.started_at)}
                    {a.ended_at && ` – ${formatShortDate(a.ended_at)}`}
                  </td>
                  <td className="rs-table-wrap-text">{snap.admin_revision_notes || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function HelpBanner() {
  return (
    <div className="rs-help">
      <span className="rs-help-icon">
        <HelpCircle size={20} />
      </span>
      <div className="rs-help-text">
        <p className="rs-help-title">Need help with your request?</p>
        <p className="rs-help-sub">Check our FAQs, or look back at your older requests.</p>
      </div>
      <div className="rs-help-links">
        <Link to="/past-requests" className="rs-help-link-outline">
          <History size={15} />
          Past Requests
        </Link>
        <Link to="/faqs" className="rs-help-link-primary">
          Read FAQs
        </Link>
      </div>
    </div>
  );
}

function StatusSkeleton() {
  return (
    <div className="rs-card">
      <div className="rs-card-header">
        <span className="rs-skel rs-skel-circle rs-skel-circle-lg" />
        <div className="rs-skel-stack">
          <span className="rs-skel rs-skel-w-md" />
          <span className="rs-skel rs-skel-w-lg" />
        </div>
        <span className="rs-skel rs-skel-pill" />
      </div>
      <div className="rs-card-body">
        <span className="rs-skel rs-skel-callout" />
        <div className="rs-skel-steps">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rs-skel-step">
              <span className="rs-skel rs-skel-circle" />
              <span className="rs-skel rs-skel-w-sm" />
            </div>
          ))}
        </div>
        <div className="rs-info-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <span key={i} className="rs-skel rs-skel-tile" />
          ))}
        </div>
      </div>
    </div>
  );
}

function NoRequestsYet() {
  return (
    <div className="rs-card">
      <div className="rs-empty-hero">
        <span className="rs-empty-badge">
          <Inbox size={30} />
        </span>
        <h2>No requests yet</h2>
        <p>
          Once you submit a request, you can follow every step of it here, from the site
          visit all the way to installation.
        </p>
        <div className="rs-empty-actions">
          <Link to="/new-request" className="rs-btn-primary">
            <Plus size={16} />
            New Request
          </Link>
          <Link to="/dashboard" className="rs-btn-secondary">
            Back to Dashboard
          </Link>
        </div>
      </div>

      <div className="rs-howto">
        <p className="rs-howto-title">How it works</p>
        <div className="rs-howto-grid">
          {HOW_IT_WORKS.map(({ icon: Icon, title, text }, index) => (
            <div key={title} className="rs-howto-step">
              <div className="rs-howto-top">
                <span className="rs-howto-icon">
                  <Icon size={18} />
                </span>
                <span className="rs-howto-num">Step {index + 1}</span>
              </div>
              <p className="rs-howto-step-title">{title}</p>
              <p className="rs-howto-step-text">{text}</p>
            </div>
          ))}
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
    <div className={`rs-toast ${type}`} role="status">
      {type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
      {message}
    </div>
  );
}

// Wide popup: calendar on the left, date comparison and reason on the
// right, buttons in a footer bar - short enough to fit without scrolling
function RescheduleModal({ ticket, busy, error, onCancel, onSubmit }) {
  const [date, setDate] = useState('');
  const [reason, setReason] = useState('');
  const [localError, setLocalError] = useState('');

  function handleSubmit() {
    if (!date) {
      setLocalError('Please pick a new date on the calendar.');
      return;
    }
    setLocalError('');
    onSubmit(date, reason);
  }

  function handlePick(key) {
    setDate(key);
    setLocalError('');
  }

  const shownError = localError || error;

  // Close with the Esc key
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape' && !busy) onCancel();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onCancel]);

  return (
    <div className="rs-modal-overlay" onClick={() => !busy && onCancel()}>
      <div className="rs-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="rs-modal-header">
          <div className="rs-modal-header-left">
            <span className="rs-modal-header-icon">
              <CalendarClock size={18} />
            </span>
            <div>
              <h3>Request a New Visit Date</h3>
              <p>{ticket.ticket_number}</p>
            </div>
          </div>
          <button
            type="button"
            className="rs-modal-close"
            onClick={onCancel}
            disabled={busy}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="rs-modal-body">
          <div className="rs-modal-cal">
            <p className="rs-modal-label">Pick a new date</p>
            <VisitCalendar value={date} onChange={handlePick} minDate={tomorrowKey()} />
          </div>

          <div className="rs-modal-side">
            <div className="rs-date-compare">
              <div className="rs-date-box">
                <span className="rs-date-box-icon">
                  <CalendarDays size={16} />
                </span>
                <div>
                  <p className="rs-date-box-label">Current visit date</p>
                  <p className="rs-date-box-value">
                    {ticket.visit_date ? formatDate(ticket.visit_date) : 'Not yet scheduled'}
                  </p>
                </div>
              </div>

              <span className="rs-date-arrow">
                <ArrowDown size={16} />
              </span>

              <div className={`rs-date-box rs-date-box-new ${date ? 'picked' : ''}`}>
                <span className="rs-date-box-icon">
                  <CalendarClock size={16} />
                </span>
                <div>
                  <p className="rs-date-box-label">New date</p>
                  <p className="rs-date-box-value">
                    {date ? formatKey(date) : 'Pick a day on the calendar'}
                  </p>
                </div>
              </div>
            </div>

            <label className="rs-modal-label rs-modal-reason">
              Reason (optional)
              <textarea
                rows={4}
                placeholder="Let us know why you need to reschedule..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>

            {shownError && (
              <p className="rs-modal-error">
                <AlertCircle size={15} />
                {shownError}
              </p>
            )}
          </div>
        </div>

        <div className="rs-modal-footer">
          <button type="button" className="rs-btn-secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="rs-btn-gold" onClick={handleSubmit} disabled={busy}>
            {busy ? 'Sending...' : 'Send Request'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function RequestStatusPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [toast, setToast] = useState(null);

  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [rescheduleSubmitting, setRescheduleSubmitting] = useState(false);
  const [rescheduleError, setRescheduleError] = useState('');

  // silent = refresh in the background without showing the skeleton again
  async function load({ silent = false } = {}) {
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

  useEffect(() => {
    load();
  }, []);

  const sortedTickets = [...tickets].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const activeTicket = tickets.find((t) => !RESOLVED_STATUSES.includes(t.status));
  const selectedId = searchParams.get('ticket');
  const selectedTicket = selectedId ? tickets.find((t) => String(t.id) === selectedId) : null;

  // If the link has a ticket that doesn't exist, fall back to the usual choice
  const ticket = selectedTicket || activeTicket || sortedTickets[0];

  function handleSelectTicket(id) {
    setSearchParams({ ticket: String(id) });
  }

  async function handleDownloadPDF() {
    setDownloading(true);
    try {
      await downloadFinalSheetPDF(ticket.id, ticket.ticket_number);
    } catch {
      setToast({ message: 'Could not download the PDF. Please try again.', type: 'error' });
    } finally {
      setDownloading(false);
    }
  }

  function openRescheduleModal() {
    setRescheduleError('');
    setShowRescheduleModal(true);
  }

  async function handleSubmitReschedule(date, reason) {
    setRescheduleSubmitting(true);
    setRescheduleError('');
    try {
      await requestReschedule(ticket.id, {
        requested_date: date,
        reason,
      });
      setShowRescheduleModal(false);
      await load({ silent: true });
      setToast({ message: 'Your reschedule request has been sent to our team for review.', type: 'success' });
    } catch (err) {
      const detail = err?.response?.data?.non_field_errors?.[0] || err?.response?.data?.detail;
      setRescheduleError(detail || 'Could not submit your reschedule request. Please try again.');
    } finally {
      setRescheduleSubmitting(false);
    }
  }

  let content;

  if (loading) {
    content = <StatusSkeleton />;
  } else if (error) {
    content = (
      <div className="rs-card">
        <div className="rs-empty-state">
          <span className="rs-empty-icon">
            <AlertCircle size={26} />
          </span>
          <p className="rs-empty-title">Something went wrong</p>
          <p className="rs-empty-hint">{error}</p>
          <button type="button" className="rs-btn-primary" onClick={() => load()}>
            Try again
          </button>
        </div>
      </div>
    );
  } else if (!ticket) {
    content = <NoRequestsYet />;
  } else {
    const isWithdrawn = ticket.status === 'WITHDRAWN';
    // Reapply only when no other request is still being worked on
    const otherInProgress = tickets.some((t) => t.id !== ticket.id && IN_PROGRESS_STATUSES.includes(t.status));
    const showReapply = canReapply(ticket) && !otherInProgress;
    const reapplyLink = `/new-request?reapply=${ticket.id}`;
    const earlierTries = ticket.attempts || [];
    const isNotCompatible = ['NC_CANNOT_PROCEED', 'NC_CAN_REAPPLY'].includes(ticket.status);
    const hasFinalSheet = ['APPROVED', 'COMPLETED'].includes(ticket.status);
    const timeline = buildTimeline(ticket);

    const latestQuote = getLatestQuote(ticket.quotations || []);
    const priceValue = ticket.final_sheet?.final_cost || latestQuote?.estimated_cost;

    const canRequestReschedule = ticket.status === 'PI_ASSIGNED';
    const reschedules = [...(ticket.reschedule_requests || [])].sort((a, b) => b.id - a.id);
    const pendingReschedule = reschedules.find((r) => r.status === 'PENDING');
    const lastResolvedReschedule = reschedules.find((r) => r.status !== 'PENDING');

    content = (
      <div className="rs-card">
        <div className="rs-card-header">
          <span className="rs-card-header-icon">
            <FileText size={20} />
          </span>
          <div className="rs-card-header-text">
            <h2>
              {ticket.ticket_number}
              <span className={`rs-pill tone-${badgeTone(ticket.status)}`}>{ticket.status_display}</span>
              {ticket.attempt_number > 1 && <span className="rs-try-chip">Try {ticket.attempt_number}</span>}
            </h2>
            <p>
              <CalendarDays size={13} />
              Submitted {formatDate(ticket.created_at)}
            </p>
          </div>
          <div className="rs-card-header-right">
            {hasFinalSheet && (
              <button
                type="button"
                className="rs-download-btn"
                onClick={handleDownloadPDF}
                disabled={downloading}
              >
                <Download size={15} />
                {downloading ? 'Preparing...' : 'Download PDF'}
              </button>
            )}
          </div>
        </div>

        <div className="rs-card-body">
          <StatusCallout ticket={ticket} />

          {isNotCompatible && (
            <div className="rs-alert rs-alert-red">
              <span className="rs-alert-icon">
                <AlertCircle size={18} />
              </span>
              <div className="rs-alert-text">
                <p className="rs-alert-title">This property is not compatible</p>
                {ticket.admin_revision_notes && <p>Reason: {ticket.admin_revision_notes}</p>}
              </div>
              {ticket.status === 'NC_CAN_REAPPLY' && showReapply && (
                <Link to={reapplyLink} className="rs-btn-primary rs-alert-btn">
                  <RotateCcw size={15} />
                  Reapply
                </Link>
              )}
            </div>
          )}

          {isWithdrawn && (
            <div className="rs-alert rs-alert-gray">
              <span className="rs-alert-icon">
                <Info size={18} />
              </span>
              <div className="rs-alert-text">
                <p className="rs-alert-title">This request was withdrawn</p>
                <p>You can reapply anytime using this same reference number.</p>
              </div>
              {showReapply && (
                <Link to={reapplyLink} className="rs-btn-primary rs-alert-btn">
                  <RotateCcw size={15} />
                  Reapply
                </Link>
              )}
            </div>
          )}

          <ol className="rs-stepper" aria-label="Request progress">
            {timeline.map((step, index) => (
              <li key={step.key} className={`rs-step ${step.state}`}>
                <span className="rs-step-circle">
                  {step.state === 'done' && <Check size={16} />}
                  {step.state === 'stopped' && <X size={16} />}
                  {(step.state === 'current' || step.state === 'todo') && index + 1}
                </span>
                <span className="rs-step-label">{step.label}</span>
                <span className="rs-step-date">{step.date ? formatShortDate(step.date) : ''}</span>
              </li>
            ))}
          </ol>

          {!isNotCompatible && !isWithdrawn && (
            <section className="rs-section">
              <SectionTitle icon={ClipboardList} tone="navy">Request Details</SectionTitle>
              <div className="rs-info-grid">
                <InfoField icon={Package} label="Package" value={ticket.solar_package || '—'} />
                <InfoField
                  icon={Zap}
                  label="System Type"
                  value={ticket.system_type === 'ON_GRID' ? 'On-Grid' : 'Hybrid'}
                />
                <InfoField icon={MapPin} label="Address" value={ticket.property_address || '—'} />
                <InfoField
                  icon={HardHat}
                  label="Partner Installer"
                  value={ticket.partner_installer_username || 'Not yet assigned'}
                  pending={!ticket.partner_installer_username}
                />
                <InfoField
                  icon={CalendarDays}
                  label="Visit Date"
                  value={ticket.visit_date ? formatDate(ticket.visit_date) : 'Not yet scheduled'}
                  pending={!ticket.visit_date}
                />
                <InfoField
                  icon={Wallet}
                  label={hasFinalSheet ? 'Total Price' : 'Estimated Price'}
                  value={priceValue ? formatCurrency(priceValue) : 'Waiting for quotation'}
                  pending={!priceValue}
                  highlight={Boolean(priceValue)}
                />
              </div>
            </section>
          )}

          {canRequestReschedule && (
            <section className="rs-section">
              <SectionTitle icon={CalendarClock} tone="gold">Visit Schedule</SectionTitle>

              {pendingReschedule && (
                <div className="rs-alert rs-alert-gold">
                  <span className="rs-alert-icon">
                    <CalendarClock size={18} />
                  </span>
                  <div className="rs-alert-text">
                    <p className="rs-alert-title">Reschedule request pending</p>
                    <p>
                      You asked for {formatDate(pendingReschedule.requested_date)}. Our team will
                      review this shortly.
                    </p>
                  </div>
                </div>
              )}

              {!pendingReschedule && lastResolvedReschedule && (
                <div
                  className={`rs-alert ${
                    lastResolvedReschedule.status === 'APPROVED' ? 'rs-alert-green' : 'rs-alert-red'
                  }`}
                >
                  <span className="rs-alert-icon">
                    {lastResolvedReschedule.status === 'APPROVED' ? <CheckCircle size={18} /> : <X size={18} />}
                  </span>
                  <div className="rs-alert-text">
                    <p className="rs-alert-title">
                      {lastResolvedReschedule.status === 'APPROVED' ? 'Reschedule approved' : 'Reschedule declined'}
                    </p>
                    <p>
                      {lastResolvedReschedule.status === 'APPROVED'
                        ? `Your visit date is now ${formatDate(ticket.visit_date)}.`
                        : lastResolvedReschedule.staff_response_note || 'Your requested date could not be accommodated.'}
                    </p>
                  </div>
                </div>
              )}

              {!pendingReschedule && (
                <div className="rs-reschedule-row">
                  <span className="rs-reschedule-icon">
                    <CalendarClock size={18} />
                  </span>
                  <p>Can't make it on your visit date? You can ask for a different day.</p>
                  <button type="button" className="rs-btn-outline" onClick={openRescheduleModal}>
                    <CalendarClock size={15} />
                    Request Reschedule
                  </button>
                </div>
              )}
            </section>
          )}

          {earlierTries.length > 0 && <EarlierTries attempts={earlierTries} />}
        </div>

        <HelpBanner />
      </div>
    );
  }

  return (
    <CustomerLayout>
      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}

      <div className="rs-page">
        <section className="rs-hero">
          <div className="rs-hero-glow" aria-hidden="true" />
          <div className="rs-hero-icon">
            <Activity size={26} />
          </div>
          <div className="rs-hero-text">
            <h1>Request Status</h1>
            <p>Track the progress of your roof assessment request.</p>
          </div>

          {!loading && !error && ticket && sortedTickets.length > 1 && (
            <TicketPicker tickets={sortedTickets} selected={ticket} onSelect={handleSelectTicket} />
          )}
        </section>

        {content}
      </div>

      {showRescheduleModal && ticket && (
        <RescheduleModal
          ticket={ticket}
          busy={rescheduleSubmitting}
          error={rescheduleError}
          onCancel={() => setShowRescheduleModal(false)}
          onSubmit={handleSubmitReschedule}
        />
      )}
    </CustomerLayout>
  );
}