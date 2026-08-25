import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Send } from "lucide-react";
import StaffLayout from "../components/StaffLayout";
import {
  getInquiryDetail,
  sendQuotationEmail,
  getInquiryMessages,
  sendInquiryReply,
} from "../../../api/inquiries";
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

  // Conversation thread state
  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(true);
  const [replyText, setReplyText] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const threadEndRef = useRef(null);

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

  useEffect(() => {
    let cancelled = false;

    async function loadMessages(isInitial) {
      try {
        const data = await getInquiryMessages(id);
        if (cancelled) return;
        setMessages(data);
      } catch {
        // Silently fail - the thread is a secondary feature, don't
        // block the whole page if it can't load.
      } finally {
        if (isInitial) setMessagesLoading(false);
      }
    }

    loadMessages(true);
    const interval = setInterval(() => loadMessages(false), 15000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [id]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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

  async function handleSendReply() {
    if (!replyText.trim()) return;
    setSendingReply(true);
    try {
      const newMessage = await sendInquiryReply(id, replyText.trim());
      setMessages((prev) => [...prev, newMessage]);
      setReplyText("");
    } catch {
      setToast({ message: "Could not send the reply. Please try again.", type: "error" });
    } finally {
      setSendingReply(false);
    }
  }

  function handleReplyKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendReply();
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

            {/* Conversation now includes the original inquiry message
                as the first bubble in the thread, instead of being
                a separate card above it - the original message IS
                the start of the conversation, so treating it as a
                distinct section was redundant. Matches how the
                public reply page (InquiryReplyPage.jsx) already
                displays it. Staff should use this thread to ask
                clarifying questions and settle on the right package
                BEFORE sending the Initial Quotation - the quotation
                composer is below, as the final step once ready. */}
            <div className="stfquote-card">
              <h2><span className="stfquote-dot conversation" />Conversation</h2>

              <div className="stfquote-thread">
                <div className="stfquote-thread-msg customer">
                  <div className="stfquote-thread-msg-meta">
                    <span className="stfquote-thread-msg-sender">{inquiry.full_name}</span>
                    <span className="stfquote-thread-msg-time">
                      {new Date(inquiry.received_at).toLocaleString()}
                    </span>
                  </div>
                  <p className="stfquote-thread-msg-content">{inquiry.message}</p>
                </div>

                {messagesLoading ? (
                  <p className="stfquote-thread-loading">Loading conversation...</p>
                ) : (
                  messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`stfquote-thread-msg ${msg.sender_type === "STAFF" ? "staff" : "customer"}`}
                    >
                      <div className="stfquote-thread-msg-meta">
                        <span className="stfquote-thread-msg-sender">
                          {msg.sender_type === "STAFF"
                            ? msg.staff_username || "Staff"
                            : inquiry.full_name}
                        </span>
                        <span className="stfquote-thread-msg-time">
                          {new Date(msg.sent_at).toLocaleString()}
                        </span>
                      </div>
                      <p className="stfquote-thread-msg-content">{msg.content}</p>
                    </div>
                  ))
                )}
                <div ref={threadEndRef} />
              </div>

              <div className="stfquote-thread-reply">
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={handleReplyKeyDown}
                  placeholder="Type a message... (Enter to send, Shift+Enter for a new line)"
                  disabled={sendingReply}
                />
                <button
                  className="stfquote-thread-send-button"
                  onClick={handleSendReply}
                  disabled={sendingReply || !replyText.trim()}
                >
                  <Send size={16} />
                  {sendingReply ? "Sending..." : "Send"}
                </button>
              </div>
            </div>

            {/* Initial Quotation - the final step, sent only once Staff
                and the customer have finished discussing and settled
                on the right package. */}
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
                <h2><span className="stfquote-dot compose" />Send Initial Quotation</h2>
                <p className="stfquote-compose-hint">
                  Once you and the customer have discussed their needs above and
                  confirmed the right package, send the Initial Quotation here.
                </p>

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
                    <label>Additional Note for This Quotation</label>
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