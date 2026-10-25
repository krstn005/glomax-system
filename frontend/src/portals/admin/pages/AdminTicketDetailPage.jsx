import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  MapPin,
  X,
  Phone,
  Package,
  Zap,
  HardHat,
  CalendarDays,
  ClipboardList,
  FileText,
  FileCheck,
  Star,
  ShieldCheck,
  CheckCircle2,
  RotateCcw,
  AlertCircle,
  SearchX,
  Image as ImageIcon,
  StickyNote,
  Navigation,
  Ruler,
  LayoutGrid,
  Cpu,
  Check,
  XCircle,
  MinusCircle,
  User,
  FileDown,
  Loader2,
} from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import { getAdminTickets } from '../../../api/adminTickets';
import { approveTicket, returnForRevision } from '../../../api/adminTicketActions';
import { downloadFinalSheetPDF } from '../../../api/tickets';
import '../styles/admin-ticket-detail.css';

// Badge colour for each status (system colours only)
const STATUS_TONE = {
  REQUEST_SUBMITTED: 'navy',
  PI_ASSIGNED: 'blue',
  ASSESSMENT_SUBMITTED: 'blue',
  STAFF_REVIEW: 'blue',
  ADMIN_REVIEW: 'gold',
  APPROVED: 'green',
  COMPLETED: 'green',
  NC_CANNOT_PROCEED: 'red',
  NC_CAN_REAPPLY: 'red',
  WITHDRAWN: 'gray',
};

const SYSTEM_TYPE_LABEL = {
  ON_GRID: 'On-Grid',
  HYBRID: 'Hybrid',
};

// The steps every ticket goes through
const STEPS = [
  { key: 'submitted', label: 'Submitted' },
  { key: 'assigned', label: 'Installer Assigned' },
  { key: 'assessed', label: 'Roof Assessed' },
  { key: 'review', label: 'Staff Review' },
  { key: 'admin', label: 'Your Approval' },
  { key: 'approved', label: 'Approved' },
  { key: 'installed', label: 'Installed' },
];

// The step each status is on right now (1 = Submitted ... 7 = Installed)
const STATUS_STEP = {
  REQUEST_SUBMITTED: 2,
  PI_ASSIGNED: 3,
  ASSESSMENT_SUBMITTED: 4,
  STAFF_REVIEW: 4,
  ADMIN_REVIEW: 5,
  APPROVED: 7,
  COMPLETED: 7,
};

const CONDITION_TONE = { GOOD: 'green', FAIR: 'gold', POOR: 'red' };

function formatDate(value, month = 'short') {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-US', { month, day: 'numeric', year: 'numeric' });
}

function formatPeso(value) {
  const n = Number(value);
  if (value === '' || value === null || value === undefined || Number.isNaN(n)) return '—';
  return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getInitials(name) {
  const parts = (name || '?').trim().split(/\s+/);
  const first = parts[0]?.[0] || '?';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : parts[0]?.[1] || '';
  return (first + last).toUpperCase();
}

// Newest Updated quotation, or the Initial one if there's no update yet
function getLatestQuotation(quotations = []) {
  if (!quotations.length) return null;
  const updated = quotations
    .filter((q) => q.quotation_type === 'UPDATED')
    .sort((a, b) => new Date(b.sent_at || 0) - new Date(a.sent_at || 0));
  return updated[0] || quotations.find((q) => q.quotation_type === 'INITIAL') || quotations[quotations.length - 1];
}

// Works out where the ticket is on the progress line.
// Closed tickets (not compatible / withdrawn) stop where they were.
function getProgress(ticket) {
  if (STATUS_STEP[ticket.status] !== undefined) {
    return { reached: STATUS_STEP[ticket.status], stop: null };
  }
  let reached = 2;
  if (ticket.partner_installer_username) reached = 3;
  if (ticket.assessment) reached = 4;
  if ((ticket.quotations || []).length > 0) reached = 5;
  const notCompatible = ticket.status === 'NC_CANNOT_PROCEED' || ticket.status === 'NC_CAN_REAPPLY';
  return {
    reached,
    stop: {
      label: ticket.status_display || (notCompatible ? 'Not Compatible' : 'Withdrawn'),
      tone: notCompatible ? 'red' : 'gray',
      icon: notCompatible ? XCircle : MinusCircle,
    },
  };
}

function Toast({ message, type = 'success', onDone }) {
  useEffect(() => {
    const timer = setTimeout(onDone, 4000);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <div className={`admtd-toast ${type}`} role="status">
      {type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
      {message}
    </div>
  );
}

function SectionTitle({ icon: Icon, tone, title, subtitle, children }) {
  return (
    <div className="admtd-section-head">
      <span className={`admtd-section-icon tone-${tone}`}>
        <Icon size={18} />
      </span>
      <div className="admtd-section-text">
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function Field({ label, children, tone }) {
  return (
    <div className="admtd-field">
      <span className="admtd-field-label">{label}</span>
      <span className="admtd-field-value">
        {tone && <span className={`admtd-dot tone-${tone}`} />}
        {children}
      </span>
    </div>
  );
}

function InfoRow({ icon: Icon, label, children }) {
  return (
    <div className="admtd-info-row">
      <span className="admtd-info-icon">
        <Icon size={15} />
      </span>
      <div className="admtd-info-text">
        <span className="admtd-field-label">{label}</span>
        <span className="admtd-info-value">{children}</span>
      </div>
    </div>
  );
}

function StatBox({ icon: Icon, label, value, unit }) {
  return (
    <div className="admtd-stat">
      <span className="admtd-stat-icon">
        <Icon size={16} />
      </span>
      <span className="admtd-stat-label">{label}</span>
      <span className="admtd-stat-value">
        {value ?? '—'}
        {unit && <small>{unit}</small>}
      </span>
    </div>
  );
}

function StarRow({ rating }) {
  return (
    <span className="admtd-stars" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={18}
          fill={n <= rating ? '#facc15' : 'none'}
          color={n <= rating ? '#eab308' : '#d1d5db'}
        />
      ))}
    </span>
  );
}

function ProgressLine({ ticket }) {
  const { reached, stop } = getProgress(ticket);
  const StopIcon = stop?.icon;
  const allDone = !stop && ticket.status === 'COMPLETED';
  const nowStep = STEPS[reached - 1];
  return (
    <div className="admtd-progress" aria-label="Ticket progress">
      <ol className="admtd-steps">
        {STEPS.map((step, i) => {
          const n = i + 1;
          const done = n < reached || (n === reached && !stop && ticket.status === 'COMPLETED');
          const current = n === reached && !done;
          return (
            <li
              key={step.key}
              className={`admtd-step ${done ? 'done' : ''} ${current ? (stop ? 'stopped' : 'current') : ''}`}
            >
              <span className="admtd-step-dot">{done ? <Check size={13} /> : n}</span>
              <span className="admtd-step-label">{step.label}</span>
            </li>
          );
        })}
      </ol>
      {/* Small screens: one line instead of seven labels */}
      {!stop && (
        <p className="admtd-progress-now">
          {allDone ? (
            <strong>All steps done</strong>
          ) : (
            <>
              Step {reached} of {STEPS.length} · <strong>{nowStep.label}</strong>
            </>
          )}
        </p>
      )}
      {stop && (
        <p className={`admtd-progress-stop tone-${stop.tone}`}>
          <StopIcon size={15} />
          Closed as <strong>{stop.label}</strong>
        </p>
      )}
    </div>
  );
}

function PhotoLightbox({ photo, onClose }) {
  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div className="admtd-lightbox" onClick={onClose}>
      <button type="button" className="admtd-lightbox-close" onClick={onClose} aria-label="Close photo">
        <X size={20} />
      </button>
      <img
        src={photo.image}
        alt="Proof of visit"
        className="admtd-lightbox-img"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="admtd-stack" aria-busy="true">
      <span className="admtd-skel admtd-skel-hero" />
      <span className="admtd-skel admtd-skel-progress" />
      <div className="admtd-layout">
        <div className="admtd-main">
          <span className="admtd-skel admtd-skel-card" />
        </div>
        <aside className="admtd-side">
          <span className="admtd-skel admtd-skel-side" />
        </aside>
      </div>
    </div>
  );
}

function StateCard({ icon: Icon, red, title, hint, children }) {
  return (
    <div className="admtd-card">
      <div className="admtd-state">
        <span className={`admtd-state-badge ${red ? 'red' : ''}`}>
          <Icon size={26} />
        </span>
        <p className="admtd-state-title">{title}</p>
        <p className="admtd-state-hint">{hint}</p>
        <div className="admtd-state-actions">{children}</div>
      </div>
    </div>
  );
}

// Gold button in the banner that downloads the Final Sheet PDF.
// Only shows once the ticket has a Final Sheet.
function FinalSheetButton({ ticket }) {
  const [state, setState] = useState('idle'); // idle | loading | error

  async function download() {
    if (state === 'loading') return;
    setState('loading');
    try {
      await downloadFinalSheetPDF(ticket.id, ticket.ticket_number);
      setState('idle');
    } catch {
      setState('error');
      setTimeout(() => setState('idle'), 3000);
    }
  }

  return (
    <button
      type="button"
      className={`admtd-pdf-btn ${state === 'error' ? 'error' : ''}`}
      onClick={download}
      disabled={state === 'loading'}
    >
      {state === 'loading' ? (
        <Loader2 size={16} className="admtd-spin" />
      ) : state === 'error' ? (
        <AlertCircle size={16} />
      ) : (
        <FileDown size={16} />
      )}
      {state === 'loading' ? 'Preparing...' : state === 'error' ? 'Try again' : 'Final Sheet PDF'}
    </button>
  );
}

export default function AdminTicketDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);
  const [lightboxPhoto, setLightboxPhoto] = useState(null);

  const [showApproveModal, setShowApproveModal] = useState(false);
  const [finalCost, setFinalCost] = useState('');
  const [paymentTermsSummary, setPaymentTermsSummary] = useState('');
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState('');

  const [showReturnModal, setShowReturnModal] = useState(false);
  const [revisionNotes, setRevisionNotes] = useState('');
  const [returning, setReturning] = useState(false);
  const [returnError, setReturnError] = useState('');

  useEffect(() => {
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function load(showSkeleton = false) {
    if (showSkeleton) setLoading(true);
    try {
      const data = await getAdminTickets();
      const found = data.find((t) => String(t.id) === String(id));
      setTicket(found || null);
      setError('');
    } catch {
      setError('Could not load this ticket. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const goBack = () => navigate('/admin/requests');
  const canDecide = ticket && ticket.status === 'ADMIN_REVIEW';
  const assessment = ticket?.assessment;
  const quotations = ticket?.quotations || [];
  const latestQuotation = getLatestQuotation(quotations);
  const tone = ticket ? STATUS_TONE[ticket.status] || 'blue' : 'blue';
  const name = ticket ? ticket.full_name || ticket.customer_username : '';
  const systemType = ticket ? SYSTEM_TYPE_LABEL[ticket.system_type] || ticket.system_type_display || '—' : '—';

  // Opens the Approve popup with the latest quotation filled in
  function openApprove() {
    setFinalCost(latestQuotation?.estimated_cost ? String(Number(latestQuotation.estimated_cost)) : '');
    setPaymentTermsSummary(latestQuotation?.payment_terms_description || '');
    setApproveError('');
    setShowApproveModal(true);
  }

  function openReturn() {
    setRevisionNotes('');
    setReturnError('');
    setShowReturnModal(true);
  }

  async function handleApprove() {
    if (!finalCost || !paymentTermsSummary.trim()) {
      setApproveError('Please enter both a final cost and payment terms summary.');
      return;
    }
    if (!(Number(finalCost) > 0)) {
      setApproveError('Please enter a final cost above ₱0.');
      return;
    }
    setApproving(true);
    setApproveError('');
    try {
      await approveTicket(id, { final_cost: finalCost, payment_terms_summary: paymentTermsSummary.trim() });
      await load();
      setToast({ message: 'Ticket approved successfully.', type: 'success' });
      setShowApproveModal(false);
      setFinalCost('');
      setPaymentTermsSummary('');
    } catch (err) {
      setApproveError(err.response?.data?.non_field_errors?.[0] || 'Could not approve this ticket.');
    } finally {
      setApproving(false);
    }
  }

  async function handleReturn() {
    if (!revisionNotes.trim()) {
      setReturnError('Please explain what needs revising.');
      return;
    }
    setReturning(true);
    setReturnError('');
    try {
      await returnForRevision(id, revisionNotes.trim());
      await load();
      setToast({ message: 'Ticket returned to Staff for revision.', type: 'success' });
      setShowReturnModal(false);
      setRevisionNotes('');
    } catch (err) {
      setReturnError(err.response?.data?.non_field_errors?.[0] || 'Could not return this ticket.');
    } finally {
      setReturning(false);
    }
  }

  const mapsUrl = ticket?.property_address
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(ticket.property_address)}`
    : null;

  return (
    <AdminLayout>
      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}

      <div className="admtd-page">
        {loading && <DetailSkeleton />}

        {!loading && error && (
          <StateCard icon={AlertCircle} red title="Something went wrong" hint={error}>
            <button type="button" className="admtd-btn-secondary" onClick={goBack}>
              Back to Requests
            </button>
            <button type="button" className="admtd-btn-primary" onClick={() => load(true)}>
              Try again
            </button>
          </StateCard>
        )}

        {!loading && !error && !ticket && (
          <StateCard
            icon={SearchX}
            title="Ticket not found"
            hint="This ticket may have been removed, or the link is wrong."
          >
            <button type="button" className="admtd-btn-primary" onClick={goBack}>
              Back to Requests
            </button>
          </StateCard>
        )}

        {!loading && !error && ticket && (
          <div className="admtd-stack">
            {/* ---------- Header ---------- */}
            <section className={`admtd-hero ${canDecide ? 'urgent' : ''}`}>
              <div className="admtd-hero-glow" aria-hidden="true" />
              <button type="button" className="admtd-back" onClick={goBack} aria-label="Back to Requests">
                <ArrowLeft size={18} />
              </button>
              <span className="admtd-hero-avatar">{getInitials(name)}</span>
              <div className="admtd-hero-text">
                <span className="admtd-hero-kicker">{ticket.ticket_number}</span>
                <h1>{name}</h1>
                <p>
                  <CalendarDays size={14} />
                  Submitted {formatDate(ticket.created_at, 'long')}
                </p>
              </div>
              <div className="admtd-hero-side">
                <span className={`admtd-status tone-${tone}`}>{ticket.status_display}</span>
                {ticket.final_sheet && <FinalSheetButton ticket={ticket} />}
              </div>
            </section>

            {/* ---------- Progress ---------- */}
            <ProgressLine ticket={ticket} />

            {/* ---------- Admin decision - only when waiting for Admin ---------- */}
            {canDecide && (
              <section className="admtd-decision">
                <span className="admtd-decision-icon">
                  <ShieldCheck size={22} />
                </span>
                <div className="admtd-decision-text">
                  <p className="admtd-decision-title">This ticket is waiting for your approval</p>
                  <p className="admtd-decision-hint">
                    Approve it to create the Final Sheet, or return it to Staff if something needs fixing first.
                  </p>
                </div>
                <div className="admtd-decision-actions">
                  <button type="button" className="admtd-btn-outline" onClick={openReturn}>
                    <RotateCcw size={15} />
                    Return for Revision
                  </button>
                  <button type="button" className="admtd-btn-approve" onClick={openApprove}>
                    <CheckCircle2 size={15} />
                    Approve
                  </button>
                </div>
              </section>
            )}

            <div className="admtd-layout">
              <div className="admtd-main">
                {/* ---------- Roof assessment ---------- */}
                <section className="admtd-card">
                  <SectionTitle
                    icon={ClipboardList}
                    tone="blue"
                    title="Roof Assessment"
                    subtitle={
                      assessment?.submitted_at
                        ? `Sent by the Partner Installer on ${formatDate(assessment.submitted_at)}`
                        : 'Done by the Partner Installer during the site visit'
                    }
                  />

                  {!assessment ? (
                    <div className="admtd-empty">
                      <span className="admtd-empty-badge">
                        <ClipboardList size={22} />
                      </span>
                      <p className="admtd-empty-title">No assessment yet</p>
                      <p className="admtd-empty-hint">
                        {ticket.status === 'WITHDRAWN' || ticket.status.startsWith('NC_')
                          ? 'This ticket was closed before a roof assessment was sent.'
                          : "The Partner Installer hasn't sent the roof assessment yet."}
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="admtd-stats">
                        <StatBox icon={Ruler} label="Roof Area" value={assessment.estimated_roof_area_sqm} unit="sq.m" />
                        <StatBox icon={Zap} label="Capacity" value={assessment.rated_capacity_kw} unit="kW" />
                        <StatBox icon={LayoutGrid} label="Solar Panels" value={assessment.number_of_solar_panels} unit="pcs" />
                        <StatBox icon={Cpu} label="Inverter" value={assessment.inverter_size_kw} unit="kW" />
                      </div>

                      <div className="admtd-grid">
                        <Field label="Recommended Package">{assessment.recommended_package || '—'}</Field>
                        <Field label="Recommended System">{assessment.recommended_system_type_display || '—'}</Field>
                        <Field label="Roof Type">{assessment.roof_type_display || '—'}</Field>
                        <Field label="Roof Condition" tone={CONDITION_TONE[assessment.roof_condition]}>
                          {assessment.roof_condition_display || '—'}
                        </Field>
                      </div>

                      {assessment.notes && (
                        <div className="admtd-notes">
                          <p className="admtd-notes-label">
                            <StickyNote size={13} />
                            Partner Installer Notes
                          </p>
                          <p className="admtd-notes-text">{assessment.notes}</p>
                        </div>
                      )}

                      {assessment.photos && assessment.photos.length > 0 && (
                        <div className="admtd-photos">
                          <p className="admtd-sub-label">
                            <ImageIcon size={13} />
                            Proof of Visit Photos
                            <span className="admtd-count">{assessment.photos.length}</span>
                          </p>
                          <div className="admtd-photo-grid">
                            {assessment.photos.map((photo) => (
                              <button
                                key={photo.id}
                                type="button"
                                className="admtd-photo"
                                onClick={() => setLightboxPhoto(photo)}
                                aria-label="View photo"
                              >
                                <img src={photo.image} alt="Proof of visit" />
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </section>

                {/* ---------- Quotations ---------- */}
                {quotations.length > 0 && (
                  <section className="admtd-card">
                    <SectionTitle
                      icon={FileText}
                      tone="gold"
                      title="Quotations"
                      subtitle={`${quotations.length} sent to the customer. The latest one is used for approval.`}
                    />
                    <div className="admtd-quote-list">
                      {quotations.map((q) => {
                        const isLatest = latestQuotation && q.id === latestQuotation.id;
                        return (
                          <div key={q.id} className={`admtd-quote ${isLatest ? 'latest' : ''}`}>
                            <div className="admtd-quote-top">
                              <span className="admtd-quote-type">{q.quotation_type_display}</span>
                              {isLatest && <span className="admtd-latest-tag">Latest</span>}
                              {q.sent_at && <span className="admtd-quote-date">Sent {formatDate(q.sent_at)}</span>}
                            </div>
                            <p className="admtd-quote-price">{formatPeso(q.estimated_cost)}</p>
                            <div className="admtd-quote-rows">
                              <div>
                                <span className="admtd-field-label">Package</span>
                                <p>{q.package_details || '—'}</p>
                              </div>
                              <div>
                                <span className="admtd-field-label">Payment Terms</span>
                                <p>{q.payment_terms_description || '—'}</p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                )}

                {/* ---------- Final sheet ---------- */}
                {ticket.final_sheet && (
                  <section className="admtd-card">
                    <SectionTitle
                      icon={FileCheck}
                      tone="green"
                      title="Final Sheet"
                      subtitle={`Approved on ${formatDate(ticket.final_sheet.approved_at, 'long')}`}
                    />
                    <div className="admtd-final">
                      <div className="admtd-final-main">
                        <span className="admtd-final-label">Final Cost</span>
                        <p className="admtd-final-price">{formatPeso(ticket.final_sheet.final_cost)}</p>
                      </div>
                      <div className="admtd-final-terms">
                        <span className="admtd-field-label">Payment Terms</span>
                        <p>{ticket.final_sheet.payment_terms_summary || '—'}</p>
                      </div>
                    </div>
                  </section>
                )}

                {/* ---------- Customer feedback ---------- */}
                {ticket.feedback && (
                  <section className="admtd-card">
                    <SectionTitle icon={Star} tone="gold" title="Customer Feedback" subtitle="How the customer rated the installation" />
                    <div className="admtd-feedback">
                      <div className="admtd-feedback-top">
                        <StarRow rating={Number(ticket.feedback.rating) || 0} />
                        <span className="admtd-feedback-score">{ticket.feedback.rating} / 5</span>
                      </div>
                      {ticket.feedback.comments ? (
                        <p className="admtd-feedback-text">&ldquo;{ticket.feedback.comments}&rdquo;</p>
                      ) : (
                        <p className="admtd-feedback-text muted">No written comment.</p>
                      )}
                    </div>
                  </section>
                )}
              </div>

              {/* ---------- Side: customer and job details ---------- */}
              <aside className="admtd-side">
                <section className="admtd-card admtd-side-card">
                  <p className="admtd-side-label">Customer</p>

                  <InfoRow icon={User} label="Username">
                    @{ticket.customer_username || '—'}
                  </InfoRow>
                  <InfoRow icon={Phone} label="Contact">
                    {ticket.contact_number ? (
                      <a href={`tel:${ticket.contact_number}`} className="admtd-tel">
                        {ticket.contact_number}
                      </a>
                    ) : (
                      <span className="admtd-muted">No number</span>
                    )}
                  </InfoRow>
                  <InfoRow icon={MapPin} label="Property Address">
                    {ticket.property_address || <span className="admtd-muted">No address</span>}
                  </InfoRow>
                  {mapsUrl && (
                    <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="admtd-directions">
                      <Navigation size={14} />
                      Get Directions
                    </a>
                  )}
                </section>

                <section className="admtd-card admtd-side-card">
                  <p className="admtd-side-label">Job Details</p>
                  <InfoRow icon={Package} label="Package">
                    {ticket.solar_package || '—'}
                  </InfoRow>
                  <InfoRow icon={Zap} label="System Type">
                    {systemType}
                  </InfoRow>
                  <InfoRow icon={HardHat} label="Partner Installer">
                    {ticket.partner_installer_username || <span className="admtd-unassigned">Not assigned</span>}
                  </InfoRow>
                  <InfoRow icon={CalendarDays} label="Visit Date">
                    {ticket.visit_date ? formatDate(ticket.visit_date) : <span className="admtd-muted">Not set</span>}
                  </InfoRow>
                </section>
              </aside>
            </div>
          </div>
        )}
      </div>

      {lightboxPhoto && <PhotoLightbox photo={lightboxPhoto} onClose={() => setLightboxPhoto(null)} />}

      {/* Approve popup */}
      {showApproveModal && (
        <div className="admtd-modal-overlay" onClick={() => !approving && setShowApproveModal(false)}>
          <div className="admtd-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <span className="admtd-modal-icon green">
              <CheckCircle2 size={22} />
            </span>
            <h3>Approve Ticket?</h3>
            <p>This creates the Final Sheet for {ticket?.ticket_number}. Check the price and payment terms below.</p>

            {latestQuotation && (
              <p className="admtd-modal-hint">Filled in from the latest quotation. You can still change them.</p>
            )}

            <label className="admtd-modal-field">
              <span>Final Cost (₱)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={finalCost}
                onChange={(e) => {
                  setFinalCost(e.target.value);
                  setApproveError('');
                }}
                className="admtd-input"
                placeholder="e.g. 255000"
              />
              {finalCost && Number(finalCost) > 0 && (
                <span className="admtd-price-preview">{formatPeso(finalCost)}</span>
              )}
            </label>

            <label className="admtd-modal-field">
              <span>Payment Terms Summary</span>
              <textarea
                value={paymentTermsSummary}
                onChange={(e) => {
                  setPaymentTermsSummary(e.target.value);
                  setApproveError('');
                }}
                rows={3}
                className="admtd-input"
                placeholder="e.g. 30% Down Payment, 70% Upon Installation"
              />
            </label>

            {approveError && (
              <p className="admtd-modal-error">
                <AlertCircle size={14} />
                {approveError}
              </p>
            )}

            <div className="admtd-modal-actions">
              <button
                type="button"
                className="admtd-btn-secondary"
                onClick={() => setShowApproveModal(false)}
                disabled={approving}
              >
                Cancel
              </button>
              <button type="button" className="admtd-btn-approve" onClick={handleApprove} disabled={approving}>
                {approving ? 'Approving...' : 'Confirm Approval'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Return for revision popup */}
      {showReturnModal && (
        <div className="admtd-modal-overlay" onClick={() => !returning && setShowReturnModal(false)}>
          <div className="admtd-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <span className="admtd-modal-icon gold">
              <RotateCcw size={22} />
            </span>
            <h3>Return for Revision?</h3>
            <p>Explain what Staff needs to fix before sending it back to you.</p>

            <label className="admtd-modal-field">
              <span>Revision Notes</span>
              <textarea
                value={revisionNotes}
                onChange={(e) => {
                  setRevisionNotes(e.target.value);
                  setReturnError('');
                }}
                rows={4}
                className="admtd-input"
                placeholder="e.g. Please recheck the inverter size in the quotation."
              />
            </label>

            {returnError && (
              <p className="admtd-modal-error">
                <AlertCircle size={14} />
                {returnError}
              </p>
            )}

            <div className="admtd-modal-actions">
              <button
                type="button"
                className="admtd-btn-secondary"
                onClick={() => setShowReturnModal(false)}
                disabled={returning}
              >
                Cancel
              </button>
              <button type="button" className="admtd-btn-primary" onClick={handleReturn} disabled={returning}>
                {returning ? 'Sending...' : 'Confirm Return'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}