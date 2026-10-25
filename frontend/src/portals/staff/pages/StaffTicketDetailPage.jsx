import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarClock,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  User,
  Phone,
  MapPin,
  History,
  UserCheck,
  Send,
  SearchX,
  AlertCircle,
  Sun,
  Zap,
  Check,
  Search,
  Clock,
  FileText,
  Hourglass,
  ShieldCheck,
  CheckCircle2,
  Award,
  XCircle,
  Ban,
  ArrowRight,
  ListChecks,
  MessageSquareWarning,
  Briefcase,
} from 'lucide-react';
import StaffLayout from '../components/StaffLayout';
import DirectionsLink from '../components/DirectionsLink';
import { getStaffTickets, getPartnerInstallers, assignPartnerInstaller, resolveRescheduleRequest } from '../../../api/staffTickets';
import '../styles/staff-ticket-detail.css';

const STATUS_TAG_CLASS = {
  APPROVED: 'approved',
  COMPLETED: 'completed',
  WITHDRAWN: 'withdrawn',
  NC_CANNOT_PROCEED: 'not-compatible',
  NC_CAN_REAPPLY: 'not-compatible',
  NOT_COMPATIBLE_CANNOT_PROCEED: 'not-compatible',
  NOT_COMPATIBLE_CAN_REAPPLY: 'not-compatible',
  REQUEST_SUBMITTED: 'pending',
  PI_ASSIGNED: 'in-progress',
  PARTNER_INSTALLER_ASSIGNED: 'in-progress',
  ASSESSMENT_SUBMITTED: 'in-progress',
  STAFF_REVIEW: 'in-progress',
  ADMIN_REVIEW: 'in-progress',
};

// The steps a ticket moves through, shown as a progress bar
const STEPS = [
  { label: 'Submitted', icon: FileText },
  { label: 'Installer Assigned', icon: UserCheck },
  { label: 'Assessment', icon: ListChecks },
  { label: 'Admin Review', icon: ShieldCheck },
  { label: 'Approved', icon: CheckCircle2 },
  { label: 'Completed', icon: Award },
];

// Which step each status is on
const STATUS_STEP = {
  REQUEST_SUBMITTED: 0,
  PI_ASSIGNED: 1,
  PARTNER_INSTALLER_ASSIGNED: 1,
  ASSESSMENT_SUBMITTED: 2,
  STAFF_REVIEW: 2,
  ADMIN_REVIEW: 3,
  APPROVED: 4,
  COMPLETED: 5,
};

const STOPPED_STATUSES = [
  'WITHDRAWN',
  'NC_CANNOT_PROCEED',
  'NC_CAN_REAPPLY',
  'NOT_COMPATIBLE_CANNOT_PROCEED',
  'NOT_COMPATIBLE_CAN_REAPPLY',
];

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function formatDate(value, month = 'short') {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-US', { month, day: 'numeric', year: 'numeric' });
}

function formatLongDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length > 1) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

// Builds "YYYY-MM-DD" from the local date. Do not use toISOString() here -
// in the Philippines (UTC+8) it would give the day before.
function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function daysFromToday(value) {
  if (!value) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(value);
  target.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}

function whenText(days) {
  if (days === null) return '';
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  if (days > 1) return `In ${days} days`;
  return `${Math.abs(days)} days ago`;
}

/* ------------------------------------------------------------------ */

function CardTitle({ icon: Icon, tone, title, sub, right }) {
  return (
    <div className="stftd-card-title">
      <span className={`stftd-title-icon tone-${tone}`}>
        <Icon size={17} />
      </span>
      <div className="stftd-card-title-text">
        <h2>{title}</h2>
        {sub && <p>{sub}</p>}
      </div>
      {right && <div className="stftd-card-title-right">{right}</div>}
    </div>
  );
}

function ProgressTracker({ status }) {
  const current = STATUS_STEP[status] ?? 0;
  return (
    <ol className="stftd-tracker">
      {STEPS.map((step, i) => {
        const Icon = step.icon;
        const state = i < current ? 'done' : i === current ? 'current' : 'todo';
        return (
          <li key={step.label} className={`stftd-track-step ${state}`}>
            <span className="stftd-track-dot">
              {state === 'done' ? <Check size={14} strokeWidth={3} /> : <Icon size={14} />}
            </span>
            <span className="stftd-track-label">{step.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function NextStep({ ticket, installerName, onAssignClick }) {
  const status = ticket.status;
  const visitIn = whenText(daysFromToday(ticket.visit_date));
  let tone = 'blue';
  let Icon = Hourglass;
  let title = '';
  let text = '';
  let action = null;

  if (status === 'REQUEST_SUBMITTED') {
    tone = 'gold';
    Icon = UserCheck;
    title = 'Assign a Partner Installer';
    text = 'Pick an installer and a visit date below. They will get an email and a notification.';
    action = (
      <button type="button" className="stftd-next-btn" onClick={onAssignClick}>
        Assign now
        <ArrowRight size={15} />
      </button>
    );
  } else if (status === 'PI_ASSIGNED' || status === 'PARTNER_INSTALLER_ASSIGNED') {
    Icon = CalendarClock;
    title = `Waiting for the site visit${visitIn ? ` (${visitIn.toLowerCase()})` : ''}`;
    text = `${installerName || 'The Partner Installer'} will check the roof on ${formatLongDate(ticket.visit_date)} and fill out the assessment.`;
  } else if (status === 'ASSESSMENT_SUBMITTED' || status === 'STAFF_REVIEW') {
    tone = 'gold';
    Icon = ListChecks;
    title = 'Assessment is ready for your review';
    text = 'Open Assessment Review to check the roof details and decide if it can go to the Admin.';
  } else if (status === 'ADMIN_REVIEW') {
    Icon = ShieldCheck;
    title = 'Waiting for Admin approval';
    text = 'The Admin is reviewing this request. Nothing to do for now.';
  } else if (status === 'APPROVED') {
    tone = 'green';
    Icon = CheckCircle2;
    title = 'Approved, waiting for installation';
    text = `${installerName || 'The Partner Installer'} will mark it complete once the solar system is installed.`;
  } else if (status === 'COMPLETED') {
    tone = 'green';
    Icon = Award;
    title = 'Installation completed';
    text = 'This request is done. You can find it under Completed Tickets.';
  } else if (status === 'WITHDRAWN') {
    tone = 'gray';
    Icon = Ban;
    title = 'Withdrawn by the customer';
    text = 'The customer cancelled this request before a Partner Installer was assigned.';
  } else {
    tone = 'red';
    Icon = XCircle;
    title = 'Marked as Not Compatible';
    text = 'The roof was not suitable for solar panels, so this request was closed.';
  }

  return (
    <div className={`stftd-next tone-${tone}`}>
      <span className="stftd-next-icon">
        <Icon size={20} />
      </span>
      <div className="stftd-next-text">
        <span className="stftd-next-eyebrow">What's next</span>
        <h3>{title}</h3>
        <p>{text}</p>
      </div>
      {action}
    </div>
  );
}

function InfoTile({ icon: Icon, tone, label, value, sub }) {
  return (
    <div className="stftd-tile">
      <span className={`stftd-tile-icon tone-${tone}`}>
        <Icon size={18} />
      </span>
      <div className="stftd-tile-text">
        <span className="stftd-tile-label">{label}</span>
        <span className="stftd-tile-value">{value}</span>
        {sub && <span className="stftd-tile-sub">{sub}</span>}
      </div>
    </div>
  );
}

function VisitDatePicker({ value, onChange }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayKey = toDateKey(today);

  const [viewYear, setViewYear] = useState(() => (value ? Number(value.slice(0, 4)) : today.getFullYear()));
  const [viewMonth, setViewMonth] = useState(() => (value ? Number(value.slice(5, 7)) - 1 : today.getMonth()));

  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const canGoBack =
    new Date(viewYear, viewMonth, 1) > new Date(today.getFullYear(), today.getMonth(), 1);

  const cells = [];
  for (let i = 0; i < firstWeekday; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) cells.push(d);

  function shiftMonth(delta) {
    const next = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  }

  function pickToday() {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
    onChange(todayKey);
  }

  return (
    <div className="stftd-cal">
      <div className="stftd-cal-header">
        <button
          type="button"
          className="stftd-cal-nav"
          onClick={() => shiftMonth(-1)}
          disabled={!canGoBack}
          aria-label="Previous month"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="stftd-cal-title">{monthLabel}</span>
        <button type="button" className="stftd-cal-nav" onClick={() => shiftMonth(1)} aria-label="Next month">
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="stftd-cal-body">
        <div className="stftd-cal-weekdays">
          {WEEKDAYS.map((w) => (
            <span key={w} className="stftd-cal-weekday">{w}</span>
          ))}
        </div>

        <div className="stftd-cal-grid">
          {cells.map((day, index) => {
            if (day === null) {
              return <span key={`blank-${index}`} className="stftd-cal-blank" />;
            }
            const key = toDateKey(new Date(viewYear, viewMonth, day));
            const isPast = key < todayKey;
            const isToday = key === todayKey;
            const isSelected = key === value;
            const classes = ['stftd-cal-day', isToday ? 'today' : '', isSelected ? 'selected' : ''].join(' ');
            return (
              <button key={key} type="button" className={classes} disabled={isPast} onClick={() => onChange(key)}>
                {day}
              </button>
            );
          })}
        </div>
      </div>

      <div className="stftd-cal-footer">
        <span className="stftd-cal-selected">
          {value ? <strong>{formatDate(value)}</strong> : 'No date picked yet'}
        </span>
        <button type="button" className="stftd-cal-today-btn" onClick={pickToday}>
          Today
        </button>
      </div>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <>
      <div className="stftd-hero">
        <div className="stftd-hero-top">
          <div className="stftd-hero-left">
            <span className="stftd-skel stftd-skel-dark stftd-skel-back" />
            <span className="stftd-skel stftd-skel-dark stftd-skel-avatar" />
            <div className="stftd-skel-stack">
              <span className="stftd-skel stftd-skel-dark stftd-skel-w-lg" />
              <span className="stftd-skel stftd-skel-dark stftd-skel-w-md" />
            </div>
          </div>
          <span className="stftd-skel stftd-skel-dark stftd-skel-pill" />
        </div>
        <span className="stftd-skel stftd-skel-dark stftd-skel-track" />
      </div>

      <div className="stftd-layout">
        <div className="stftd-main">
          <div className="stftd-card">
            <span className="stftd-skel stftd-skel-w-md" />
            <div className="stftd-tiles stftd-skel-tiles">
              {Array.from({ length: 4 }).map((_, i) => (
                <span key={i} className="stftd-skel stftd-skel-tile" />
              ))}
            </div>
          </div>
        </div>
        <div className="stftd-side">
          <div className="stftd-card">
            <div className="stftd-skel-stack">
              <span className="stftd-skel stftd-skel-w-md" />
              <span className="stftd-skel stftd-skel-w-lg" />
              <span className="stftd-skel stftd-skel-w-sm" />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function EmptyState({ icon: Icon, red, title, hint, onBack }) {
  return (
    <div className="stftd-card">
      <div className="stftd-empty-state">
        <span className={`stftd-empty-icon-wrap ${red ? 'red' : ''}`}>
          <Icon size={28} />
        </span>
        <p className="stftd-empty-state-title">{title}</p>
        <p className="stftd-empty-state-hint">{hint}</p>
        <button className="stftd-btn-secondary" onClick={onBack}>
          Back to Ticket Tracking
        </button>
      </div>
    </div>
  );
}

// Closes with Esc, but not while something is saving
function useEscape(onClose, busy) {
  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape' && !busy) onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose, busy]);
}

function ConfirmModal({ installerName, visitDate, onCancel, onConfirm, busy }) {
  useEscape(onCancel, busy);
  return (
    <div className="stftd-modal-overlay" onMouseDown={() => !busy && onCancel()}>
      <div className="stftd-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="stftd-modal-icon">
          <UserCheck size={22} />
        </div>
        <h3>Assign Partner Installer?</h3>
        <div className="stftd-modal-summary">
          <div>
            <span>Partner Installer</span>
            <strong>{installerName}</strong>
          </div>
          <div>
            <span>Visit date</span>
            <strong>{formatLongDate(visitDate)}</strong>
          </div>
        </div>
        <p>They will get an email and a notification about this visit.</p>
        <div className="stftd-modal-actions">
          <button className="stftd-btn-secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button className="stftd-btn-confirm" onClick={onConfirm} disabled={busy}>
            {busy ? 'Assigning...' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}

function RescheduleModal({ ticket, reschedule, onCancel, onApprove, onDecline, busy }) {
  const [mode, setMode] = useState('review'); // 'review' | 'decline'
  const [note, setNote] = useState('');
  useEscape(onCancel, busy);

  return (
    <div className="stftd-modal-overlay" onMouseDown={() => !busy && onCancel()}>
      <div
        className={`stftd-modal stftd-reschedule-modal ${mode === 'decline' ? 'stftd-reschedule-modal-wide' : ''}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="stftd-reschedule-modal-icon">
          <CalendarClock size={22} />
        </div>
        <h3>Reschedule Requested</h3>

        <div className="stftd-reschedule-modal-dates">
          <div className="stftd-reschedule-modal-date-col">
            <span className="stftd-reschedule-modal-date-label">Current Date</span>
            <span className="stftd-reschedule-modal-date-value old">{formatDate(ticket.visit_date)}</span>
          </div>
          <span className="stftd-reschedule-modal-arrow">
            <ArrowRight size={18} />
          </span>
          <div className="stftd-reschedule-modal-date-col">
            <span className="stftd-reschedule-modal-date-label">Requested Date</span>
            <span className="stftd-reschedule-modal-date-value new">{formatDate(reschedule.requested_date)}</span>
          </div>
        </div>

        {reschedule.reason && (
          <div className="stftd-reschedule-modal-reason">
            <span className="stftd-reschedule-modal-reason-label">Customer's reason</span>
            <p>"{reschedule.reason}"</p>
          </div>
        )}

        {mode === 'review' ? (
          <div className="stftd-modal-actions">
            <button className="stftd-btn-secondary" onClick={() => setMode('decline')} disabled={busy}>
              Decline
            </button>
            <button className="stftd-btn-confirm" onClick={() => onApprove()} disabled={busy}>
              {busy ? 'Approving...' : 'Approve'}
            </button>
          </div>
        ) : (
          <>
            <label className="stftd-reschedule-decline-label">
              Note to customer (optional)
              <textarea
                className="stftd-reschedule-decline-textarea"
                rows={4}
                placeholder="e.g. That date is fully booked for our installers..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <div className="stftd-modal-actions">
              <button className="stftd-btn-secondary" onClick={() => setMode('review')} disabled={busy}>
                Back
              </button>
              <button className="stftd-btn-danger-solid" onClick={() => onDecline(note)} disabled={busy}>
                {busy ? 'Declining...' : 'Decline Request'}
              </button>
            </div>
          </>
        )}

        {mode === 'review' && (
          <button className="stftd-reschedule-modal-later" onClick={onCancel} disabled={busy}>
            Review later
          </button>
        )}
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
    <div className={`stftd-toast ${type}`} role="status">
      {type === 'success' ? <CheckCircle2 size={17} /> : <AlertCircle size={17} />}
      {message}
    </div>
  );
}

/* ------------------------------------------------------------------ */

export default function StaffTicketDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const assignRef = useRef(null);

  const [ticket, setTicket] = useState(null);
  const [installers, setInstallers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [installerId, setInstallerId] = useState('');
  const [installerSearch, setInstallerSearch] = useState('');
  const [visitDate, setVisitDate] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [toast, setToast] = useState(null);

  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [resolvingReschedule, setResolvingReschedule] = useState(false);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function load() {
    try {
      const [ticketData, installerData] = await Promise.all([getStaffTickets(), getPartnerInstallers()]);
      const found = ticketData.find((t) => String(t.id) === String(id));
      setTicket(found || null);
      setInstallers(installerData);
    } catch {
      setError('Could not load this ticket.');
    } finally {
      setLoading(false);
    }
  }

  const canAssign = ticket && ticket.status === 'REQUEST_SUBMITTED';
  const isStopped = ticket && STOPPED_STATUSES.includes(ticket.status);
  const tagClass = ticket ? STATUS_TAG_CLASS[ticket.status] || 'in-progress' : 'in-progress';
  const goBack = () => navigate('/staff/manage-tickets');

  const selectedInstaller = installers.find((i) => String(i.id) === String(installerId));
  const readyToAssign = Boolean(selectedInstaller && visitDate);

  const searchTerm = installerSearch.trim().toLowerCase();
  const visibleInstallers = searchTerm
    ? installers.filter((i) =>
        `${i.full_name || ''} ${i.username || ''}`.toLowerCase().includes(searchTerm)
      )
    : installers;

  function installerLabel(i) {
    return (i?.full_name || '').trim() || i?.username || '';
  }

  function scrollToAssign() {
    assignRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function handleAssignClick() {
    if (!installerId || !visitDate) {
      setToast({ message: 'Please select a Partner Installer and a Visit Date.', type: 'error' });
      return;
    }
    setShowConfirm(true);
  }

  async function performAssign() {
    setAssigning(true);
    try {
      await assignPartnerInstaller(id, {
        partner_installer_id: installerId,
        visit_date: visitDate,
      });
      await load();
      setToast({ message: 'Partner Installer assigned successfully.', type: 'success' });
      setInstallerId('');
      setVisitDate('');
    } catch (err) {
      const msg =
        err?.response?.data?.non_field_errors?.[0] || 'Could not assign Partner Installer. Please try again.';
      setToast({ message: msg, type: 'error' });
    } finally {
      setAssigning(false);
      setShowConfirm(false);
    }
  }

  const pendingReschedule = ticket ? (ticket.reschedule_requests || []).find((r) => r.status === 'PENDING') : null;
  const resolvedReschedules = ticket ? (ticket.reschedule_requests || []).filter((r) => r.status !== 'PENDING') : [];

  async function handleApproveReschedule() {
    setResolvingReschedule(true);
    try {
      await resolveRescheduleRequest(id, pendingReschedule.id, 'APPROVE');
      await load();
      setToast({ message: 'Reschedule approved. The visit date has been updated.', type: 'success' });
      setShowRescheduleModal(false);
    } catch {
      setToast({ message: 'Could not approve the reschedule. Please try again.', type: 'error' });
    } finally {
      setResolvingReschedule(false);
    }
  }

  async function handleDeclineReschedule(note) {
    setResolvingReschedule(true);
    try {
      await resolveRescheduleRequest(id, pendingReschedule.id, 'DECLINE', note);
      await load();
      setToast({ message: 'Reschedule request declined.', type: 'success' });
      setShowRescheduleModal(false);
    } catch {
      setToast({ message: 'Could not decline the reschedule. Please try again.', type: 'error' });
    } finally {
      setResolvingReschedule(false);
    }
  }

  const customerName = ticket ? ticket.full_name || ticket.customer_username : '';
  const installerName = ticket?.partner_installer_username || '';
  const visitDays = daysFromToday(ticket?.visit_date);

  // Simple activity list from the dates we have
  const activity = ticket
    ? [
        { label: 'Request submitted', date: ticket.created_at, icon: FileText },
        ticket.assigned_at && { label: `Assigned to ${installerName || 'a Partner Installer'}`, date: ticket.assigned_at, icon: UserCheck },
        ticket.visit_date && { label: 'Site visit', date: ticket.visit_date, icon: CalendarDays, future: visitDays > 0 },
        ticket.withdrawn_at && { label: 'Withdrawn by customer', date: ticket.withdrawn_at, icon: Ban },
        ticket.completed_at && {
          label: ticket.status === 'COMPLETED' ? 'Installation completed' : 'Request closed',
          date: ticket.completed_at,
          icon: ticket.status === 'COMPLETED' ? Award : XCircle,
        },
      ].filter(Boolean)
    : [];

  return (
    <StaffLayout>
      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}

      <div className="stftd-page">
        {loading && <DetailSkeleton />}

        {!loading && error && (
          <EmptyState icon={AlertCircle} red title="Something went wrong" hint={error} onBack={goBack} />
        )}

        {!loading && !error && !ticket && (
          <EmptyState
            icon={SearchX}
            title="Ticket not found"
            hint="This ticket may have been removed, or the link is wrong."
            onBack={goBack}
          />
        )}

        {!loading && !error && ticket && (
          <>
            {/* ---------- Header ---------- */}
            <div className="stftd-hero">
              <div className="stftd-hero-glow" aria-hidden="true" />
              <div className="stftd-hero-top">
                <div className="stftd-hero-left">
                  <button className="stftd-back" onClick={goBack} aria-label="Back to Ticket Tracking">
                    <ArrowLeft size={18} />
                  </button>
                  <span className="stftd-hero-avatar">{getInitials(customerName)}</span>
                  <div className="stftd-hero-text">
                    <span className="stftd-hero-ticket">{ticket.ticket_number}</span>
                    <h1>{customerName}</h1>
                    <p>Submitted {formatLongDate(ticket.created_at)}</p>
                  </div>
                </div>
                <span className={`stftd-status-badge ${tagClass}`}>
                  <span className="stftd-status-dot" />
                  {ticket.status_display}
                </span>
              </div>

              {isStopped ? (
                <div className={`stftd-stopped ${ticket.status === 'WITHDRAWN' ? 'gray' : 'red'}`}>
                  {ticket.status === 'WITHDRAWN' ? <Ban size={16} /> : <XCircle size={16} />}
                  This request is closed: {ticket.status_display}.
                </div>
              ) : (
                <ProgressTracker status={ticket.status} />
              )}
            </div>

            {/* ---------- Pending reschedule ---------- */}
            {pendingReschedule && (
              <div className="stftd-reschedule-banner">
                <span className="stftd-reschedule-banner-icon">
                  <CalendarClock size={18} />
                </span>
                <div className="stftd-reschedule-banner-text">
                  <strong>The customer asked for a new visit date</strong>
                  <span>
                    {formatDate(ticket.visit_date)} <ArrowRight size={13} />{' '}
                    <b>{formatDate(pendingReschedule.requested_date)}</b>
                  </span>
                </div>
                <button className="stftd-reschedule-banner-btn" onClick={() => setShowRescheduleModal(true)}>
                  Review Request
                </button>
              </div>
            )}

            {/* ---------- Admin returned it ---------- */}
            {ticket.admin_revision_notes && ticket.status === 'STAFF_REVIEW' && (
              <div className="stftd-revision-note">
                <MessageSquareWarning size={18} />
                <div>
                  <strong>Returned by the Admin for revision</strong>
                  <p>{ticket.admin_revision_notes}</p>
                </div>
              </div>
            )}

            <div className="stftd-layout">
              {/* ================= Main column ================= */}
              <div className="stftd-main">
                <NextStep ticket={ticket} installerName={installerName} onAssignClick={scrollToAssign} />

                {/* Request details */}
                <section className="stftd-card">
                  <CardTitle icon={FileText} tone="navy" title="Request Details" sub="What the customer asked for" />
                  <div className="stftd-tiles">
                    <InfoTile icon={Sun} tone="amber" label="Preferred Package" value={ticket.solar_package || '—'} />
                    <InfoTile
                      icon={Zap}
                      tone="blue"
                      label="System Type"
                      value={ticket.system_type === 'ON_GRID' ? 'On-Grid' : 'Hybrid'}
                    />
                    <InfoTile icon={CalendarDays} tone="navy" label="Date Submitted" value={formatDate(ticket.created_at)} />
                    <InfoTile
                      icon={CalendarClock}
                      tone="green"
                      label="Visit Date"
                      value={ticket.visit_date ? formatDate(ticket.visit_date) : 'Not set yet'}
                      sub={ticket.visit_date ? whenText(visitDays) : canAssign ? 'Set when you assign an installer' : ''}
                    />
                  </div>
                </section>

                {/* Assign / assigned installer */}
                {canAssign && (
                  <section className="stftd-card stftd-assign-card" ref={assignRef}>
                    <CardTitle
                      icon={UserCheck}
                      tone="gold"
                      title="Assign Partner Installer"
                      sub="Choose who will visit the property and when"
                    />

                    <div className="stftd-assign-layout">
                      <div className="stftd-assign-col">
                        <div className="stftd-step-row">
                          <div className="stftd-step-label">
                            <span className={`stftd-step-num ${selectedInstaller ? 'done' : ''}`}>
                              {selectedInstaller ? <Check size={12} strokeWidth={3} /> : 1}
                            </span>
                            Choose a Partner Installer
                          </div>
                          {installers.length > 4 && (
                            <div className="stftd-search">
                              <Search size={14} />
                              <input
                                type="text"
                                placeholder="Search name"
                                value={installerSearch}
                                onChange={(e) => setInstallerSearch(e.target.value)}
                              />
                            </div>
                          )}
                        </div>

                        {installers.length === 0 ? (
                          <div className="stftd-installer-empty">No active Partner Installers available.</div>
                        ) : visibleInstallers.length === 0 ? (
                          <div className="stftd-installer-empty">No installer matches "{installerSearch}".</div>
                        ) : (
                          <div className="stftd-installer-list">
                            {visibleInstallers.map((i) => {
                              const isSelected = String(installerId) === String(i.id);
                              const active = Number(i.active_tickets_count || 0);
                              const done = Number(i.completed_tickets_count || 0);
                              return (
                                <button
                                  key={i.id}
                                  type="button"
                                  className={`stftd-installer-card ${isSelected ? 'selected' : ''}`}
                                  onClick={() => setInstallerId(i.id)}
                                  aria-pressed={isSelected}
                                >
                                  <span className="stftd-installer-avatar">{getInitials(installerLabel(i))}</span>
                                  <span className="stftd-installer-info">
                                    <span className="stftd-installer-name">{installerLabel(i)}</span>
                                    <span className="stftd-installer-meta">
                                      {i.full_name ? `@${i.username} · ` : ''}
                                      {done} done
                                    </span>
                                  </span>
                                  <span className={`stftd-load ${active === 0 ? 'free' : active >= 3 ? 'busy' : ''}`}>
                                    <Briefcase size={12} />
                                    {active === 0 ? 'Free' : `${active} active`}
                                  </span>
                                  <span className="stftd-installer-radio" aria-hidden="true">
                                    {isSelected && <Check size={12} strokeWidth={3} />}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      <div className="stftd-assign-col">
                        <div className="stftd-step-row">
                          <div className="stftd-step-label">
                            <span className={`stftd-step-num ${visitDate ? 'done' : ''}`}>
                              {visitDate ? <Check size={12} strokeWidth={3} /> : 2}
                            </span>
                            Pick a Visit Date
                          </div>
                        </div>
                        <VisitDatePicker value={visitDate} onChange={setVisitDate} />
                      </div>
                    </div>

                    <div className={`stftd-assign-summary ${readyToAssign ? 'ready' : ''}`}>
                      {readyToAssign ? (
                        <>
                          <span className="stftd-installer-avatar small">
                            {getInitials(installerLabel(selectedInstaller))}
                          </span>
                          <p>
                            <strong>{installerLabel(selectedInstaller)}</strong> will visit on{' '}
                            <strong>{formatLongDate(visitDate)}</strong>
                          </p>
                        </>
                      ) : (
                        <p className="stftd-assign-summary-hint">
                          Choose a Partner Installer and a visit date to continue.
                        </p>
                      )}
                    </div>

                    <button
                      className="stftd-assign-button"
                      onClick={handleAssignClick}
                      disabled={assigning || !readyToAssign}
                    >
                      <Send size={16} />
                      Confirm Assignment &amp; Notify Partner Installer
                    </button>
                    <p className="stftd-assign-footnote">
                      The Partner Installer gets an email and a notification right away.
                    </p>
                  </section>
                )}

                {!canAssign && installerName && (
                  <section className="stftd-card">
                    <CardTitle icon={UserCheck} tone="green" title="Partner Installer" sub="Who is handling this request" />
                    <div className="stftd-assigned">
                      <div className="stftd-assigned-person">
                        <span className="stftd-installer-avatar">{getInitials(installerName)}</span>
                        <div>
                          <span className="stftd-assigned-label">Assigned to</span>
                          <span className="stftd-assigned-value">{installerName}</span>
                        </div>
                      </div>
                      <div className="stftd-assigned-date">
                        <span className="stftd-assigned-cal">
                          <span>
                            {ticket.visit_date
                              ? new Date(ticket.visit_date).toLocaleDateString('en-US', { month: 'short' })
                              : '—'}
                          </span>
                          <strong>{ticket.visit_date ? new Date(ticket.visit_date).getDate() : ''}</strong>
                        </span>
                        <div>
                          <span className="stftd-assigned-label">Visit date</span>
                          <span className="stftd-assigned-value">{formatLongDate(ticket.visit_date)}</span>
                          {ticket.visit_date && <span className="stftd-assigned-when">{whenText(visitDays)}</span>}
                        </div>
                      </div>
                    </div>
                  </section>
                )}

                {/* Reschedule history */}
                {resolvedReschedules.length > 0 && (
                  <section className="stftd-card">
                    <CardTitle
                      icon={History}
                      tone="gray"
                      title="Reschedule History"
                      sub={`${resolvedReschedules.length} past request${resolvedReschedules.length === 1 ? '' : 's'}`}
                    />
                    <ul className="stftd-history">
                      {resolvedReschedules.map((r) => (
                        <li key={r.id} className="stftd-history-row">
                          <span className={`stftd-history-tag ${r.status === 'APPROVED' ? 'approved' : 'declined'}`}>
                            {r.status === 'APPROVED' ? <Check size={12} strokeWidth={3} /> : <XCircle size={12} />}
                            {r.status_display}
                          </span>
                          <div className="stftd-history-text">
                            <span>
                              Asked for <strong>{formatDate(r.requested_date)}</strong>
                            </span>
                            {r.staff_response_note && <em>"{r.staff_response_note}"</em>}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </div>

              {/* ================= Side column ================= */}
              <aside className="stftd-side">
                <section className="stftd-card stftd-customer">
                  <CardTitle icon={User} tone="navy" title="Customer" />
                  <div className="stftd-customer-head">
                    <span className="stftd-customer-avatar">{getInitials(customerName)}</span>
                    <div>
                      <strong>{customerName}</strong>
                      {ticket.customer_username && ticket.full_name && <span>@{ticket.customer_username}</span>}
                    </div>
                  </div>

                  <ul className="stftd-contact-list">
                    <li>
                      <span className="stftd-contact-icon">
                        <Phone size={15} />
                      </span>
                      <div>
                        <span className="stftd-contact-label">Contact number</span>
                        {ticket.contact_number ? (
                          <a href={`tel:${ticket.contact_number}`} className="stftd-contact-value link">
                            {ticket.contact_number}
                          </a>
                        ) : (
                          <span className="stftd-contact-value muted">Not provided</span>
                        )}
                      </div>
                    </li>
                    <li>
                      <span className="stftd-contact-icon">
                        <MapPin size={15} />
                      </span>
                      <div>
                        <span className="stftd-contact-label">Property address</span>
                        <span className="stftd-contact-value">{ticket.property_address || '—'}</span>
                        {ticket.property_address && (
                          <div className="stftd-directions">
                            <DirectionsLink address={ticket.property_address} />
                          </div>
                        )}
                      </div>
                    </li>
                  </ul>
                </section>

                <section className="stftd-card">
                  <CardTitle icon={Clock} tone="blue" title="Activity" />
                  <ol className="stftd-activity">
                    {activity.map((a) => {
                      const Icon = a.icon;
                      return (
                        <li key={a.label} className={a.future ? 'future' : ''}>
                          <span className="stftd-activity-dot">
                            <Icon size={13} />
                          </span>
                          <div>
                            <strong>{a.label}</strong>
                            <span>
                              {formatDate(a.date)}
                              {a.future ? ' · upcoming' : ''}
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </section>
              </aside>
            </div>
          </>
        )}
      </div>

      {showConfirm && (
        <ConfirmModal
          installerName={installerLabel(selectedInstaller)}
          visitDate={visitDate}
          busy={assigning}
          onCancel={() => setShowConfirm(false)}
          onConfirm={performAssign}
        />
      )}

      {showRescheduleModal && pendingReschedule && (
        <RescheduleModal
          ticket={ticket}
          reschedule={pendingReschedule}
          busy={resolvingReschedule}
          onCancel={() => setShowRescheduleModal(false)}
          onApprove={handleApproveReschedule}
          onDecline={handleDeclineReschedule}
        />
      )}
    </StaffLayout>
  );
}