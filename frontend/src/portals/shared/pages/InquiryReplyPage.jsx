import { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import { Send } from "lucide-react";
import { getPublicInquiryThread, sendPublicInquiryReply } from "../../../api/inquiries";
import logo from "../../../assets/images/logo.jpg";
import "../styles/inquiry-reply.css";

export default function InquiryReplyPage() {
  const { token } = useParams();

  const [thread, setThread] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const threadEndRef = useRef(null);
  const initialLoadRef = useRef(true);

  const load = useCallback(async (isInitial) => {
    try {
      const data = await getPublicInquiryThread(token);
      setThread(data);
      setLoadError("");
    } catch (err) {
      if (err?.response?.status === 404) {
        setLoadError("This link is no longer valid.");
      } else if (isInitial) {
        setLoadError("Could not load this conversation. Please try again.");
      }
      // On a background poll, a transient network error shouldn't
      // wipe out an already-loaded conversation with an error screen -
      // only the initial load shows a load error.
    } finally {
      if (isInitial) setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (initialLoadRef.current) {
      initialLoadRef.current = false;
      load(true);
    }
    const interval = setInterval(() => load(false), 15000);
    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread]);

  async function handleSend() {
    if (!replyText.trim()) return;
    setSending(true);
    setSendError("");
    try {
      const updated = await sendPublicInquiryReply(token, replyText.trim());
      setThread(updated);
      setReplyText("");
    } catch (err) {
      if (err?.response?.status === 429) {
        setSendError("You're sending messages too quickly. Please wait a bit and try again.");
      } else if (err?.response?.status === 404) {
        setSendError("This link is no longer valid.");
      } else {
        setSendError("Could not send your message. Please try again.");
      }
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="inqreply-page">
      <div className="inqreply-card">
        <div className="inqreply-header">
          <img src={logo} alt="Glomax Solar Enterprises" className="inqreply-logo" />
          <div>
            <p className="inqreply-eyebrow">Glomax Solar Enterprises</p>
            <h1>Your Inquiry Conversation</h1>
          </div>
        </div>

        {loading && <p className="inqreply-loading">Loading...</p>}
        {loadError && <p className="inqreply-error">{loadError}</p>}

        {!loading && !loadError && thread && (
          <>
            <div className="inqreply-summary">
              <p className="inqreply-summary-label">{thread.subject_display}</p>
              <p className="inqreply-summary-name">{thread.full_name}</p>
            </div>

            <div className="inqreply-thread">
              <div className="inqreply-msg customer">
                <div className="inqreply-msg-meta">
                  <span>{thread.full_name}</span>
                  <span>{new Date(thread.received_at).toLocaleString()}</span>
                </div>
                <p>{thread.message}</p>
              </div>

              {thread.messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`inqreply-msg ${msg.sender_type === "STAFF" ? "staff" : "customer"}`}
                >
                  <div className="inqreply-msg-meta">
                    <span>{msg.sender_type === "STAFF" ? "Glomax Solar Enterprises" : thread.full_name}</span>
                    <span>{new Date(msg.sent_at).toLocaleString()}</span>
                  </div>
                  <p>{msg.content}</p>
                </div>
              ))}

              {/* Initial Quotation renders last, matching the intended
                  flow: it's only sent once the conversation above is
                  finished and the right package has been confirmed. */}
              {thread.quotation_sent && (
                <div className="inqreply-msg staff inqreply-quotation">
                  <div className="inqreply-msg-meta">
                    <span>Glomax Solar Enterprises</span>
                    <span>{new Date(thread.quotation_sent_at).toLocaleString()}</span>
                  </div>
                  <p className="inqreply-quotation-title">Initial Quotation</p>
                  <p><strong>Package:</strong> {thread.quotation_package_details}</p>
                  <p><strong>Estimated Cost:</strong> {thread.quotation_estimated_cost}</p>
                  <p><strong>Payment Terms:</strong> {thread.quotation_payment_terms}</p>
                  {thread.quotation_message_to_customer && (
                    <p>{thread.quotation_message_to_customer}</p>
                  )}
                </div>
              )}

              <div ref={threadEndRef} />
            </div>

            <div className="inqreply-composer">
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type your follow-up question here..."
                disabled={sending}
              />
              <button onClick={handleSend} disabled={sending || !replyText.trim()}>
                <Send size={16} />
                {sending ? "Sending..." : "Send"}
              </button>
            </div>
            {sendError && <p className="inqreply-send-error">{sendError}</p>}

            <p className="inqreply-footnote">
              This page does not require an account. If you'd like to proceed with a
              roof assessment, please register on our website.
            </p>
          </>
        )}
      </div>
    </div>
  );
}