import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  X,
  Inbox,
  Clock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  MessageCircle,
  ArrowRight,
  Info,
  Mail,
  RefreshCw,
  Send,
  Eye,
} from "lucide-react";
import StaffLayout from "../components/StaffLayout";
import FilterMenu from "../../../components/FilterMenu";
import { getInquiriesPage } from "../../../api/inquiries";
import "../styles/staff-email-inquiries.css";

const PAGE_SIZE = 20;

// Filter options - shown in the Filter drop-down button
// replied: null = all, false = pending, true = replied (matches the API)
const STATUS_FILTERS = [
  {
    key: "ALL",
    label: "All Inquiries",
    replied: null,
    icon: Inbox,
    tone: "navy",
  },
  {
    key: "PENDING",
    label: "Pending",
    replied: false,
    icon: Clock,
    tone: "gold",
  },
  {
    key: "REPLIED",
    label: "Replied",
    replied: true,
    icon: CheckCircle2,
    tone: "green",
  },
];

const AVATAR_TONES = ["navy", "blue", "violet", "green", "amber", "rose"];

function formatDateTime(value) {
  if (!value) return { date: "—", time: "" };
  const d = new Date(value);
  return {
    date: d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }),
    time: d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
  };
}

function timeAgo(value) {
  if (!value) return "";
  const diff = Date.now() - new Date(value).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hr${hours > 1 ? "s" : ""} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days > 1 ? "s" : ""} ago`;
  return "";
}

function getInitials(name, email) {
  const source = (name || "").trim();
  if (source) {
    const parts = source.split(/\s+/);
    const first = parts[0][0] || "";
    const last = parts.length > 1 ? parts[parts.length - 1][0] : parts[0][1] || "";
    return (first + last).toUpperCase();
  }
  return (email || "?").slice(0, 2).toUpperCase();
}

// Page numbers with "..." when there are many pages
function getPageNumbers(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set([1, total, current, current - 1, current + 1]);
  const list = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const result = [];
  list.forEach((p, i) => {
    if (i > 0 && p - list[i - 1] > 1) result.push("...");
    result.push(p);
  });
  return result;
}

function ListHead() {
  return (
    <div className="stfinq-row stfinq-head" role="row">
      <span>Inquiry #</span>
      <span>Customer</span>
      <span className="stfinq-hide-md">Subject</span>
      <span className="stfinq-hide-sm">Received</span>
      <span>Status</span>
      <span className="stfinq-hide-md stfinq-head-right">Next Step</span>
    </div>
  );
}

function RowSkeleton() {
  return (
    <div className="stfinq-row stfinq-row-skeleton">
      <span className="stfinq-skel stfinq-skel-xs" />
      <span className="stfinq-skel-customer">
        <span className="stfinq-skel stfinq-skel-avatar" />
        <span className="stfinq-skel-stack">
          <span className="stfinq-skel stfinq-skel-md" />
          <span className="stfinq-skel stfinq-skel-lg" />
        </span>
      </span>
      <span className="stfinq-hide-md">
        <span className="stfinq-skel stfinq-skel-pill-lg" />
      </span>
      <span className="stfinq-hide-sm">
        <span className="stfinq-skel stfinq-skel-sm" />
      </span>
      <span>
        <span className="stfinq-skel stfinq-skel-pill" />
      </span>
      <span className="stfinq-hide-md stfinq-head-right">
        <span className="stfinq-skel stfinq-skel-btn" />
      </span>
    </div>
  );
}

function InquiryRow({ inq, onOpen }) {
  const received = formatDateTime(inq.received_at);
  const ago = timeAgo(inq.received_at);
  const replied = Boolean(inq.quotation_sent);
  const unread = Boolean(inq.has_unread_reply);
  const avatarTone = AVATAR_TONES[Number(inq.id || 0) % AVATAR_TONES.length];

  let next;
  if (unread) {
    next = { label: "Read reply", icon: MessageCircle, tone: "urgent" };
  } else if (replied) {
    next = { label: "View", icon: Eye, tone: "quiet" };
  } else {
    next = { label: "Send quotation", icon: Send, tone: "action" };
  }
  const NextIcon = next.icon;

  return (
    <div
      className={`stfinq-row stfinq-item ${unread ? "unread" : ""} ${!replied ? "pending" : ""}`}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(inq.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(inq.id);
        }
      }}
    >
      <span className="stfinq-id">#{inq.id}</span>

      <span className="stfinq-customer">
        <span className={`stfinq-avatar tone-${avatarTone}`}>
          {getInitials(inq.full_name, inq.email)}
          {unread && <span className="stfinq-avatar-dot" aria-hidden="true" />}
        </span>
        <span className="stfinq-customer-text">
          <span className="stfinq-customer-name">
            <span className="stfinq-name-text">{inq.full_name || "No name given"}</span>
            {unread && (
              <span className="stfinq-new-reply" title="New customer reply">
                <MessageCircle size={11} />
                New reply
              </span>
            )}
          </span>
          <span className="stfinq-customer-email">
            <Mail size={12} />
            <span className="stfinq-email-text">{inq.email}</span>
          </span>
          {/* Subject shows here on smaller screens */}
          {inq.subject_display && (
            <span className="stfinq-subject stfinq-subject-inline">{inq.subject_display}</span>
          )}
        </span>
      </span>

      <span className="stfinq-hide-md">
        {inq.subject_display ? (
          <span className="stfinq-subject">{inq.subject_display}</span>
        ) : (
          <span className="stfinq-muted">—</span>
        )}
      </span>

      <span className="stfinq-hide-sm stfinq-received">
        <span className="stfinq-date">{received.date}</span>
        <span className="stfinq-time">
          {received.time}
          {ago && <span className="stfinq-ago"> · {ago}</span>}
        </span>
      </span>

      <span>
        <span className={`stfinq-status ${replied ? "replied" : "pending"}`}>
          {replied ? <CheckCircle2 size={13} /> : <Clock size={13} />}
          {replied ? "Replied" : "Pending"}
        </span>
      </span>

      <span className="stfinq-hide-md stfinq-head-right">
        <span className={`stfinq-next ${next.tone}`}>
          <NextIcon size={14} />
          {next.label}
          <ArrowRight size={14} className="stfinq-next-arrow" />
        </span>
      </span>
    </div>
  );
}

export default function StaffEmailInquiriesPage() {
  const navigate = useNavigate();
  const [inquiries, setInquiries] = useState([]);
  const [count, setCount] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrevious, setHasPrevious] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [filterCounts, setFilterCounts] = useState({});
  const [reloadKey, setReloadKey] = useState(0);

  const currentFilter = STATUS_FILTERS.find((f) => f.key === statusFilter) || STATUS_FILTERS[0];

  // Load the current page of inquiries
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const data = await getInquiriesPage(page, currentFilter.replied);
        if (cancelled) return;
        setInquiries(data.results);
        setCount(data.count);
        setHasNext(Boolean(data.next));
        setHasPrevious(Boolean(data.previous));
        setError("");
      } catch {
        if (!cancelled) setError("Could not load inquiries. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, statusFilter, reloadKey]);

  // Counts for the Filter list - when the page opens and on Refresh
  useEffect(() => {
    let cancelled = false;

    async function loadCounts() {
      try {
        const results = await Promise.all(
          STATUS_FILTERS.map(async (f) => {
            const data = await getInquiriesPage(1, f.replied);
            return [f.key, data.count];
          })
        );
        if (!cancelled) setFilterCounts(Object.fromEntries(results));
      } catch {
        // Counts are a nice-to-have; the list just shows "—" if this fails.
      }
    }

    loadCounts();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  function changeFilter(key) {
    setStatusFilter(key);
    setPage(1);
  }

  function clearAll() {
    setSearchTerm("");
    changeFilter("ALL");
  }

  function openInquiry(id) {
    navigate(`/staff/email-inquiries/${id}/quotation`);
  }

  function refresh() {
    setError("");
    setReloadKey((k) => k + 1);
  }

  function goToPage(p) {
    setPage(p);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Search looks at the inquiries on the current page only - it matches
  // an inquiry # exactly, or part of a name or email.
  const rawTerm = searchTerm.trim().toLowerCase();
  const filteredInquiries = inquiries.filter((inq) => {
    if (!rawTerm) return true;
    if (/^#?\d+$/.test(rawTerm)) {
      return String(inq.id) === rawTerm.replace(/^#/, "");
    }
    return (
      (inq.full_name || "").toLowerCase().includes(rawTerm) ||
      (inq.email || "").toLowerCase().includes(rawTerm)
    );
  });

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const hasActiveFilters = statusFilter !== "ALL" || Boolean(rawTerm);
  const pendingCount = filterCounts.PENDING;
  const unreadOnPage = inquiries.filter((inq) => inq.has_unread_reply).length;

  return (
    <StaffLayout pageTitle="Email Inquiries" pageSubtitle="Manage incoming customer inquiries">
      <div className="stfinq-page">
        {/* ---------- Banner ---------- */}
        <section className="stfinq-hero">
          <div className="stfinq-hero-glow" aria-hidden="true" />
          <div className="stfinq-hero-icon">
            <Mail size={26} />
          </div>
          <div className="stfinq-hero-text">
            <h1>Customer Inquiries</h1>
            <p>
              {pendingCount === undefined
                ? "Read customer messages and send them a quotation."
                : pendingCount === 0
                ? "You're all caught up. Every inquiry has a quotation."
                : `${pendingCount} inquir${pendingCount === 1 ? "y is" : "ies are"} still waiting for a quotation.`}
            </p>
          </div>
          <div className="stfinq-hero-actions">
            {pendingCount > 0 && statusFilter !== "PENDING" && (
              <button type="button" className="stfinq-hero-btn gold" onClick={() => changeFilter("PENDING")}>
                <Clock size={16} />
                Show pending
              </button>
            )}
            <button type="button" className="stfinq-hero-btn glass" onClick={refresh} disabled={loading}>
              <RefreshCw size={16} className={loading ? "spin" : ""} />
              Refresh
            </button>
          </div>
        </section>

        {/* ---------- Inbox card ---------- */}
        <section className="stfinq-card">
          <div className="stfinq-card-head">
            <div className="stfinq-card-title">
              <h2>
                <Inbox size={18} />
                Inquiry List
              </h2>
              <p>
                {unreadOnPage > 0 ? (
                  <span className="stfinq-unread-note">
                    {unreadOnPage} new repl{unreadOnPage === 1 ? "y" : "ies"} on this page
                  </span>
                ) : (
                  "Click any row to open the inquiry."
                )}
              </p>
            </div>

            <div className="stfinq-tools">
              <div className="stfinq-search">
                <Search size={17} className="stfinq-search-icon" />
                <input
                  type="text"
                  placeholder="Search name, email, or inquiry #"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                {searchTerm && (
                  <button
                    type="button"
                    className="stfinq-search-clear"
                    onClick={() => setSearchTerm("")}
                    aria-label="Clear search"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              <FilterMenu
                options={STATUS_FILTERS}
                activeKey={statusFilter}
                counts={filterCounts}
                onPick={changeFilter}
                alertKey="PENDING"
                ariaLabel="Filter by status"
              />
            </div>
          </div>

          {/* Search only checks the inquiries on this page */}
          {rawTerm && totalPages > 1 && (
            <div className="stfinq-filterbar">
              <p className="stfinq-search-note">
                <Info size={14} />
                Search only looks at this page (page {page} of {totalPages}).
              </p>
            </div>
          )}

          {error ? (
            <div className="stfinq-empty">
              <span className="stfinq-empty-badge red">
                <AlertCircle size={26} />
              </span>
              <p className="stfinq-empty-title">Something went wrong</p>
              <p className="stfinq-empty-hint">{error}</p>
              <button type="button" className="stfinq-btn-primary" onClick={refresh}>
                <RefreshCw size={15} />
                Try again
              </button>
            </div>
          ) : loading ? (
            <div className="stfinq-list" role="table">
              <ListHead />
              {Array.from({ length: 5 }).map((_, i) => (
                <RowSkeleton key={i} />
              ))}
            </div>
          ) : filteredInquiries.length === 0 ? (
            <div className="stfinq-empty">
              <span className="stfinq-empty-badge">
                <Inbox size={26} />
              </span>
              <p className="stfinq-empty-title">
                {hasActiveFilters ? "No inquiries match your search or filter" : "No inquiries received yet"}
              </p>
              <p className="stfinq-empty-hint">
                {hasActiveFilters
                  ? "Try a different name, email, or filter."
                  : "New customer inquiries will show up here."}
              </p>
              {hasActiveFilters && (
                <button type="button" className="stfinq-btn-secondary" onClick={clearAll}>
                  Show all inquiries
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="stfinq-list" role="table">
                <ListHead />
                {filteredInquiries.map((inq) => (
                  <InquiryRow key={inq.id} inq={inq} onOpen={openInquiry} />
                ))}
              </div>

              {totalPages > 1 && (
                <div className="stfinq-pagination">
                    <div className="stfinq-pagination-controls">
                      <button
                        type="button"
                        className="stfinq-page-btn"
                        disabled={!hasPrevious}
                        onClick={() => goToPage(page - 1)}
                        aria-label="Previous page"
                      >
                        <ChevronLeft size={16} />
                      </button>
                      {getPageNumbers(page, totalPages).map((p, i) =>
                        p === "..." ? (
                          <span key={`gap-${i}`} className="stfinq-page-gap">…</span>
                        ) : (
                          <button
                            key={p}
                            type="button"
                            className={`stfinq-page-num ${p === page ? "active" : ""}`}
                            onClick={() => goToPage(p)}
                          >
                            {p}
                          </button>
                        )
                      )}
                      <button
                        type="button"
                        className="stfinq-page-btn"
                        disabled={!hasNext}
                        onClick={() => goToPage(page + 1)}
                        aria-label="Next page"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                </div>
              )}
            </>
          )}
        </section>

        <p className="stfinq-footnote">
          <ArrowRight size={13} />
          Click any row to read the inquiry and send or view the quotation.
        </p>
      </div>
    </StaffLayout>
  );
}
