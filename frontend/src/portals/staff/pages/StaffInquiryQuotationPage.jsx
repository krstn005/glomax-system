import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Send,
  MessageSquare,
  Mail,
  Clock,
  CheckCircle2,
  AlertCircle,
  Package,
  Wallet,
  CalendarClock,
  FileText,
  Inbox,
  MessagesSquare,
  X,
  Tag,
} from "lucide-react";
import StaffLayout from "../components/StaffLayout";
import {
  getInquiryDetail,
  sendQuotationEmail,
  getInquiryMessages,
  sendInquiryReply,
} from "../../../api/inquiries";
import "../styles/staff-inquiry-quotation.css";

function formatTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function formatDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// "Today", "Yesterday", or a full date - used for the day dividers in the chat
function dayLabel(value) {
  const d = new Date(value);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function getInitials(name) {
  const parts = (name || "?").trim().split(/\s+/);
  const first = parts[0]?.[0] || "?";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : parts[0]?.[1] || "";
  return (first + last).toUpperCase();
}

function ConfirmModal({ onCancel, onConfirm, busy, summary }) {
  useEffect(() => {
    function handleKey(e) {
      if (e.key === "Escape" && !busy) onCancel();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [busy, onCancel]);

  return (
    <div
      className="stfquote-modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div className="stfquote-modal" role="dialog" aria-modal="true">
        <span className="stfquote-modal-icon">
          <Send size={22} />
        </span>
        <h3>Send Initial Quotation?</h3>
        <p>This will email the quotation details below to the customer.</p>

        <div className="stfquote-modal-summary">
          <div>
            <span>Package</span>
            <strong>{summary.packageDetails}</strong>
          </div>
          <div>
            <span>Estimated cost</span>
            <strong>{summary.estimatedCost}</strong>
          </div>
          <div>
            <span>Payment terms</span>
            <strong>{summary.paymentTerms}</strong>
          </div>
        </div>

        <div className="stfquote-modal-actions">
          <button type="button" className="stfquote-btn-secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="stfquote-btn-confirm" onClick={onConfirm} disabled={busy}>
            {busy ? "Sending..." : "Yes, send it"}
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

  return (
    <div className={`stfquote-toast ${type}`} role="status">
      {type === "success" ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
      <span>{message}</span>
      <button type="button" onClick={onDone} aria-label="Close">
        <X size={14} />
      </button>
    </div>
  );
}

function ChatBubble({ side, sender, time, content, isFirst }) {
  return (
    <div className={`stfquote-msg-row ${side}`}>
      {side === "customer" && <span className="stfquote-msg-avatar">{getInitials(sender)}</span>}
      <div className="stfquote-msg">
        <div className="stfquote-msg-meta">
          <span className="stfquote-msg-sender">{sender}</span>
          {isFirst && <span className="stfquote-msg-tag">Original inquiry</span>}
          <span className="stfquote-msg-time">{formatTime(time)}</span>
        </div>
        <p className="stfquote-msg-content">{content}</p>
      </div>
      {side === "staff" && <span className="stfquote-msg-avatar staff">{getInitials(sender)}</span>}
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="stfquote-stack">
      <div className="stfquote-skel stfquote-skel-hero" />
      <div className="stfquote-grid">
        <div className="stfquote-skel stfquote-skel-chat" />
        <div className="stfquote-skel stfquote-skel-side" />
      </div>
    </div>
  );
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
  const [triedSend, setTriedSend] = useState(false);

  const [showConfirm, setShowConfirm] = useState(false);
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState(null);

  // Conversation thread state
  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(true);
  const [replyText, setReplyText] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const threadRef = useRef(null);
  const lastCountRef = useRef(0);

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

  // Scroll only the chat box (not the whole page) to the newest message.
  // It runs when the page loads and when the number of messages changes,
  // so the 15-second refresh does not keep jumping the chat around.
  useEffect(() => {
    const box = threadRef.current;
    if (!box) return;
    const smooth = lastCountRef.current > 0;
    box.scrollTo({ top: box.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    lastCountRef.current = messages.length;
  }, [messages.length, messagesLoading, inquiry]);

  function handleSendClick() {
    setTriedSend(true);
    if (!packageDetails.trim() || !estimatedCost.trim() || !paymentTerms.trim()) {
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

  // Build the chat list: original inquiry first, then the replies,
  // with a day divider whenever the date changes.
  const thread = [];
  if (inquiry) {
    const all = [
      {
        key: "original",
        side: "customer",
        sender: inquiry.full_name,
        time: inquiry.received_at,
        content: inquiry.message,
        isFirst: true,
      },
      ...messages.map((msg) => ({
        key: msg.id,
        side: msg.sender_type === "STAFF" ? "staff" : "customer",
        sender: msg.sender_type === "STAFF" ? msg.staff_username || "Staff" : inquiry.full_name,
        time: msg.sent_at,
        content: msg.content,
      })),
    ];
    let lastDay = "";
    all.forEach((item) => {
      const day = item.time ? new Date(item.time).toDateString() : "";
      if (day && day !== lastDay) {
        thread.push({ divider: true, key: `day-${day}`, label: dayLabel(item.time) });
        lastDay = day;
      }
      thread.push(item);
    });
  }

  const replyCount = messages.length;
  const missing = (value) => triedSend && !value.trim();

  return (
    <StaffLayout>
      <div className="stfquote-page">
        {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}

        {loading && <PageSkeleton />}

        {!loading && loadError && (
          <div className="stfquote-card stfquote-error-card">
            <span className="stfquote-error-icon">
              <AlertCircle size={26} />
            </span>
            <p className="stfquote-error-title">{loadError}</p>
            <p className="stfquote-error-hint">It may have been removed, or the server is not reachable.</p>
            <button type="button" className="stfquote-btn-confirm" onClick={() => navigate("/staff/email-inquiries")}>
              Back to Email Inquiries
            </button>
          </div>
        )}

        {!loading && !loadError && inquiry && (
          <div className="stfquote-stack">
            {/* ---------- Header ---------- */}
            <section className="stfquote-hero">
              <div className="stfquote-hero-glow" aria-hidden="true" />
              <button
                type="button"
                className="stfquote-back"
                onClick={() => navigate("/staff/email-inquiries")}
                aria-label="Back to Email Inquiries"
              >
                <ArrowLeft size={18} />
              </button>

              <span className="stfquote-hero-avatar">{getInitials(inquiry.full_name)}</span>

              <div className="stfquote-hero-text">
                <span className="stfquote-hero-kicker">Inquiry #{inquiry.id}</span>
                <h1>{inquiry.full_name}</h1>
                <p>
                  <Mail size={13} />
                  <span>{inquiry.email}</span>
                </p>
              </div>

              <span className={`stfquote-hero-status ${alreadySent ? "sent" : "pending"}`}>
                {alreadySent ? <CheckCircle2 size={15} /> : <Clock size={15} />}
                {alreadySent ? "Quotation sent" : "Waiting for quotation"}
              </span>
            </section>

            <div className="stfquote-grid">
              {/* ---------- Conversation ---------- */}
              <section className="stfquote-card stfquote-chat">
                <div className="stfquote-card-head">
                  <div>
                    <h2>
                      <MessagesSquare size={18} />
                      Conversation
                    </h2>
                    <p>Ask questions here first, then send the quotation once the package is settled.</p>
                  </div>
                  <span className="stfquote-count">
                    {replyCount} repl{replyCount === 1 ? "y" : "ies"}
                  </span>
                </div>

                <div className="stfquote-thread" ref={threadRef}>
                  {thread.map((item) =>
                    item.divider ? (
                      <div key={item.key} className="stfquote-day">
                        <span>{item.label}</span>
                      </div>
                    ) : (
                      <ChatBubble
                        key={item.key}
                        side={item.side}
                        sender={item.sender}
                        time={item.time}
                        content={item.content}
                        isFirst={item.isFirst}
                      />
                    )
                  )}
                  {messagesLoading && <p className="stfquote-thread-loading">Loading conversation...</p>}
                  {!messagesLoading && replyCount === 0 && (
                    <p className="stfquote-thread-empty">No replies yet. Send the first message below.</p>
                  )}
                </div>

                <div className="stfquote-reply">
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={handleReplyKeyDown}
                    placeholder="Type a message..."
                    disabled={sendingReply}
                    rows={2}
                  />
                  <div className="stfquote-reply-bar">
                    <span className="stfquote-reply-hint">
                      <kbd>Enter</kbd> to send · <kbd>Shift</kbd> + <kbd>Enter</kbd> for a new line
                    </span>
                    <button
                      type="button"
                      className="stfquote-reply-send"
                      onClick={handleSendReply}
                      disabled={sendingReply || !replyText.trim()}
                    >
                      <Send size={15} />
                      {sendingReply ? "Sending..." : "Send"}
                    </button>
                  </div>
                </div>
              </section>

              {/* ---------- Side panel ---------- */}
              <aside className="stfquote-side">
                <section className="stfquote-card">
                  <h3 className="stfquote-side-title">Inquiry details</h3>
                  <ul className="stfquote-info">
                    <li>
                      <span className="stfquote-info-icon">
                        <Tag size={15} />
                      </span>
                      <div>
                        <span>Subject</span>
                        <strong>{inquiry.subject_display || "—"}</strong>
                      </div>
                    </li>
                    <li>
                      <span className="stfquote-info-icon">
                        <Inbox size={15} />
                      </span>
                      <div>
                        <span>Received</span>
                        <strong>{formatDateTime(inquiry.received_at)}</strong>
                      </div>
                    </li>
                    <li>
                      <span className="stfquote-info-icon">
                        <Mail size={15} />
                      </span>
                      <div>
                        <span>Email</span>
                        <a href={`mailto:${inquiry.email}`}>{inquiry.email}</a>
                      </div>
                    </li>
                  </ul>

                  <div className="stfquote-steps">
                    <div className="stfquote-step done">
                      <span className="stfquote-step-dot">
                        <CheckCircle2 size={13} />
                      </span>
                      Inquiry received
                    </div>
                    <div className={`stfquote-step ${replyCount > 0 ? "done" : "current"}`}>
                      <span className="stfquote-step-dot">
                        {replyCount > 0 ? <CheckCircle2 size={13} /> : <MessageSquare size={12} />}
                      </span>
                      Talk with customer
                    </div>
                    <div className={`stfquote-step ${alreadySent ? "done" : replyCount > 0 ? "current" : ""}`}>
                      <span className="stfquote-step-dot">
                        {alreadySent ? <CheckCircle2 size={13} /> : <Send size={11} />}
                      </span>
                      Quotation sent
                    </div>
                  </div>
                </section>

                {alreadySent ? (
                  <section className="stfquote-card stfquote-quote sent">
                    <div className="stfquote-quote-head">
                      <span className="stfquote-quote-icon sent">
                        <CheckCircle2 size={20} />
                      </span>
                      <div>
                        <h3>Initial Quotation Sent</h3>
                        <p>Sent on {formatDateTime(inquiry.quotation_sent_at)}</p>
                      </div>
                    </div>

                    <div className="stfquote-values">
                      <div className="stfquote-value">
                        <span>
                          <Package size={14} />
                          Package Details
                        </span>
                        <p>{inquiry.quotation_package_details || "—"}</p>
                      </div>
                      <div className="stfquote-value highlight">
                        <span>
                          <Wallet size={14} />
                          Estimated Cost
                        </span>
                        <p>{inquiry.quotation_estimated_cost || "—"}</p>
                      </div>
                      <div className="stfquote-value">
                        <span>
                          <CalendarClock size={14} />
                          Payment Terms
                        </span>
                        <p>{inquiry.quotation_payment_terms || "—"}</p>
                      </div>
                    </div>

                    <div className="stfquote-note-card">
                      <div className="stfquote-note-header">
                        <MessageSquare size={14} />
                        <span>Message to Customer</span>
                      </div>
                      <p className="stfquote-note-content">{inquiry.quotation_message_to_customer || "—"}</p>
                    </div>
                  </section>
                ) : (
                  <section className="stfquote-card stfquote-quote">
                    <div className="stfquote-quote-head">
                      <span className="stfquote-quote-icon">
                        <FileText size={20} />
                      </span>
                      <div>
                        <h3>Send Initial Quotation</h3>
                        <p>Fill this in once you and the customer agree on a package.</p>
                      </div>
                    </div>

                    <div className="stfquote-form">
                      <div className={`stfquote-field ${missing(packageDetails) ? "invalid" : ""}`}>
                        <label htmlFor="stfquote-package">
                          Package Details <em>*</em>
                        </label>
                        <div className="stfquote-input">
                          <Package size={16} />
                          <input
                            id="stfquote-package"
                            value={packageDetails}
                            onChange={(e) => setPackageDetails(e.target.value)}
                            placeholder="e.g. 6KW On-Grid Package"
                          />
                        </div>
                      </div>

                      <div className={`stfquote-field ${missing(estimatedCost) ? "invalid" : ""}`}>
                        <label htmlFor="stfquote-cost">
                          Estimated Cost <em>*</em>
                        </label>
                        <div className="stfquote-input">
                          <Wallet size={16} />
                          <input
                            id="stfquote-cost"
                            value={estimatedCost}
                            onChange={(e) => setEstimatedCost(e.target.value)}
                            placeholder="e.g. ₱250,000"
                          />
                        </div>
                      </div>

                      <div className={`stfquote-field ${missing(paymentTerms) ? "invalid" : ""}`}>
                        <label htmlFor="stfquote-terms">
                          Payment Terms <em>*</em>
                        </label>
                        <div className="stfquote-input">
                          <CalendarClock size={16} />
                          <input
                            id="stfquote-terms"
                            value={paymentTerms}
                            onChange={(e) => setPaymentTerms(e.target.value)}
                            placeholder="e.g. 50% down, balance on completion"
                          />
                        </div>
                      </div>

                      <div className="stfquote-field">
                        <label htmlFor="stfquote-note">
                          Additional Note <span className="stfquote-optional">(optional)</span>
                        </label>
                        <textarea
                          id="stfquote-note"
                          value={messageToCustomer}
                          onChange={(e) => setMessageToCustomer(e.target.value)}
                          placeholder="Any extra info for the customer..."
                        />
                      </div>

                      <button
                        type="button"
                        className="stfquote-send-button"
                        disabled={sending}
                        onClick={handleSendClick}
                      >
                        <Send size={16} />
                        Send Initial Quotation
                      </button>
                    </div>
                  </section>
                )}
              </aside>
            </div>
          </div>
        )}

        {showConfirm && (
          <ConfirmModal
            busy={sending}
            summary={{ packageDetails, estimatedCost, paymentTerms }}
            onCancel={() => setShowConfirm(false)}
            onConfirm={performSend}
          />
        )}
      </div>
    </StaffLayout>
  );
}