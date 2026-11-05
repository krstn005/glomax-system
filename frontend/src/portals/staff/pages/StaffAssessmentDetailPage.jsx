import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  X,
  User,
  Phone,
  MapPin,
  HardHat,
  Package,
  Zap,
  Ruler,
  Home,
  ShieldCheck,
  Sun,
  Cpu,
  Grid3x3,
  Gauge,
  StickyNote,
  Camera,
  Undo2,
  Receipt,
  Wallet,
  CalendarClock,
  Send,
  Gavel,
  CheckCircle2,
  XCircle,
  RotateCcw,
  AlertCircle,
  ClipboardList,
  ZoomIn,
  Lock,
} from "lucide-react";
import StaffLayout from "../components/StaffLayout";
import ReapplyDaysField, { DEFAULT_REAPPLY_DAYS, parseDays } from "../components/ReapplyDaysField";
import { getStaffTickets, submitDecision } from "../../../api/staffTickets";
import { getPaymentTerms, sendQuotation } from "../../../api/staffQuotations";
import { formatCurrency, formatPaymentTerms, formatDateTime } from "../../../utils/currency";
import "../styles/staff-assessment-detail.css";

const ASSESSMENT_SUBMITTED = "ASSESSMENT_SUBMITTED";
const STAFF_REVIEW = "STAFF_REVIEW";
const REVIEWABLE_STATUSES = [ASSESSMENT_SUBMITTED, STAFF_REVIEW];

// Colour of the status badge in the header
const STATUS_TONE = {
  APPROVED: "green",
  COMPLETED: "gold",
  NC_CANNOT_PROCEED: "red",
  NC_CAN_REAPPLY: "red",
  ADMIN_REVIEW: "violet",
  ASSESSMENT_SUBMITTED: "indigo",
  STAFF_REVIEW: "blue",
};

const DECISION_OPTIONS = [
  {
    key: "FORWARD_TO_ADMIN",
    label: "Forward to Admin",
    description: "This assessment looks compatible - send it to Admin for final approval.",
    style: "primary",
    icon: CheckCircle2,
    confirmTitle: "Forward to Admin?",
    confirmLabel: "Yes, forward to Admin",
    effect: "This will send the ticket to Admin for final approval.",
  },
  {
    key: "NOT_COMPATIBLE_CANNOT",
    label: "Not Compatible — Cannot Proceed",
    description: "Not compatible, and this request cannot proceed further. The ticket will be closed.",
    style: "danger",
    icon: XCircle,
    confirmTitle: "Mark as Not Compatible?",
    confirmLabel: "Yes, close this ticket",
    askReason: true,
    effect: "This will mark the ticket as Not Compatible and close it.",
    warning: "The customer will get an email. They will not be able to reapply for this request.",
  },
  {
    key: "NOT_COMPATIBLE_CAN_REAPPLY",
    label: "Not Compatible — Can Reapply",
    description: "Not compatible right now, but the customer will be allowed to reapply later.",
    style: "warning",
    icon: RotateCcw,
    confirmTitle: "Mark as Not Compatible?",
    confirmLabel: "Yes, mark Not Compatible",
    effect: "This will mark the ticket as Not Compatible for now.",
    warning: "The customer will get an email telling them they can reapply until the date below.",
    askDays: true,
    askReason: true,
  },
];

const RESUBMIT_OPTION = {
  key: "FORWARD_TO_ADMIN",
  label: "Resubmit to Admin",
  style: "primary",
  icon: Send,
  confirmTitle: "Resubmit to Admin?",
  confirmLabel: "Yes, resubmit",
  effect: "This will send the ticket back to Admin for another review.",
};

function getInitials(name) {
  const parts = (name || "?").trim().split(/\s+/);
  const first = parts[0]?.[0] || "?";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : parts[0]?.[1] || "";
  return (first + last).toUpperCase();
}

function formatLongDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

// Closes a popup when Esc is pressed
function useEscape(onClose, enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined;
    function handleKey(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose, enabled]);
}

function ConfirmModal({ decision, ticketNumber, onCancel, onConfirm, busy }) {
  useEscape(onCancel, !busy);
  const [days, setDays] = useState(String(DEFAULT_REAPPLY_DAYS));
  const daysOk = !decision.askDays || parseDays(days) !== null;
  const [reason, setReason] = useState("");
  const reasonOk = !decision.askReason || reason.trim().length > 0;
  const Icon = decision.icon || Gavel;
  const isDanger = decision.style === "danger";

  return (
    <div
      className="stfad-modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div className="stfad-modal" role="dialog" aria-modal="true" aria-labelledby="stfad-confirm-title">
        <span className={`stfad-modal-icon ${decision.style || "primary"}`}>
          <Icon size={24} />
        </span>
        <h3 id="stfad-confirm-title">{decision.confirmTitle || "Confirm Decision"}</h3>
        <p>
          Ticket <strong>{ticketNumber}</strong>
          <br />
          Decision: <strong>{decision.label}</strong>
        </p>
        {decision.effect && <p>{decision.effect}</p>}
        {decision.warning && (
          <p
            role="alert"
            style={{
              margin: "4px 0 0",
              padding: "10px 12px",
              borderRadius: 8,
              fontSize: 13,
              lineHeight: 1.5,
              textAlign: "left",
              background: isDanger ? "#fef2f2" : "#fffbeb",
              border: `1px solid ${isDanger ? "#fecaca" : "#fde68a"}`,
              color: isDanger ? "#991b1b" : "#854d0e",
            }}
          >
            {decision.warning}
          </p>
        )}
        {decision.askReason && (
          <div style={{ textAlign: "left", margin: "10px 0 0" }}>
            <label
              htmlFor="nc-reason"
              style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}
            >
              Reason (required)
            </label>
            <textarea
              id="nc-reason"
              rows={3}
              maxLength={1000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={busy}
              placeholder="Why is the assessment not compatible? The customer will read this."
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "10px 12px",
                borderRadius: 8,
                fontSize: 14,
                fontFamily: "inherit",
                resize: "vertical",
                border: "1px solid #d1d5db",
              }}
            />
          </div>
        )}
        {decision.askDays && <ReapplyDaysField value={days} onChange={setDays} disabled={busy} />}
        <div className="stfad-modal-actions">
          <button type="button" className="stfad-btn-secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className={`stfad-btn-confirm ${decision.style || "primary"}`}
            onClick={() =>
              onConfirm(decision.askDays ? parseDays(days) : null, decision.askReason ? reason.trim() : null)
            }
            disabled={busy || !daysOk || !reasonOk}
          >
            {busy ? "Submitting..." : decision.confirmLabel || "Yes, confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PhotoLightbox({ src, onClose }) {
  useEscape(onClose);

  return (
    <div className="stfad-lightbox-overlay" onClick={onClose}>
      <button type="button" className="stfad-lightbox-close" onClick={onClose} aria-label="Close photo">
        <X size={20} />
      </button>
      <img src={src} alt="Proof of visit, enlarged" onClick={(e) => e.stopPropagation()} />
    </div>
  );
}

function Toast({ message, type = "success", onDone }) {
  useEffect(() => {
    const timer = setTimeout(onDone, 4000);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <div className={`stfad-toast ${type}`} role="status">
      {type === "success" ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
      <span>{message}</span>
      <button type="button" onClick={onDone} aria-label="Close">
        <X size={14} />
      </button>
    </div>
  );
}

function SpecTile({ icon: Icon, label, value, tone = "navy" }) {
  return (
    <div className="stfad-spec">
      <span className={`stfad-spec-icon tone-${tone}`}>
        <Icon size={17} />
      </span>
      <div className="stfad-spec-text">
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function InfoRow({ icon: Icon, label, children }) {
  return (
    <li>
      <span className="stfad-info-icon">
        <Icon size={15} />
      </span>
      <div>
        <span>{label}</span>
        <strong>{children}</strong>
      </div>
    </li>
  );
}

function PageMessage({ icon: Icon, title, hint, onBack, tone = "" }) {
  return (
    <div className="stfad-card stfad-message">
      <span className={`stfad-message-icon ${tone}`}>
        <Icon size={26} />
      </span>
      <p className="stfad-message-title">{title}</p>
      {hint && <p className="stfad-message-hint">{hint}</p>}
      <button type="button" className="stfad-btn-confirm primary" onClick={onBack}>
        <ArrowLeft size={15} />
        Back to Assessment Review
      </button>
    </div>
  );
}

export default function StaffAssessmentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [ticket, setTicket] = useState(null);
  const [paymentTerms, setPaymentTerms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [packageDetails, setPackageDetails] = useState("");
  const [estimatedCost, setEstimatedCost] = useState("");
  const [paymentTermsId, setPaymentTermsId] = useState("");
  const [sendingQuote, setSendingQuote] = useState(false);
  const [triedSend, setTriedSend] = useState(false);

  const [pendingDecision, setPendingDecision] = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submittingDecision, setSubmittingDecision] = useState(false);

  const [lightboxSrc, setLightboxSrc] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function load() {
    try {
      const [tickets, terms] = await Promise.all([getStaffTickets(), getPaymentTerms()]);
      const found = tickets.find((t) => String(t.id) === String(id));
      setTicket(found || null);
      setPaymentTerms(terms);
    } catch {
      setError("Could not load this ticket.");
    } finally {
      setLoading(false);
    }
  }

  const assessment = ticket?.assessment;
  const isReturnedForRevision = ticket?.status === STAFF_REVIEW && !!ticket?.admin_revision_notes;
  const canDecide = ticket && REVIEWABLE_STATUSES.includes(ticket.status);
  const statusTone = ticket ? STATUS_TONE[ticket.status] || "blue" : "blue";
  const displayName = ticket ? ticket.full_name || ticket.customer_username : "";

  const latestUpdatedQuotation = ticket
    ? [...(ticket.quotations || [])]
        .filter((q) => q.quotation_type === "UPDATED")
        .sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at))[0]
    : null;

  async function handleSendQuotation() {
    setTriedSend(true);
    if (!packageDetails || !estimatedCost) {
      setToast({ message: "Package Details and Estimated Cost are required.", type: "error" });
      return;
    }
    setSendingQuote(true);
    try {
      await sendQuotation(id, {
        quotation_type: "UPDATED",
        package_details: packageDetails,
        estimated_cost: estimatedCost,
        payment_terms_id: paymentTermsId || null,
      });
      await load();
      setPackageDetails("");
      setEstimatedCost("");
      setPaymentTermsId("");
      setTriedSend(false);
      setToast({ message: "Updated Quotation sent.", type: "success" });
    } catch {
      setToast({ message: "Could not send the quotation. Please try again.", type: "error" });
    } finally {
      setSendingQuote(false);
    }
  }

  function handleDecisionClick(decision) {
    setPendingDecision(decision);
    setShowConfirm(true);
  }

  async function performDecision(reapplyDays = null, reason = null) {
    if (submittingDecision || !pendingDecision) return;
    setSubmittingDecision(true);
    try {
      await submitDecision(id, pendingDecision.key, reapplyDays, reason);
      await load();
      setToast({ message: "Decision submitted successfully.", type: "success" });
    } catch (err) {
      const data = err?.response?.data;
      const msg = data?.non_field_errors?.[0] || data?.reason?.[0] || "Could not submit the decision. Please try again.";
      setToast({ message: msg, type: "error" });
    } finally {
      setSubmittingDecision(false);
      setShowConfirm(false);
      setPendingDecision(null);
    }
  }

  function goBack() {
    navigate("/staff/assessment-review");
  }

  return (
    <StaffLayout>
      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}
      {lightboxSrc && <PhotoLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}

      <div className="stfad-page">
        {loading && (
          <div className="stfad-stack">
            <div className="stfad-skel stfad-skel-hero" />
            <div className="stfad-grid">
              <div className="stfad-skel stfad-skel-main" />
              <div className="stfad-skel stfad-skel-side" />
            </div>
          </div>
        )}

        {!loading && error && (
          <PageMessage
            icon={AlertCircle}
            tone="red"
            title={error}
            hint="Please check your connection and try again."
            onBack={goBack}
          />
        )}

        {!loading && !error && !ticket && (
          <PageMessage
            icon={AlertCircle}
            tone="red"
            title="Ticket not found."
            hint="It may have been removed or you may not have access to it."
            onBack={goBack}
          />
        )}

        {!loading && !error && ticket && !assessment && (
          <PageMessage
            icon={ClipboardList}
            title="No assessment yet"
            hint="No assessment has been submitted for this ticket yet. It will show here once the Partner Installer sends it."
            onBack={goBack}
          />
        )}

        {!loading && !error && ticket && assessment && (
          <div className="stfad-stack">
            {/* ---------- Header ---------- */}
            <section className="stfad-hero">
              <div className="stfad-hero-glow" aria-hidden="true" />
              <button type="button" className="stfad-back" onClick={goBack} aria-label="Back to Assessment Review">
                <ArrowLeft size={18} />
              </button>
              <span className="stfad-hero-avatar">{getInitials(displayName)}</span>
              <div className="stfad-hero-text">
                <span className="stfad-hero-kicker">{ticket.ticket_number}</span>
                <h1>{displayName}</h1>
                <p>
                  <CalendarClock size={13} />
                  Assessment submitted {formatLongDate(assessment.submitted_at)}
                </p>
              </div>
              <div className="stfad-hero-actions">
                <span className={`stfad-hero-status tone-${statusTone}`}>{ticket.status_display}</span>
              </div>
            </section>

            {isReturnedForRevision && (
              <section className="stfad-revision">
                <span className="stfad-revision-icon">
                  <Undo2 size={20} />
                </span>
                <div>
                  <span className="stfad-revision-tag">Returned for Revision</span>
                  <h3>Admin Revision Notes</h3>
                  <p>{ticket.admin_revision_notes}</p>
                </div>
              </section>
            )}

            <div className="stfad-grid">
              {/* ---------- Main column ---------- */}
              <div className="stfad-main">
                <section className="stfad-card">
                  <div className="stfad-card-head">
                    <h2>
                      <Sun size={18} />
                      Roof Assessment
                    </h2>
                    <p>What the Partner Installer found during the site visit.</p>
                  </div>

                  <div className="stfad-spec-group">
                    <p className="stfad-spec-title">Roof</p>
                    <div className="stfad-specs">
                      <SpecTile icon={Ruler} label="Roof Area" value={`${assessment.estimated_roof_area_sqm} sq.m.`} />
                      <SpecTile icon={Home} label="Roof Type" value={assessment.roof_type_display} />
                      <SpecTile icon={ShieldCheck} label="Condition" value={assessment.roof_condition_display} tone="green" />
                    </div>
                  </div>

                  <div className="stfad-spec-group">
                    <p className="stfad-spec-title">Recommended System</p>
                    <div className="stfad-specs">
                      <SpecTile icon={Package} label="Package" value={assessment.recommended_package} tone="amber" />
                      <SpecTile icon={Zap} label="System Type" value={assessment.recommended_system_type_display} tone="amber" />
                      <SpecTile icon={Gauge} label="Capacity" value={`${assessment.rated_capacity_kw} kW`} tone="amber" />
                      <SpecTile icon={Grid3x3} label="Solar Panels" value={`${assessment.number_of_solar_panels} pcs`} tone="blue" />
                      <SpecTile icon={Cpu} label="Inverter" value={`${assessment.inverter_size_kw} kW`} tone="blue" />
                    </div>
                  </div>

                  {assessment.notes && (
                    <div className="stfad-notes">
                      <div className="stfad-notes-head">
                        <StickyNote size={14} />
                        Worker Notes
                      </div>
                      <p>{assessment.notes}</p>
                    </div>
                  )}
                </section>

                {assessment.photos?.length > 0 && (
                  <section className="stfad-card">
                    <div className="stfad-card-head">
                      <h2>
                        <Camera size={18} />
                        Proof of Visit Photos
                      </h2>
                      <p>
                        {assessment.photos.length} photo{assessment.photos.length === 1 ? "" : "s"} · click a photo to
                        see it bigger.
                      </p>
                    </div>
                    <div className="stfad-photos">
                      {assessment.photos.map((photo) => (
                        <button
                          key={photo.id}
                          type="button"
                          className="stfad-photo"
                          onClick={() => setLightboxSrc(photo.image)}
                        >
                          <img src={photo.image} alt="Proof of visit" />
                          <span className="stfad-photo-zoom">
                            <ZoomIn size={18} />
                          </span>
                        </button>
                      ))}
                    </div>
                  </section>
                )}

                {canDecide && (
                  <section className="stfad-card stfad-o-decision">
                    <div className="stfad-card-head">
                      <h2>
                        <Gavel size={18} />
                        Decision
                      </h2>
                      <p>
                        {isReturnedForRevision
                          ? "Fix the quotation first, then send this ticket back to Admin."
                          : "Pick what happens to this ticket next."}
                      </p>
                    </div>

                    {isReturnedForRevision ? (
                      <button
                        type="button"
                        className="stfad-decision primary"
                        onClick={() => handleDecisionClick(RESUBMIT_OPTION)}
                        disabled={submittingDecision}
                      >
                        <span className="stfad-decision-icon">
                          <Send size={20} />
                        </span>
                        <span className="stfad-decision-text">
                          <strong>Resubmit to Admin</strong>
                          <span>After adjusting the quotation, resubmit this ticket to Admin for another review.</span>
                        </span>
                        <span className="stfad-decision-cta">Select</span>
                      </button>
                    ) : (
                      <div className="stfad-decisions">
                        {DECISION_OPTIONS.map((opt) => {
                          const Icon = opt.icon;
                          return (
                            <button
                              key={opt.key}
                              type="button"
                              className={`stfad-decision ${opt.style}`}
                              onClick={() => handleDecisionClick(opt)}
                              disabled={submittingDecision}
                            >
                              <span className="stfad-decision-icon">
                                <Icon size={20} />
                              </span>
                              <span className="stfad-decision-text">
                                <strong>{opt.label}</strong>
                                <span>{opt.description}</span>
                              </span>
                              <span className="stfad-decision-cta">Select</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </section>
                )}
              </div>

              {/* ---------- Side column ---------- */}
              <aside className="stfad-side">
                <section className="stfad-card stfad-o-customer">
                  <h3 className="stfad-side-title">Customer</h3>
                  <ul className="stfad-info">
                    <InfoRow icon={User} label="Name">
                      {displayName}
                    </InfoRow>
                    <InfoRow icon={Phone} label="Contact">
                      {ticket.contact_number ? (
                        <a href={`tel:${ticket.contact_number}`}>{ticket.contact_number}</a>
                      ) : (
                        "—"
                      )}
                    </InfoRow>
                    <InfoRow icon={MapPin} label="Address">
                      {ticket.property_address || "—"}
                    </InfoRow>
                    <InfoRow icon={Package} label="Preferred Package">
                      {ticket.solar_package || "—"}
                    </InfoRow>
                    <InfoRow icon={Zap} label="Preferred System">
                      {ticket.system_type === "ON_GRID" ? "On-Grid" : "Hybrid"}
                    </InfoRow>
                    <InfoRow icon={HardHat} label="Partner Installer">
                      {ticket.partner_installer_username || "—"}
                    </InfoRow>
                  </ul>
                </section>

                <section className={`stfad-card stfad-quote stfad-o-quote ${ticket.final_sheet && !latestUpdatedQuotation ? "final" : ""}`}>
                  <div className="stfad-quote-head">
                    <span className="stfad-quote-icon">
                      <Receipt size={20} />
                    </span>
                    <div>
                      <h3>Updated Quotation</h3>
                      <p>{canDecide ? "Send the new price based on this assessment." : "The price for this ticket."}</p>
                    </div>
                  </div>

                  {latestUpdatedQuotation && (
                    <div className="stfad-current">
                      <span className="stfad-current-label">Latest sent</span>
                      <div className="stfad-current-row">
                        <span>
                          <Package size={14} />
                          Package
                        </span>
                        <strong>{latestUpdatedQuotation.package_details}</strong>
                      </div>
                      <div className="stfad-current-row">
                        <span>
                          <Wallet size={14} />
                          Cost
                        </span>
                        <strong className="stfad-money">{formatCurrency(latestUpdatedQuotation.estimated_cost)}</strong>
                      </div>
                    </div>
                  )}

                  {!latestUpdatedQuotation && ticket.final_sheet && (
                    <div className="stfad-final">
                      <span className="stfad-final-badge">
                        <Lock size={11} />
                        Finalized
                      </span>
                      <span className="stfad-final-label">Final Cost</span>
                      <p className="stfad-final-cost">{formatCurrency(ticket.final_sheet.final_cost)}</p>
                      <div className="stfad-final-meta">
                        <div>
                          <span>Payment Terms</span>
                          <p>
                            {ticket.final_sheet.payment_terms_summary
                              ? formatPaymentTerms(ticket.final_sheet.payment_terms_summary)
                              : "—"}
                          </p>
                        </div>
                        <div>
                          <span>Approved On</span>
                          <p>{formatDateTime(ticket.final_sheet.approved_at)}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {canDecide ? (
                    <div className="stfad-form">
                      {latestUpdatedQuotation && <p className="stfad-form-note">Send a new one to replace it:</p>}
                      <div className={`stfad-field ${triedSend && !packageDetails ? "invalid" : ""}`}>
                        <label htmlFor="stfad-package">
                          Package Details <em>*</em>
                        </label>
                        <div className="stfad-input">
                          <Package size={16} />
                          <input
                            id="stfad-package"
                            value={packageDetails}
                            onChange={(e) => setPackageDetails(e.target.value)}
                            placeholder="e.g. 6KW On-Grid Package"
                          />
                        </div>
                      </div>
                      <div className={`stfad-field ${triedSend && !estimatedCost ? "invalid" : ""}`}>
                        <label htmlFor="stfad-cost">
                          Estimated Cost <em>*</em>
                        </label>
                        <div className="stfad-input">
                          <Wallet size={16} />
                          <input
                            id="stfad-cost"
                            value={estimatedCost}
                            onChange={(e) => setEstimatedCost(e.target.value)}
                            placeholder="e.g. 250000"
                            inputMode="decimal"
                          />
                        </div>
                      </div>
                      <div className="stfad-field">
                        <label htmlFor="stfad-terms">Payment Terms</label>
                        <div className="stfad-input">
                          <CalendarClock size={16} />
                          <select
                            id="stfad-terms"
                            value={paymentTermsId}
                            onChange={(e) => setPaymentTermsId(e.target.value)}
                          >
                            <option value="">Select payment terms...</option>
                            {paymentTerms.map((pt) => (
                              <option key={pt.id} value={pt.id}>
                                {pt.description.slice(0, 60)}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="stfad-send"
                        onClick={handleSendQuotation}
                        disabled={sendingQuote}
                      >
                        <Send size={16} />
                        {sendingQuote ? "Sending..." : "Send Updated Quotation"}
                      </button>
                    </div>
                  ) : (
                    !ticket.final_sheet && (
                      <p className="stfad-done-note">
                        A decision has already been made for this ticket. Current status:{" "}
                        <strong>{ticket.status_display}</strong>.
                      </p>
                    )
                  )}
                </section>
              </aside>
            </div>
          </div>
        )}
      </div>

      {showConfirm && pendingDecision && (
        <ConfirmModal
          decision={pendingDecision}
          ticketNumber={ticket?.ticket_number}
          busy={submittingDecision}
          onCancel={() => {
            setShowConfirm(false);
            setPendingDecision(null);
          }}
          onConfirm={performDecision}
        />
      )}
    </StaffLayout>
  );
}