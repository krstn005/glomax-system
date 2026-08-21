import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, X } from "lucide-react";
import StaffLayout from "../components/StaffLayout";
import { getStaffTickets, submitDecision } from "../../../api/staffTickets";
import { getPaymentTerms, sendQuotation } from "../../../api/staffQuotations";
import { formatCurrency, formatPaymentTerms, formatDateTime } from "../../../utils/currency";
import "../styles/staff-assessment-detail.css";

const ASSESSMENT_SUBMITTED = "ASSESSMENT_SUBMITTED";
const STAFF_REVIEW = "STAFF_REVIEW";
const REVIEWABLE_STATUSES = [ASSESSMENT_SUBMITTED, STAFF_REVIEW];

const STATUS_TAG_CLASS = {
  APPROVED: "approved",
  COMPLETED: "approved",
  NC_CANNOT_PROCEED: "not-compatible",
  NC_CAN_REAPPLY: "not-compatible",
  ADMIN_REVIEW: "in-progress",
  ASSESSMENT_SUBMITTED: "in-progress",
  STAFF_REVIEW: "in-progress",
};

const DECISION_OPTIONS = [
  {
    key: "FORWARD_TO_ADMIN",
    label: "Forward to Admin",
    description: "This assessment looks compatible - send it to Admin for final approval.",
    style: "primary",
  },
  {
    key: "NOT_COMPATIBLE_CANNOT",
    label: "Not Compatible — Cannot Proceed",
    description: "Not compatible, and this request cannot proceed further. The ticket will be closed.",
    style: "danger",
  },
  {
    key: "NOT_COMPATIBLE_CAN_REAPPLY",
    label: "Not Compatible — Can Reapply",
    description: "Not compatible right now, but the customer will be allowed to reapply later.",
    style: "warning",
  },
];

function ConfirmModal({ decisionLabel, onCancel, onConfirm, busy }) {
  return (
    <div className="stfad-modal-overlay" onClick={onCancel}>
      <div className="stfad-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Confirm Decision</h3>
        <p>
          Set this ticket's decision to <strong>{decisionLabel}</strong>? This cannot be
          undone from this page.
        </p>
        <div className="stfad-modal-actions">
          <button className="stfad-btn-secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button className="stfad-btn-confirm" onClick={onConfirm} disabled={busy}>
            {busy ? "Submitting..." : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PhotoLightbox({ src, onClose }) {
  return (
    <div className="stfad-lightbox-overlay" onClick={onClose}>
      <button className="stfad-lightbox-close" onClick={onClose}>
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

  return <div className={`stfad-toast ${type}`}>{message}</div>;
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

  const [pendingDecision, setPendingDecision] = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submittingDecision, setSubmittingDecision] = useState(false);

  const [lightboxSrc, setLightboxSrc] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    load();
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
  const tagClass = ticket ? STATUS_TAG_CLASS[ticket.status] || "in-progress" : "in-progress";

  const latestUpdatedQuotation = ticket
    ? [...(ticket.quotations || [])]
        .filter((q) => q.quotation_type === "UPDATED")
        .sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at))[0]
    : null;

  async function handleSendQuotation() {
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

  async function performDecision() {
    setSubmittingDecision(true);
    try {
      await submitDecision(id, pendingDecision.key);
      await load();
      setToast({ message: "Decision submitted successfully.", type: "success" });
    } catch (err) {
      const msg = err?.response?.data?.non_field_errors?.[0] ||
        "Could not submit the decision. Please try again.";
      setToast({ message: msg, type: "error" });
    } finally {
      setSubmittingDecision(false);
      setShowConfirm(false);
      setPendingDecision(null);
    }
  }

  return (
    <StaffLayout>
      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}
      {lightboxSrc && (
        <PhotoLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
      )}

      <div className="stfad-wrapper">
        <div className="stfad-page">
          {loading && <p className="stfad-loading">Loading...</p>}
          {error && <p className="stfad-error">{error}</p>}
          {!loading && !error && !ticket && <p className="stfad-error">Ticket not found.</p>}
          {!loading && !error && ticket && !assessment && (
            <p className="stfad-error">No assessment has been submitted for this ticket yet.</p>
          )}

          {!loading && !error && ticket && assessment && (
            <div className="stfad-stack">
              <div className="stfad-title-row">
                <div className="stfad-title-left">
                  <button className="stfad-back" onClick={() => navigate("/staff/assessment-review")}>
                    <ArrowLeft size={18} />
                  </button>
                  <div>
                    <h1>{ticket.full_name || ticket.customer_username}</h1>
                    <p>{ticket.ticket_number} &middot; Submitted {new Date(assessment.submitted_at).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}</p>
                  </div>
                </div>
                <span className={`stfad-status-tag ${tagClass}`}>{ticket.status_display}</span>
              </div>

              <div className="stfad-card">
                <h2><span className="stfad-dot customer" />Customer Information</h2>
                <div className="stfad-grid stfad-grid-3">
                  <div className="stfad-field">
                    <label>Customer</label>
                    <p>{ticket.full_name || ticket.customer_username}</p>
                  </div>
                  <div className="stfad-field">
                    <label>Contact</label>
                    <p>{ticket.contact_number}</p>
                  </div>
                  <div className="stfad-field">
                    <label>Partner Installer</label>
                    <p>{ticket.partner_installer_username || "—"}</p>
                  </div>
                  <div className="stfad-field">
                    <label>Address</label>
                    <p>{ticket.property_address}</p>
                  </div>
                  <div className="stfad-field">
                    <label>Preferred Package</label>
                    <p>{ticket.solar_package}</p>
                  </div>
                  <div className="stfad-field">
                    <label>Preferred System Type</label>
                    <p>{ticket.system_type === "ON_GRID" ? "On-Grid" : "Hybrid"}</p>
                  </div>
                </div>
              </div>

              <div className="stfad-card">
                <h2><span className="stfad-dot roof" />Roof Assessment Data</h2>
                <div className="stfad-grid stfad-grid-4">
                  <div className="stfad-field">
                    <label>Roof Area</label>
                    <p>{assessment.estimated_roof_area_sqm} sq.m.</p>
                  </div>
                  <div className="stfad-field">
                    <label>Roof Type</label>
                    <p>{assessment.roof_type_display}</p>
                  </div>
                  <div className="stfad-field">
                    <label>Condition</label>
                    <p>{assessment.roof_condition_display}</p>
                  </div>
                  <div className="stfad-field">
                    <label>Rec. Package</label>
                    <p>{assessment.recommended_package}</p>
                  </div>
                  <div className="stfad-field">
                    <label>System Type</label>
                    <p>{assessment.recommended_system_type_display}</p>
                  </div>
                  <div className="stfad-field">
                    <label>Capacity</label>
                    <p>{assessment.rated_capacity_kw} kW</p>
                  </div>
                  <div className="stfad-field">
                    <label>Solar Panels</label>
                    <p>{assessment.number_of_solar_panels} pcs</p>
                  </div>
                  <div className="stfad-field">
                    <label>Inverter</label>
                    <p>{assessment.inverter_size_kw} kW</p>
                  </div>
                </div>

                {assessment.notes && (
                  <div className="stfad-notes-box">
                    <h3>Worker Notes</h3>
                    <p>{assessment.notes}</p>
                  </div>
                )}
              </div>

              {assessment.photos?.length > 0 && (
                <div className="stfad-card">
                  <h2><span className="stfad-dot photos" />Proof of Visit Photos</h2>
                  <div className="stfad-photo-grid">
                    {assessment.photos.map((photo) => (
                      <button
                        key={photo.id}
                        className="stfad-photo-thumb"
                        onClick={() => setLightboxSrc(photo.image)}
                      >
                        <img src={photo.image} alt="Proof of visit" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {isReturnedForRevision && (
                <div className="stfad-revision-box">
                  <span className="stfad-revision-tag">Returned for Revision</span>
                  <h3>Admin Revision Notes</h3>
                  <p>{ticket.admin_revision_notes}</p>
                </div>
              )}

              <div className="stfad-card">
                <h2><span className="stfad-dot quote" />Updated Quotation</h2>

                {latestUpdatedQuotation && (
                  <div className="stfad-grid stfad-grid-2 stfad-quote-summary">
                    <div className="stfad-field">
                      <label>Current Package</label>
                      <p>{latestUpdatedQuotation.package_details}</p>
                    </div>
                    <div className="stfad-field">
                      <label>Current Cost</label>
                      <p>{formatCurrency(latestUpdatedQuotation.estimated_cost)}</p>
                    </div>
                  </div>
                )}

                {!latestUpdatedQuotation && ticket.final_sheet && (
                  <div className="stfad-finalized-block">
                    <span className="stfad-finalized-badge">Finalized</span>
                    <div className="stfad-finalized-cost">
                      <label>Final Cost</label>
                      <p>{formatCurrency(ticket.final_sheet.final_cost)}</p>
                    </div>
                                        <div className="stfad-finalized-meta">
                      <div>
                        <label>Payment Terms</label>
                        <p>{ticket.final_sheet.payment_terms_summary ? formatPaymentTerms(ticket.final_sheet.payment_terms_summary) : "—"}</p>
                      </div>
                      <div>
                        <label>Approved On</label>
                        <p>{formatDateTime(ticket.final_sheet.approved_at)}</p>
                      </div>
                    </div>
                  </div>
                )}

                {canDecide ? (
                  <div className="stfad-quote-form">
                    <div className="stfad-form-field">
                      <label>Package Details</label>
                      <input
                        value={packageDetails}
                        onChange={(e) => setPackageDetails(e.target.value)}
                        placeholder="e.g. 6KW On-Grid Package"
                      />
                    </div>
                    <div className="stfad-form-field">
                      <label>Estimated Cost</label>
                      <input
                        value={estimatedCost}
                        onChange={(e) => setEstimatedCost(e.target.value)}
                        placeholder="e.g. 250000"
                      />
                    </div>
                    <div className="stfad-form-field">
                      <label>Payment Terms</label>
                      <select value={paymentTermsId} onChange={(e) => setPaymentTermsId(e.target.value)}>
                        <option value="">Select payment terms...</option>
                        {paymentTerms.map((pt) => (
                          <option key={pt.id} value={pt.id}>
                            {pt.description.slice(0, 60)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      className="stfad-send-quote-button"
                      onClick={handleSendQuotation}
                      disabled={sendingQuote}
                    >
                      {sendingQuote ? "Sending..." : "Send Updated Quotation"}
                    </button>
                  </div>
                                ) : (
                  !ticket.final_sheet && (
                    <p className="stfad-empty">
                      A decision has already been made for this ticket. Current status:{" "}
                      <strong>{ticket.status_display}</strong>.
                    </p>
                  )
                )}
              </div>

              {canDecide && (
                <div className="stfad-card stfad-decision-card">
                  <h2><span className="stfad-dot decision" />Decision</h2>

                  {isReturnedForRevision ? (
                    <div className="stfad-decision-row primary">
                      <div className="stfad-decision-text">
                        <strong>Resubmit to Admin</strong>
                        <span>After adjusting the quotation above, resubmit this ticket to Admin for another review.</span>
                      </div>
                      <button
                        onClick={() =>
                          handleDecisionClick({ key: "FORWARD_TO_ADMIN", label: "Resubmit to Admin" })
                        }
                        disabled={submittingDecision}
                      >
                        Resubmit to Admin
                      </button>
                    </div>
                  ) : (
                    <div className="stfad-decision-list">
                      {DECISION_OPTIONS.map((opt) => (
                        <div key={opt.key} className={`stfad-decision-row ${opt.style}`}>
                          <div className="stfad-decision-text">
                            <strong>{opt.label}</strong>
                            <span>{opt.description}</span>
                          </div>
                          <button
                            onClick={() => handleDecisionClick(opt)}
                            disabled={submittingDecision}
                          >
                            Select
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showConfirm && pendingDecision && (
        <ConfirmModal
          decisionLabel={pendingDecision.label}
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