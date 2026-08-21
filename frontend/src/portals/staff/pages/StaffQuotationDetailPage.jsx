import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import StaffLayout from "../components/StaffLayout";
import { getStaffTickets } from "../../../api/staffTickets";
import { getPaymentTerms, sendQuotation } from "../../../api/staffQuotations";
import { formatCurrency, formatPaymentTerms, formatDateTime } from "../../../utils/currency";
import apiClient from "../../../api/client";
import logo from "../../../assets/images/logo.jpg";
import "../styles/staff-quotation-detail.css";

const EDITABLE_STATUSES = ["ASSESSMENT_SUBMITTED", "STAFF_REVIEW"];

function ConfirmModal({ onCancel, onConfirm, busy }) {
  return (
    <div className="stfqd-modal-overlay" onClick={onCancel}>
      <div className="stfqd-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Send Updated Quotation?</h3>
        <p>This will update the price for this ticket and log it in the price change history. Are you sure you want to continue?</p>
        <div className="stfqd-modal-actions">
          <button className="stfqd-btn-secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button className="stfqd-btn-confirm" onClick={onConfirm} disabled={busy}>
            {busy ? "Sending..." : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Toast({ message, type = "success", onDone }) {
  useEffect(() => {
    const timer = setTimeout(onDone, 4000);
    return () => clearTimeout(timer);
  }, [onDone]);

  return <div className={`stfqd-toast ${type}`}>{message}</div>;
}

export default function StaffQuotationDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [ticket, setTicket] = useState(null);
  const [paymentTerms, setPaymentTerms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [packageDetails, setPackageDetails] = useState("");
  const [estimatedCost, setEstimatedCost] = useState("");
  const [paymentTermsId, setPaymentTermsId] = useState("");
  const [notes, setNotes] = useState("");

  const [showConfirm, setShowConfirm] = useState(false);
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    load();
  }, [id]);

  async function load() {
    try {
      const [ticketData, termsData] = await Promise.all([
        getStaffTickets(),
        getPaymentTerms(),
      ]);
      const found = ticketData.find((t) => String(t.id) === String(id));
      setTicket(found || null);
      setPaymentTerms(termsData);
    } catch {
      setError("Could not load this ticket.");
    } finally {
      setLoading(false);
    }
  }

  const quotationsChronological = ticket
    ? [...ticket.quotations].sort((a, b) => new Date(a.sent_at) - new Date(b.sent_at))
    : [];

  const initialQuotation = quotationsChronological.find((q) => q.quotation_type === "INITIAL");
  const updatedQuotations = quotationsChronological.filter((q) => q.quotation_type === "UPDATED");
  const latestUpdatedQuotation = updatedQuotations[updatedQuotations.length - 1];

  const priceChangeHistory = quotationsChronological
    .map((q, index) => {
      if (index === 0) return null;
      const previous = quotationsChronological[index - 1];
      return {
        id: q.id,
        previousCost: previous.estimated_cost,
        newCost: q.estimated_cost,
        changedAt: q.sent_at,
      };
    })
    .filter(Boolean);

  const canEditQuotation = ticket && EDITABLE_STATUSES.includes(ticket.status);

  // Splits the Final Sheet's payment terms into individual segments so
  // each renders on its own line, mirroring the PDF export's layout
  // (one line per term, instead of a single comma-joined sentence).
  const finalSheetTermsLines = ticket?.final_sheet?.payment_terms_summary
    ? ticket.final_sheet.payment_terms_summary.split(",").map((p) => p.trim()).filter(Boolean)
    : [];

  function resetForm() {
    setPackageDetails("");
    setEstimatedCost("");
    setPaymentTermsId("");
    setNotes("");
  }

  function handleSendClick() {
    if (!packageDetails || !estimatedCost) {
      setToast({ message: "Package Details and Estimated Cost are required.", type: "error" });
      return;
    }
    setShowConfirm(true);
  }

  async function performSend() {
    setSending(true);
    try {
      await sendQuotation(id, {
        quotation_type: "UPDATED",
        package_details: packageDetails,
        estimated_cost: estimatedCost,
        payment_terms_id: paymentTermsId || null,
        notes,
      });
      await load();
      resetForm();
      setToast({ message: "Updated Quotation sent successfully.", type: "success" });
    } catch (err) {
      const msg = err?.response?.data?.non_field_errors?.[0] ||
        "Could not send the quotation. Please try again.";
      setToast({ message: msg, type: "error" });
    } finally {
      setSending(false);
      setShowConfirm(false);
    }
  }

  // Uses client.js's shared axios instance rather than a raw fetch()
  // so this request benefits from the same request/response
  // interceptors as every other page - the Authorization header is
  // attached automatically, and if the access token has expired, the
  // interceptor transparently refreshes it and retries before this
  // ever surfaces as a 401.
  async function handleExportPdf() {
    try {
      const response = await apiClient.get(`/tickets/${id}/final-sheet/pdf/`, {
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${ticket.ticket_number}-final-sheet.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      setToast({ message: "Could not export the PDF. Please try again.", type: "error" });
    }
  }

  return (
    <StaffLayout>
      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}

      {loading && <p className="stfqd-loading">Loading...</p>}
      {error && <p className="stfqd-error">{error}</p>}
      {!loading && !error && !ticket && <p className="stfqd-error">Ticket not found.</p>}

      {!loading && !error && ticket && (
        <div className="stfqd-page">
          <div className="stfqd-detail">
            <div className="stfqd-title-row">
              <div className="stfqd-title-left">
                <button className="stfqd-back" onClick={() => navigate("/staff/quotations")}>
                  <ArrowLeft size={18} />
                </button>
                <div>
                  <h1>{ticket.ticket_number} — {ticket.customer_username}</h1>
                  <p>{ticket.status_display}</p>
                </div>
              </div>
              <button
                className="stfqd-ticket-link"
                onClick={() => navigate(`/staff/manage-tickets/${ticket.id}`)}
              >
                View Ticket Tracking
              </button>
            </div>

            {/* Stage 1: Initial Quotation - read only */}
            <div className="stfqd-card">
              <h2><span className="stfqd-dot initial" />Initial Quotation</h2>
              {!initialQuotation ? (
                <p className="stfqd-empty">No Initial Quotation linked to this ticket yet.</p>
              ) : (
                <div className="stfqd-readonly-grid">
                  <div>
                    <label>Package Details</label>
                    <p>{initialQuotation.package_details}</p>
                  </div>
                  <div>
                    <label>Estimated Cost</label>
                    <p>{formatCurrency(initialQuotation.estimated_cost)}</p>
                  </div>
                  <div>
                    <label>Payment Terms</label>
                    <p>{initialQuotation.payment_terms_description || "—"}</p>
                  </div>
                  <div>
                    <label>Sent</label>
                    <p>{new Date(initialQuotation.sent_at).toLocaleString()}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Stage 2: Updated Quotation - editable only in the two allowed moments */}
            <div className="stfqd-card">
              <h2><span className="stfqd-dot updated" />Updated Quotation</h2>

              {latestUpdatedQuotation && (
                <div className="stfqd-readonly-grid stfqd-latest-updated">
                  <div>
                    <label>Current Package Details</label>
                    <p>{latestUpdatedQuotation.package_details}</p>
                  </div>
                  <div>
                    <label>Current Estimated Cost</label>
                    <p>{formatCurrency(latestUpdatedQuotation.estimated_cost)}</p>
                  </div>
                  <div>
                    <label>Payment Terms</label>
                    <p>{latestUpdatedQuotation.payment_terms_description || "—"}</p>
                  </div>
                  <div>
                    <label>Last Updated</label>
                    <p>{new Date(latestUpdatedQuotation.sent_at).toLocaleString()}</p>
                  </div>
                </div>
              )}

              {!latestUpdatedQuotation && ticket.final_sheet && (
                <div className="stfqd-finalized-block">
                  <span className="stfqd-finalized-badge">Finalized</span>
                  <div className="stfqd-finalized-cost">
                    <label>Final Cost</label>
                    <p>{formatCurrency(ticket.final_sheet.final_cost)}</p>
                  </div>
                  <div className="stfqd-finalized-meta">
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

              {!ticket.final_sheet && canEditQuotation ? (
                <div className="stfqd-form">
                  <div className="stfqd-field">
                    <label>Package Details</label>
                    <input
                      value={packageDetails}
                      onChange={(e) => setPackageDetails(e.target.value)}
                      placeholder="e.g. 6KW On-Grid Package"
                    />
                  </div>

                  <div className="stfqd-field">
                    <label>Estimated Cost</label>
                    <input
                      value={estimatedCost}
                      onChange={(e) => setEstimatedCost(e.target.value)}
                      placeholder="e.g. 250000"
                    />
                  </div>

                  <div className="stfqd-field">
                    <label>Payment Terms</label>
                    <select
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

                  <div className="stfqd-field stfqd-field-wide">
                    <label>Notes (optional)</label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Any extra details..."
                    />
                  </div>

                  <button className="stfqd-send-button" onClick={handleSendClick} disabled={sending}>
                    Send Updated Quotation
                  </button>
                </div>
              ) : (
                !ticket.final_sheet && (
                  <p className="stfqd-locked-note">
                    The Updated Quotation can only be edited after the Partner Installer's
                    assessment has been submitted, or after Admin returns this ticket for
                    revision. This ticket's current status is{" "}
                    <strong>{ticket.status_display}</strong>.
                  </p>
                )
              )}
            </div>

            {/* Price Change History - read only audit trail */}
            <div className="stfqd-card">
              <h2><span className="stfqd-dot history" />Price Change History</h2>
              {priceChangeHistory.length === 0 ? (
                <p className="stfqd-empty">No price changes have been made yet.</p>
              ) : (
                <div className="stfqd-history">
                  {priceChangeHistory.map((entry) => (
                    <div key={entry.id} className="stfqd-history-row">
                      <span className="stfqd-history-prev">{formatCurrency(entry.previousCost)}</span>
                      <span className="stfqd-history-arrow">→</span>
                      <span className="stfqd-history-new">{formatCurrency(entry.newCost)}</span>
                      <span className="stfqd-history-date">
                        {new Date(entry.changedAt).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Stage 3: Final Sheet - only after Admin approval. Matches the
                PDF export's visual language: plain bold green "Approved"
                text (no pill), navy divider beside the logo, a bordered
                Final Cost box with an internal gold divider, and payment
                terms stacked one segment per line. */}
            {ticket.final_sheet && (
              <div className="stfqd-card stfqd-final-card">
                <div className="stfqd-final-header">
                  <div className="stfqd-final-header-left">
                    <img src={logo} alt="Glomax Solar Enterprises" className="stfqd-final-logo" />
                    <div className="stfqd-final-divider-line" />
                    <div>
                      <p className="stfqd-final-eyebrow">
                        Final Sheet <span className="stfqd-final-eyebrow-date">- {new Date(ticket.final_sheet.approved_at).toLocaleDateString(undefined, { month: "numeric", day: "numeric", year: "numeric" })}</span>
                      </p>
                      <h2 className="stfqd-final-title">
                        {ticket.ticket_number} — {ticket.customer_username}
                      </h2>
                    </div>
                  </div>
                  <span className="stfqd-final-status">Approved</span>
                </div>
                <hr className="stfqd-final-divider" />

                <div className="stfqd-final-cost-box">
                  <div className="stfqd-final-cost-label-cell">
                    <label>FINAL COST:</label>
                  </div>
                  <div className="stfqd-final-cost-value-cell">
                    <p>{formatCurrency(ticket.final_sheet.final_cost)}</p>
                  </div>
                </div>

                <div className="stfqd-final-two-col">
                  <div className="stfqd-final-section">
                    <h3>Customer &amp; Ticket Info</h3>
                    <dl className="stfqd-doc-list">
                      <div className="stfqd-doc-row">
                        <dt>Customer</dt>
                        <dd>{ticket.customer_username}</dd>
                      </div>
                      <div className="stfqd-doc-row">
                        <dt>Property Address</dt>
                        <dd>{ticket.property_address}</dd>
                      </div>
                      <div className="stfqd-doc-row">
                        <dt>Partner Installer</dt>
                        <dd>{ticket.partner_installer_username || "—"}</dd>
                      </div>
                      <div className="stfqd-doc-row">
                        <dt>Contact Number</dt>
                        <dd>{ticket.contact_number}</dd>
                      </div>
                    </dl>
                  </div>

                  {ticket.assessment && (
                    <div className="stfqd-final-section">
                      <h3>Roof Assessment</h3>
                      <dl className="stfqd-doc-list">
                        <div className="stfqd-doc-row">
                          <dt>Estimated Roof Area</dt>
                          <dd>{ticket.assessment.estimated_roof_area_sqm} sqm</dd>
                        </div>
                        <div className="stfqd-doc-row">
                          <dt>Roof Type</dt>
                          <dd>{ticket.assessment.roof_type_display}</dd>
                        </div>
                        <div className="stfqd-doc-row">
                          <dt>Roof Condition</dt>
                          <dd>{ticket.assessment.roof_condition_display}</dd>
                        </div>
                        <div className="stfqd-doc-row">
                          <dt>Recommended Package</dt>
                          <dd>{ticket.assessment.recommended_package}</dd>
                        </div>
                        <div className="stfqd-doc-row">
                          <dt>Recommended System Type</dt>
                          <dd>{ticket.assessment.recommended_system_type_display}</dd>
                        </div>
                        <div className="stfqd-doc-row">
                          <dt>Rated Capacity</dt>
                          <dd>{ticket.assessment.rated_capacity_kw} kW</dd>
                        </div>
                        <div className="stfqd-doc-row">
                          <dt>Number of Solar Panels</dt>
                          <dd>{ticket.assessment.number_of_solar_panels}</dd>
                        </div>
                        <div className="stfqd-doc-row">
                          <dt>Inverter Size</dt>
                          <dd>{ticket.assessment.inverter_size_kw} kW</dd>
                        </div>
                      </dl>
                    </div>
                  )}
                </div>

                <div className="stfqd-final-section">
                  <h3>Proof of Visit Photos</h3>
                  {ticket.assessment?.photos?.length > 0 ? (
                    <div className="stfqd-photo-grid">
                      {ticket.assessment.photos.map((photo) => (
                        <img key={photo.id} src={photo.image} alt="Proof of visit" />
                      ))}
                    </div>
                  ) : (
                    <p className="stfqd-empty">No photos uploaded.</p>
                  )}
                </div>

                <div className="stfqd-final-section">
                  <h3>Quotation Summary</h3>
                  {!initialQuotation && !latestUpdatedQuotation ? (
                    <p className="stfqd-empty">
                      No quotation history is on record for this ticket. Only the Final
                      Cost is available below.
                    </p>
                  ) : (
                    <div className="stfqd-quote-flow">
                      <div className="stfqd-quote-step">
                        <span className="stfqd-quote-label">Initial Quotation</span>
                        <span className="stfqd-quote-value">
                          {initialQuotation ? formatCurrency(initialQuotation.estimated_cost) : "Not Recorded"}
                        </span>
                      </div>
                      <div className="stfqd-quote-step">
                        <span className="stfqd-quote-label">Updated Quotation</span>
                        <span className="stfqd-quote-value">
                          {latestUpdatedQuotation ? formatCurrency(latestUpdatedQuotation.estimated_cost) : "Not Recorded"}
                        </span>
                      </div>
                      <div className="stfqd-quote-step">
                        <span className="stfqd-quote-label">Final Cost</span>
                        <span className="stfqd-quote-value stfqd-quote-value-final">
                          {formatCurrency(ticket.final_sheet.final_cost)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="stfqd-final-section">
                  <h3>Payment &amp; Approval</h3>
                  <div className="stfqd-approval-row">
                    <div className="stfqd-approval-item">
                      <label>Payment Terms</label>
                      <div className="stfqd-approval-terms">
                        {finalSheetTermsLines.map((line, i) => (
                          <span key={i} className="stfqd-terms-line">{line}</span>
                        ))}
                      </div>
                    </div>
                    <div className="stfqd-approval-item">
                      <label>Approved By</label>
                      <p>{ticket.final_sheet.approved_by_username || "—"}</p>
                    </div>
                    <div className="stfqd-approval-item">
                      <label>Approved On</label>
                      <p>{formatDateTime(ticket.final_sheet.approved_at)}</p>
                    </div>
                  </div>
                </div>

                <div className="stfqd-final-footer">
                  Glomax Solar Enterprises · Generated {new Date().toLocaleDateString()}
                </div>

                <button className="stfqd-export-button" onClick={handleExportPdf}>
                  Export Final Sheet as PDF
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {showConfirm && (
        <ConfirmModal busy={sending} onCancel={() => setShowConfirm(false)} onConfirm={performSend} />
      )}
    </StaffLayout>
  );
}