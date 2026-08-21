import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import StaffLayout from "../components/StaffLayout";
import { getInquiryDetail, sendQuotationEmail } from "../../../api/inquiries";
import "../styles/staff-inquiry-quotation.css";

function ConfirmModal({ onCancel, onConfirm, busy }) {
  return (
    <div className="stfquote-modal-overlay" onClick={onCancel}>
      <div className="stfquote-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Send Initial Quotation?</h3>
        <p>This will email the quotation details to the customer. Are you sure you want to continue?</p>
        <div className="stfquote-modal-actions">
          <button className="stfquote-btn-secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button className="stfquote-btn-confirm" onClick={onConfirm} disabled={busy}>
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

  return <div className={`stfquote-toast ${type}`}>{message}</div>;
}

export default function StaffInquiryQuotationPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [inquiry, setInquiry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [packageDetails, setPackageDetails] = useState("");
  const [estimatedCost, setEstimatedCost] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [messageToCustomer, setMessageToCustomer] = useState("");

  const [showConfirm, setShowConfirm] = useState(false);
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const data = await getInquiryDetail(id);
        setInquiry(data);
      } catch {
        setLoadError("Could not load this inquiry.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  function handleSendClick() {
    if (!packageDetails || !estimatedCost || !paymentTerms) {
      setToast({
        message: "Package Details, Estimated Cost, and Payment Terms are required.",
        type: "error",
      });
      return;
    }
    setShowConfirm(true);
  }

  async function performSend() {
    setSending(true);
    try {
      const updated = await sendQuotationEmail(id, {
        package_details: packageDetails,
        estimated_cost: estimatedCost,
        payment_terms: paymentTerms,
        notes: messageToCustomer,
      });
      setInquiry(updated);
      setToast({ message: "Quotation email sent successfully.", type: "success" });
    } catch (err) {
      const msg =
        err?.response?.data?.detail ||
        "Could not send the quotation email. Please try again.";
      setToast({ message: msg, type: "error" });
    } finally {
      setSending(false);
      setShowConfirm(false);
    }
  }

  const alreadySent = inquiry?.quotation_sent;

  return (
    <StaffLayout>
      <div className="stfquote-page">
        {toast && (
          <Toast
            message={toast.message}
            type={toast.type}
            onDone={() => setToast(null)}
          />
        )}

        {loading && <p className="stfquote-loading">Loading...</p>}
        {loadError && <p className="stfquote-error">{loadError}</p>}

        {!loading && !loadError && inquiry && (
          <div className="stfquote-stack">
            <div className="stfquote-title-row">
              <div className="stfquote-title-left">
                <button className="stfquote-back" onClick={() => navigate("/staff/email-inquiries")}>
                  <ArrowLeft size={18} />
                </button>
                <div>
                  <h1>{inquiry.full_name}</h1>
                  <p>{inquiry.email} &middot; {inquiry.subject_display}</p>
                </div>
              </div>
              <span className="stfquote-inquiry-number">Inquiry #{inquiry.id}</span>
            </div>

            <div className="stfquote-card">
              <h2><span className="stfquote-dot message" />Customer's Message</h2>
              <p className="stfquote-original-message">{inquiry.message}</p>
            </div>

            {alreadySent ? (
              <div className="stfquote-card">
                <h2><span className="stfquote-dot sent" />Initial Quotation Sent</h2>
                <p className="stfquote-sent-note">
                  Sent on {new Date(inquiry.quotation_sent_at).toLocaleString()}
                </p>

                <div className="stfquote-form">
                  <div className="stfquote-field">
                    <label>Package Details</label>
                    <p className="stfquote-readonly-value">{inquiry.quotation_package_details}</p>
                  </div>

                  <div className="stfquote-field">
                    <label>Estimated Cost</label>
                    <p className="stfquote-readonly-value">{inquiry.quotation_estimated_cost}</p>
                  </div>

                  <div className="stfquote-field stfquote-field-wide">
                    <label>Payment Terms</label>
                    <p className="stfquote-readonly-value">{inquiry.quotation_payment_terms}</p>
                  </div>

                  <div className="stfquote-field stfquote-field-wide">
                    <label>Message to Customer</label>
                    <p className="stfquote-readonly-value">
                      {inquiry.quotation_message_to_customer || "—"}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="stfquote-card">
                <h2><span className="stfquote-dot compose" />Compose Initial Quotation</h2>

                <div className="stfquote-form">
                  <div className="stfquote-field">
                    <label>Package Details</label>
                    <input
                      value={packageDetails}
                      onChange={(e) => setPackageDetails(e.target.value)}
                      placeholder="e.g. 6KW On-Grid Package"
                    />
                  </div>

                  <div className="stfquote-field">
                    <label>Estimated Cost</label>
                    <input
                      value={estimatedCost}
                      onChange={(e) => setEstimatedCost(e.target.value)}
                      placeholder="e.g. ₱250,000"
                    />
                  </div>

                  <div className="stfquote-field">
                    <label>Payment Terms</label>
                    <input
                      value={paymentTerms}
                      onChange={(e) => setPaymentTerms(e.target.value)}
                      placeholder="e.g. 50% downpayment, balance on completion"
                    />
                  </div>

                  <div className="stfquote-field stfquote-field-wide">
                    <label>Message to Customer (optional)</label>
                    <textarea
                      value={messageToCustomer}
                      onChange={(e) => setMessageToCustomer(e.target.value)}
                      placeholder="Any extra info for the customer..."
                    />
                  </div>

                  <button
                    className="stfquote-send-button"
                    disabled={sending}
                    onClick={handleSendClick}
                  >
                    Send Initial Quotation
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {showConfirm && (
          <ConfirmModal
            busy={sending}
            onCancel={() => setShowConfirm(false)}
            onConfirm={performSend}
          />
        )}
      </div>
    </StaffLayout>
  );
}