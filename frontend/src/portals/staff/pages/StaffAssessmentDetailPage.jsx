import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Home, FileText, X } from "lucide-react";
import StaffLayout from "../components/StaffLayout";
import { getStaffTickets, submitDecision } from "../../../api/staffTickets";
import { getPaymentTerms, sendQuotation } from "../../../api/staffQuotations";
import { formatCurrency } from "../../../utils/currency";
import "../styles/staff-assessment-detail.css";

const ASSESSMENT_SUBMITTED = "ASSESSMENT_SUBMITTED";
const STAFF_REVIEW = "STAFF_REVIEW";
const REVIEWABLE_STATUSES = [ASSESSMENT_SUBMITTED, STAFF_REVIEW];

const DECISION_OPTIONS = [
  {
    key: "FORWARD_TO_ADMIN",
    label: "Forward to Admin",
    description: "This assessment looks compatible - send it to Admin for final approval.",
    style: "primary",
  },
  {
    key: "NOT_COMPATIBLE_CAN_REAPPLY",
    label: "Not Compatible — Can Reapply",
    description: "The customer will be allowed to reapply later.",
    style: "warning",
  },
  {
    key: "NOT_COMPATIBLE_CANNOT",
    label: "Not Compatible — Cannot Proceed",
    description: "This request cannot proceed further. The ticket will be closed.",
    style: "danger",
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

function FieldRow({ left, right }) {
  return (
    <div className="stfad-row">
      <div className="stfad-row-cell">
        <label>{left.label}</label>
        <p>{left.value}</p>
      </div>
      <div className="stfad-row-cell">
        <label>{right.label}</label>
        <p>{right.value}</p>
      </div>
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
          <button className="stfad-back" onClick={() => navigate("/staff/assessment-review")}>
            <ArrowLeft size={16} />
            Back to Assessment Review
          </button>

          {loading && <p className="stfad-loading">Loading...</p>}
          {error && <p className="stfad-error">{error}</p>}
          {!loading && !error && !ticket && <p className="stfad-error">Ticket not found.</p>}
          {!loading && !error && ticket && !assessment && (
            <p className="stfad-error">No assessment has been submitted for this ticket yet.</p>
          )}

          {!loading && !error && ticket && assessment && (
            <div className="stfad-columns">
              {/* LEFT COLUMN */}
              <div className="stfad-left">
                <div className="stfad-card stfad-customer-card">
                  <div className="stfad-customer-header">
                    <span className="stfad-avatar">
                      {(ticket.full_name || ticket.customer_username).slice(0, 2).toUpperCase()}
                    </span>
                    <div>
                      <h1>{ticket.full_name || ticket.customer_username}</h1>
                      <p>{ticket.ticket_number}</p>
                    </div>
                  </div>

                  <FieldRow
                    left={{ label: "Property Address", value: ticket.property_address }}
                    right={{ label: "Contact Number", value: ticket.contact_number }}
                  />
                  <FieldRow
                    left={{ label: "Date Submitted", value: new Date(ticket.created_at).toLocaleDateString() }}
                    right={{ label: "Partner Installer", value: ticket.partner_installer_username || "—" }}
                  />
                  <FieldRow
                    left={{ label: "Assessment Submitted", value: new Date(assessment.submitted_at).toLocaleDateString() }}
                    right={{ label: "Preferred Package", value: ticket.solar_package }}
                  />
                </div>

                <div className="stfad-card">
                  <div className="stfad-card-title">
                    <span className="stfad-title-icon">
                      <Home size={15} />
                    </span>
                    <h2>Roof Assessment Data</h2>
                    <span className="stfad-title-sub">from Partner Installer</span>
                  </div>

                  <FieldRow
                    left={{ label: "Estimated Roof Area", value: `${assessment.estimated_roof_area_sqm} sqm` }}
                    right={{ label: "Roof Type", value: assessment.roof_type_display }}
                  />
                  <FieldRow
                    left={{ label: "Roof Condition", value: assessment.roof_condition_display }}
                    right={{ label: "Recommended Package", value: assessment.recommended_package }}
                  />
                  <FieldRow
                    left={{ label: "Recommended System Type", value: assessment.recommended_system_type_display }}
                    right={{ label: "Rated Capacity", value: `${assessment.rated_capacity_kw} kW` }}
                  />
                  <FieldRow
                    left={{ label: "Number of Solar Panels", value: assessment.number_of_solar_panels }}
                    right={{ label: "Inverter Size", value: `${assessment.inverter_size_kw} kW` }}
                  />

                  <div className="stfad-notes-box">
                    <div className="stfad-notes-icon">
                      <FileText size={14} />
                    </div>
                    <div>
                      <h3>Partner Installer Notes</h3>
                      <p>{assessment.notes || "No notes provided."}</p>
                    </div>
                  </div>

                  <div className="stfad-photos-section">
                    <label>Proof of Visit Photos</label>
                    {assessment.photos?.length > 0 ? (
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
                    ) : (
                      <p className="stfad-empty">No photos uploaded.</p>
                    )}
                  </div>
                </div>
              </div>

              {/* RIGHT COLUMN */}
              <div className="stfad-right">
                {isReturnedForRevision && (
                  <div className="stfad-revision-box">
                    <span className="stfad-revision-tag">Returned for Revision</span>
                    <h3>Admin Revision Notes</h3>
                    <p>{ticket.admin_revision_notes}</p>
                  </div>
                )}

                <div className="stfad-card">
                  <h2>Updated Quotation</h2>

                  {latestUpdatedQuotation && (
                    <div className="stfad-quote-summary">
                      <div>
                        <label>Current Package</label>
                        <p>{latestUpdatedQuotation.package_details}</p>
                      </div>
                      <div>
                        <label>Current Cost</label>
                        <p>{formatCurrency(latestUpdatedQuotation.estimated_cost)}</p>
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
                    <p className="stfad-empty">
                      A decision has already been made for this ticket. Current status:{" "}
                      <strong>{ticket.status_display}</strong>.
                    </p>
                  )}
                </div>

                {canDecide && (
                  <div className="stfad-decision-panel">
                    <h2>Decision</h2>
                    <p>
                      Review the roof assessment above, then choose how this ticket should
                      proceed.
                    </p>

                    {isReturnedForRevision ? (
                      <button
                        className="stfad-decision-btn primary"
                        onClick={() =>
                          handleDecisionClick({ key: "FORWARD_TO_ADMIN", label: "Resubmit to Admin" })
                        }
                        disabled={submittingDecision}
                      >
                        Resubmit to Admin
                      </button>
                    ) : (
                      <div className="stfad-decision-buttons">
                        {DECISION_OPTIONS.map((opt) => (
                          <div key={opt.key} className={`stfad-decision-option ${opt.style}`}>
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