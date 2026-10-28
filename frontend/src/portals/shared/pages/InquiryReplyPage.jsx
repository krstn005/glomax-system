import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { Send } from "lucide-react";
import { getPublicInquiryThread, sendPublicInquiryReply } from "../../../api/inquiries";
import logo from "../../../assets/images/logo.jpg";
import "../styles/inquiry-reply.css";

// How often the page checks for new messages (in milliseconds).
const POLL_MS = 30000;

// Puts the inquiry, the quotation, and every message in the order
// they were really sent, oldest first.
function buildItems(thread) {
  const items = [
    {
      key: "first",
      kind: "customer",
      name: thread.full_name,
      time: thread.received_at,
      text: thread.message,
    },
  ];

  thread.messages.forEach((msg) => {
    items.push({
      key: `m-${msg.id}`,
      kind: msg.sender_type === "STAFF" ? "staff" : "customer",
      name: msg.sender_type === "STAFF" ? "Glomax Solar Enterprises" : thread.full_name,
      time: msg.sent_at,
      text: msg.content,
    });
  });

  if (thread.quotation_sent) {
    items.push({
      key: "quotation",
      kind: "quotation",
      time: thread.quotation_sent_at || thread.received_at,
    });
  }

  items.sort((a, b) => new Date(a.time) - new Date(b.time));
  return items;
}

export default function InquiryReplyPage() {
  const { token } = useParams();

  const [thread, setThread] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const threadBoxRef = useRef(null);
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
      // On a background check, a short network problem should not
      // replace an already-loaded conversation with an error screen.
      // Only the first load shows a load error.
    } finally {
      if (isInitial) setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (initialLoadRef.current) {
      initialLoadRef.current = false;
      load(true);
    }
    const interval = setInterval(() => {
      if (!document.hidden) load(false);
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => {
    const oldTitle = document.title;
    document.title = "Your Inquiry Conversation | Glomax Solar";
    return () => {
      document.title = oldTitle;
    };
  }, []);

  const items = thread ? buildItems(thread) : [];
  const itemCount = items.length;

  // Scroll the message box to the bottom only when the number of
  // messages changes (first load, or a new message). It scrolls the
  // box itself, not the whole page, so the page does not jump while
  // someone is reading or typing.
  useEffect(() => {
    const box = threadBoxRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [itemCount]);

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

            <div className="inqreply-thread" ref={threadBoxRef}>
              {items.map((item) =>
                item.kind === "quotation" ? (
                  <div key={item.key} className="inqreply-msg staff inqreply-quotation">
                    <div className="inqreply-msg-meta">
                      <span>Glomax Solar Enterprises</span>
                      <span>{new Date(item.time).toLocaleString()}</span>
                    </div>
                    <p className="inqreply-quotation-title">Initial Quotation</p>
                    <p><strong>Package:</strong> {thread.quotation_package_details}</p>
                    <p><strong>Estimated Cost:</strong> {thread.quotation_estimated_cost}</p>
                    <p><strong>Payment Terms:</strong> {thread.quotation_payment_terms}</p>
                    {thread.quotation_message_to_customer && (
                      <p>
                        <strong>Message from our team:</strong>{" "}
                        {thread.quotation_message_to_customer}
                      </p>
                    )}
                  </div>
                ) : (
                  <div key={item.key} className={`inqreply-msg ${item.kind}`}>
                    <div className="inqreply-msg-meta">
                      <span>{item.name}</span>
                      <span>{new Date(item.time).toLocaleString()}</span>
                    </div>
                    <p>{item.text}</p>
                  </div>
                )
              )}
            </div>

            <div className="inqreply-composer">
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type your follow-up question here..."
                aria-label="Your message"
                disabled={sending}
              />
              <button onClick={handleSend} disabled={sending || !replyText.trim()}>
                <Send size={16} />
                {sending ? "Sending..." : "Send"}
              </button>
            </div>
            {sendError && <p className="inqreply-send-error">{sendError}</p>}

            <div className="inqreply-next">
              <p className="inqreply-next-text">
                Ready to go ahead? Create an account and send a request for a roof assessment.
              </p>
              <div className="inqreply-next-actions">
                <Link to="/register" className="inqreply-cta">Create an Account</Link>
                <Link to="/login" className="inqreply-login-link">I already have an account</Link>
              </div>
            </div>

            <p className="inqreply-footnote">
              You do not need an account to use this page.
            </p>
          </>
        )}
      </div>
    </div>
  );
}