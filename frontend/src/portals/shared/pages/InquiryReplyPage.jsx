import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import {
  Send,
  RefreshCw,
  Clock,
  MessageCircle,
  FileText,
  UserPlus,
  ClipboardCheck,
  Home,
  ShieldCheck,
  Check,
} from "lucide-react";
import { getPublicInquiryThread, sendPublicInquiryReply } from "../../../api/inquiries";
import logo from "../../../assets/images/logo.jpg";
import "../styles/inquiry-reply.css";

// How often the page checks for new messages. It checks quickly while
// the conversation is active, then slows down when nothing happens, so
// it stays under the server's request limit.
const FAST_POLL_MS = 4000;     // first 2 minutes of activity
const MEDIUM_POLL_MS = 15000;  // from 2 to 5 minutes without activity
const SLOW_POLL_MS = 30000;    // after 5 minutes without activity

// The backend only accepts messages up to this length.
const MAX_LENGTH = 4000;
const COMPANY_ADDRESS = "8000 Plaza Residences Plaza, Brgy. 303, Lacson St., Sta. Cruz, Manila";

// "Oct 28, 4:25 PM" (the year is added only if it is not this year)
function formatTime(value) {
  if (!value) return "";
  const date = new Date(value);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
    hour: "numeric",
    minute: "2-digit",
  });
}

// "Oct 28" (the year is added only if it is not this year)
function formatDay(value) {
  if (!value) return "";
  const date = new Date(value);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

// Puts the inquiry, the quotation marker, and every message in the
// order they were really sent, oldest first.
function buildItems(thread) {
  const items = [
    { key: "first", kind: "customer", time: thread.received_at, text: thread.message },
  ];

  thread.messages.forEach((msg) => {
    items.push({
      key: `m-${msg.id}`,
      kind: msg.sender_type === "STAFF" ? "staff" : "customer",
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

// True when nothing new came in, so the page does not redraw for no reason.
function isSameThread(a, b) {
  if (!a || !b) return false;
  const lastA = a.messages[a.messages.length - 1];
  const lastB = b.messages[b.messages.length - 1];
  return (
    a.messages.length === b.messages.length &&
    (lastA?.id ?? null) === (lastB?.id ?? null) &&
    a.quotation_sent === b.quotation_sent &&
    a.quotation_sent_at === b.quotation_sent_at
  );
}

// One short sentence that tells the customer where things stand.
function getStatusText(items) {
  const talk = items.filter((item) => item.kind !== "quotation");
  const hasQuotation = items.some((item) => item.kind === "quotation");
  const last = talk[talk.length - 1];

  if (last.kind === "staff") {
    return `Glomax Solar replied on ${formatTime(last.time)}. You can answer below.`;
  }
  if (talk.length === 1) {
    return hasQuotation
      ? "We sent you a quotation. Please read it, then ask us anything below."
      : "We got your inquiry. Our staff will reply by email soon.";
  }
  return "Your message was sent. We will reply by email. You can come back to this page to read it.";
}

// The header and footer around every state of the page.
function Shell({ children }) {
  return (
    <div className="inqreply-page">
      <header className="inqreply-top">
        <div className="inqreply-top-inner">
          <img src={logo} alt="" className="inqreply-logo" />
          <span className="inqreply-brand">Glomax Solar Enterprises</span>
          <span className="inqreply-secure">
            <ShieldCheck size={14} />
            Private link
          </span>
        </div>
      </header>

      <main className="inqreply-main">{children}</main>

      <footer className="inqreply-footer">
        <p className="inqreply-footer-name">Glomax Solar Enterprises</p>
        <p>{COMPANY_ADDRESS}</p>
        <p>You do not need an account to use this page.</p>
      </footer>
    </div>
  );
}

export default function InquiryReplyPage() {
  const { token } = useParams();

  const [thread, setThread] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [linkInvalid, setLinkInvalid] = useState(false);

  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [newReply, setNewReply] = useState(false);

  const lastRowRef = useRef(null);
  const composerRef = useRef(null);
  const threadRef = useRef(null);
  const scrollToLatestRef = useRef(false);
  const initialLoadRef = useRef(true);
  // The last time something happened (a message came in, was sent, or
  // the customer was typing). Used to decide how often to check.
  const lastActivityRef = useRef(Date.now());

  const load = useCallback(async (isInitial) => {
    try {
      const data = await getPublicInquiryThread(token);
      const before = threadRef.current;

      if (!isSameThread(before, data)) {
        lastActivityRef.current = Date.now();

        // A new message from Glomax Solar came in while the page is open.
        const gotNewStaffMessage =
          !isInitial &&
          before &&
          data.messages.length > before.messages.length &&
          data.messages[data.messages.length - 1].sender_type === "STAFF";

        if (gotNewStaffMessage) {
          // If the customer is looking at the end of the conversation,
          // show the reply right away. If they are reading higher up, do
          // not move the page. Show a small button instead.
          const box = composerRef.current?.getBoundingClientRect();
          const lookingAtEnd = box && box.top < window.innerHeight + 200 && box.bottom > -200;
          if (lookingAtEnd) {
            scrollToLatestRef.current = true;
          } else {
            setNewReply(true);
          }
        }

        threadRef.current = data;
        setThread(data);
      }
      setLoadError("");
      setLinkInvalid(false);
    } catch (err) {
      if (err?.response?.status === 404) {
        setLinkInvalid(true);
        setLoadError("This link is no longer valid.");
      } else if (isInitial) {
        setLoadError("We could not load your conversation.");
      }
      // On a background check, a short network problem should not
      // replace an already-loaded conversation with an error screen.
      // Only the first load shows a load error.
    } finally {
      if (isInitial) setLoading(false);
    }
  }, [token]);

  // Checks for new messages by itself. Fast while the conversation is
  // active, slower when it is quiet, and right away when the customer
  // comes back to this tab.
  useEffect(() => {
    let timer = null;
    let stopped = false;
    let busy = false;

    function getDelay() {
      const quietFor = Date.now() - lastActivityRef.current;
      if (quietFor < 2 * 60 * 1000) return FAST_POLL_MS;
      if (quietFor < 5 * 60 * 1000) return MEDIUM_POLL_MS;
      return SLOW_POLL_MS;
    }

    async function tick() {
      if (busy || stopped) return;
      busy = true;
      try {
        if (!document.hidden) await load(false);
      } finally {
        busy = false;
      }
      if (!stopped) {
        clearTimeout(timer);
        timer = setTimeout(tick, getDelay());
      }
    }

    function wake() {
      if (document.hidden) return;
      lastActivityRef.current = Date.now();
      clearTimeout(timer);
      tick();
    }

    if (initialLoadRef.current) {
      initialLoadRef.current = false;
      load(true);
    }
    timer = setTimeout(tick, getDelay());

    document.addEventListener("visibilitychange", wake);
    window.addEventListener("focus", wake);
    window.addEventListener("online", wake);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("focus", wake);
      window.removeEventListener("online", wake);
    };
  }, [load]);

  useEffect(() => {
    const oldTitle = document.title;
    document.title = "Your conversation with Glomax Solar";
    return () => {
      document.title = oldTitle;
    };
  }, []);

  const items = thread ? buildItems(thread) : [];
  const itemCount = items.length;

  function scrollToLatest() {
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    lastRowRef.current?.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "nearest",
    });
  }

  // Bring the newest message into view after the customer sends one,
  // or when a reply comes in while they are at the end of the
  // conversation. It does not move the page for any other refresh.
  useEffect(() => {
    if (!scrollToLatestRef.current) return;
    scrollToLatestRef.current = false;
    scrollToLatest();
  }, [itemCount]);

  // Hide the "New reply" button as soon as the reply is on screen.
  useEffect(() => {
    if (!newReply || !lastRowRef.current || !("IntersectionObserver" in window)) return undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setNewReply(false);
    });
    observer.observe(lastRowRef.current);
    return () => observer.disconnect();
  }, [newReply, itemCount]);

  function handleSeeNewReply() {
    setNewReply(false);
    scrollToLatest();
  }

  function handleRetry() {
    setLoadError("");
    setLoading(true);
    load(true);
  }

  async function handleSend() {
    if (!replyText.trim() || sending) return;
    setSending(true);
    setSendError("");
    try {
      const updated = await sendPublicInquiryReply(token, replyText.trim());
      lastActivityRef.current = Date.now();
      scrollToLatestRef.current = true;
      threadRef.current = updated;
      setThread(updated);
      setReplyText("");
      setNewReply(false);
    } catch (err) {
      if (err?.response?.status === 429) {
        setSendError("You are sending messages too fast. Please wait a little and try again.");
      } else if (err?.response?.status === 404) {
        setSendError("This link is no longer valid.");
      } else {
        setSendError("Your message was not sent. Please check your internet and try again.");
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

  function handleTyping(e) {
    lastActivityRef.current = Date.now();
    setReplyText(e.target.value);
  }

  // ---------- Loading and error screens ----------

  if (loading) {
    return (
      <Shell>
        <div className="inqreply-state">
          <p className="inqreply-state-text">Loading your conversation...</p>
        </div>
      </Shell>
    );
  }

  if (loadError || !thread) {
    return (
      <Shell>
        <div className="inqreply-state">
          <h1 className="inqreply-state-title">{loadError || "We could not load your conversation."}</h1>
          {linkInvalid ? (
            <>
              <p className="inqreply-state-text">
                Please send a new inquiry from our website and we will reply by email.
              </p>
              <a href="/#contact" className="inqreply-cta">Send a new inquiry</a>
            </>
          ) : (
            <>
              <p className="inqreply-state-text">
                Please check your internet connection and try again.
              </p>
              <button type="button" className="inqreply-cta" onClick={handleRetry}>
                <RefreshCw size={16} />
                Try again
              </button>
            </>
          )}
        </div>
      </Shell>
    );
  }

  // ---------- The conversation ----------

  const rawFirstName = thread.full_name.trim().split(/\s+/)[0];
  const firstName = rawFirstName.charAt(0).toUpperCase() + rawFirstName.slice(1);
  const initial = firstName.charAt(0).toUpperCase();
  const talkItems = items.filter((item) => item.kind !== "quotation");
  const lastIsStaff = talkItems[talkItems.length - 1]?.kind === "staff";

  // The Register page fills in the name (and email, if we have it) by itself
  const registerParams = new URLSearchParams();
  registerParams.set("name", thread.full_name.trim());
  if (thread.email) registerParams.set("email", thread.email);
  const registerLink = `/register?${registerParams.toString()}`;

  return (
    <Shell>
      <section className="inqreply-hello">
        <div className="inqreply-hello-glow" aria-hidden="true" />
        <p className="inqreply-hello-eyebrow">Your conversation</p>
        <h1>Hi {firstName}, here is your conversation with Glomax Solar</h1>
        <p className="inqreply-topic">
          <FileText size={14} />
          About: {thread.subject_display}
        </p>

        <p className={`inqreply-status ${lastIsStaff ? "replied" : ""}`} role="status">
          <span className="inqreply-status-icon">
            {lastIsStaff ? <MessageCircle size={20} /> : <Clock size={20} />}
          </span>
          <span>{getStatusText(items)}</span>
        </p>

        <ol className="inqreply-track" aria-label="Where you are">
          <li className="done">
            <span className="inqreply-track-dot"><Check size={14} strokeWidth={3} /></span>
            <span className="inqreply-track-label">Inquiry received</span>
          </li>
          <li className={thread.quotation_sent ? "done" : "current"}>
            <span className="inqreply-track-dot">
              {thread.quotation_sent ? <Check size={14} strokeWidth={3} /> : "2"}
            </span>
            <span className="inqreply-track-label">Quotation sent</span>
          </li>
          <li className={thread.quotation_sent ? "current" : "todo"}>
            <span className="inqreply-track-dot">3</span>
            <span className="inqreply-track-label">Request a roof check</span>
          </li>
        </ol>
      </section>

      {thread.quotation_sent && (
        <section className="inqreply-quote" aria-labelledby="inqreply-quote-title">
          <div className="inqreply-quote-head">
            <h2 id="inqreply-quote-title">Your quotation</h2>
            <span className="inqreply-quote-date">
              Sent on {formatDay(thread.quotation_sent_at)}
            </span>
          </div>

          <dl className="inqreply-quote-grid">
            <div className="inqreply-quote-item">
              <dt>Package</dt>
              <dd>{thread.quotation_package_details}</dd>
            </div>
            <div className="inqreply-quote-item inqreply-quote-cost">
              <dt>Estimated cost</dt>
              <dd>{thread.quotation_estimated_cost}</dd>
            </div>
            <div className="inqreply-quote-item">
              <dt>Payment terms</dt>
              <dd>{thread.quotation_payment_terms}</dd>
            </div>
          </dl>

          {thread.quotation_message_to_customer && (
            <div className="inqreply-quote-note">
              <p className="inqreply-quote-note-title">Message from our team</p>
              <p>{thread.quotation_message_to_customer}</p>
            </div>
          )}

          <p className="inqreply-quote-foot">
            The final price is confirmed after our installer checks your roof.
          </p>
        </section>
      )}

      <section className="inqreply-chat" aria-labelledby="inqreply-chat-title">
        <h2 id="inqreply-chat-title">Conversation</h2>

        <ol className="inqreply-thread" aria-live="polite">
          {items.map((item, index) =>
            item.kind === "quotation" ? (
              <li key={item.key} className="inqreply-divider">
                <span>Quotation sent on {formatDay(item.time)}. You can read it at the top of this page.</span>
              </li>
            ) : (
              <li
                key={item.key}
                className={`inqreply-row ${item.kind}`}
                ref={index === items.length - 1 ? lastRowRef : null}
              >
                {item.kind === "staff" ? (
                  <img src={logo} alt="" className="inqreply-avatar" />
                ) : (
                  <span className="inqreply-avatar inqreply-avatar-initial" aria-hidden="true">
                    {initial}
                  </span>
                )}
                <div className="inqreply-bubble-wrap">
                  <div className="inqreply-meta">
                    <span className="inqreply-who">
                      {item.kind === "staff" ? "Glomax Solar" : "You"}
                    </span>
                    <span className="inqreply-time">{formatTime(item.time)}</span>
                  </div>
                  <p className="inqreply-bubble">{item.text}</p>
                </div>
              </li>
            )
          )}
        </ol>

        <div className="inqreply-composer" ref={composerRef}>
          <label htmlFor="inqreply-text" className="inqreply-composer-label">
            Write a message to Glomax Solar
          </label>
          <textarea
            id="inqreply-text"
            rows={3}
            maxLength={MAX_LENGTH}
            value={replyText}
            onChange={handleTyping}
            onKeyDown={handleKeyDown}
            placeholder="Type your question here..."
            disabled={sending}
          />
          <div className="inqreply-composer-bar">
            <span className="inqreply-hint">Press Enter to send, or Shift + Enter for a new line.</span>
            <button
              type="button"
              className="inqreply-send"
              onClick={handleSend}
              disabled={sending || !replyText.trim()}
            >
              <Send size={18} />
              {sending ? "Sending..." : "Send message"}
            </button>
          </div>
          {sendError && <p className="inqreply-send-error" role="alert">{sendError}</p>}
        </div>
      </section>

      <section className="inqreply-next" aria-labelledby="inqreply-next-title">
        <h2 id="inqreply-next-title">Ready to go ahead?</h2>
        <p className="inqreply-next-sub">It only takes three steps.</p>

        <ol className="inqreply-steps">
          <li>
            <span className="inqreply-step-icon"><UserPlus size={22} /></span>
            <span className="inqreply-step-title">1. Create an account</span>
            <span className="inqreply-step-text">Sign up on our website. It is free.</span>
          </li>
          <li>
            <span className="inqreply-step-icon"><ClipboardCheck size={22} /></span>
            <span className="inqreply-step-title">2. Request a roof check</span>
            <span className="inqreply-step-text">Send a request and choose a visit date.</span>
          </li>
          <li>
            <span className="inqreply-step-icon"><Home size={22} /></span>
            <span className="inqreply-step-title">3. We visit your home</span>
            <span className="inqreply-step-text">Our installer checks your roof.</span>
          </li>
        </ol>

        <div className="inqreply-next-actions">
          <Link to={registerLink} className="inqreply-cta gold">Create an account</Link>
          <Link to="/login" className="inqreply-login-link">I already have an account</Link>
        </div>
      </section>

      {newReply && (
        <button type="button" className="inqreply-newreply" onClick={handleSeeNewReply}>
          New reply from Glomax Solar. Tap to read it
        </button>
      )}
    </Shell>
  );
}