import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  X,
  Layers,
  ClipboardCheck,
  ClipboardList,
  Eye,
  ShieldCheck,
  CheckCircle2,
  Award,
  XCircle,
  HardHat,
  Undo2,
  FilePen,
  FileCheck,
  FileX,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  PartyPopper,
  SearchX,
  RefreshCw,
  Clock,
} from "lucide-react";
import StaffLayout from "../components/StaffLayout";
import FilterMenu from "../../../components/FilterMenu";
import { getStaffTicketsPage } from "../../../api/staffTickets";
import { formatCurrency } from "../../../utils/currency";
import "../styles/staff-assessment-review.css";
import "../styles/staff-quotation-management.css";
import "../styles/staff-review-hub.css";

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 400;

// Assessments waiting this many days or more get an amber "waiting" label
const OLD_WAIT_DAYS = 3;

// Prices under this amount get a "Check" tag - catches typos like ₱1.00
const LOW_PRICE_WARNING = 1000;

const NEEDS_REVIEW_STATUSES = ["ASSESSMENT_SUBMITTED", "STAFF_REVIEW"];
const NOT_COMPATIBLE_STATUSES = ["NC_CANNOT_PROCEED", "NC_CAN_REAPPLY"];
const ALL_STATUSES = [
  ...NEEDS_REVIEW_STATUSES,
  "ADMIN_REVIEW",
  "APPROVED",
  "COMPLETED",
  ...NOT_COMPATIBLE_STATUSES,
];

// Filter options - shown in the Filter drop-down button
const FILTERS = [
  { key: "NEEDS_REVIEW", label: "Needs Review", statuses: NEEDS_REVIEW_STATUSES, icon: ClipboardCheck, tone: "gold" },
  { key: "ADMIN_REVIEW", label: "Awaiting Admin", statuses: ["ADMIN_REVIEW"], icon: ShieldCheck, tone: "blue" },
  { key: "APPROVED", label: "Approved", statuses: ["APPROVED"], icon: CheckCircle2, tone: "green" },
  { key: "COMPLETED", label: "Completed", statuses: ["COMPLETED"], icon: Award, tone: "gold" },
  { key: "NOT_COMPATIBLE", label: "Not Compatible", statuses: NOT_COMPATIBLE_STATUSES, icon: XCircle, tone: "red" },
  { key: "ALL", label: "All Tickets", statuses: ALL_STATUSES, icon: Layers, tone: "navy" },
];

const DEFAULT_FILTER = "NEEDS_REVIEW";

const STATUS_STYLE = {
  ASSESSMENT_SUBMITTED: { tone: "amber", icon: ClipboardCheck, label: "Assessment Submitted" },
  STAFF_REVIEW: { tone: "blue", icon: Eye, label: "Staff Review" },
  ADMIN_REVIEW: { tone: "indigo", icon: ShieldCheck, label: "Admin Review" },
  APPROVED: { tone: "green", icon: CheckCircle2, label: "Approved" },
  COMPLETED: { tone: "green", icon: CheckCircle2, label: "Completed" },
  NC_CANNOT_PROCEED: { tone: "red", icon: XCircle, label: "Not Compatible" },
  NC_CAN_REAPPLY: { tone: "red", icon: XCircle, label: "Not Compatible" },
};

const AVATAR_TONES = ["navy", "blue", "violet", "green", "amber", "rose"];

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

// "Today", "1 day ago", "5 days ago"
function daysAgo(value) {
  if (!value) return null;
  const start = new Date(value);
  start.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.max(0, Math.round((today - start) / 86400000));
  return { days, text: days === 0 ? "Today" : `${days} day${days === 1 ? "" : "s"} ago` };
}

function getInitials(name) {
  const parts = (name || "?").trim().split(/\s+/);
  const first = parts[0]?.[0] || "?";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : parts[0]?.[1] || "";
  return (first + last).toUpperCase();
}

function isLowPrice(amount) {
  const value = Number(amount);
  return !Number.isNaN(value) && value > 0 && value < LOW_PRICE_WARNING;
}

function isReturnedByAdmin(ticket) {
  return ticket.status === "STAFF_REVIEW" && Boolean(ticket.admin_revision_notes);
}

// What Staff should do next - covers both the assessment and the quotation.
// kind: "urgent" = returned by Admin, "action" = needs Staff,
// "wait" / "done" = nothing to do, "muted" = missing info.
function getNextStep(ticket, updated) {
  if (isReturnedByAdmin(ticket)) {
    return { text: "Fix and resend", kind: "urgent", icon: Undo2 };
  }
  switch (ticket.status) {
    case "ASSESSMENT_SUBMITTED":
      return { text: "Review assessment", kind: "action", icon: ClipboardCheck };
    case "STAFF_REVIEW":
      return updated
        ? { text: "Send to Admin", kind: "action", icon: ShieldCheck }
        : { text: "Send updated quotation", kind: "action", icon: FilePen };
    case "ADMIN_REVIEW":
      return { text: "Waiting for Admin", kind: "wait", icon: Clock };
    case "APPROVED":
    case "COMPLETED":
      return ticket.final_sheet
        ? { text: "Price is final", kind: "done", icon: FileCheck }
        : { text: "No final sheet", kind: "muted", icon: FileX };
    case "NC_CANNOT_PROCEED":
    case "NC_CAN_REAPPLY":
      return { text: "Not compatible", kind: "muted", icon: XCircle };
    default:
      return { text: "—", kind: "muted", icon: Eye };
  }
}

function LowPriceTag() {
  return (
    <span className="stfqm-low-price" title={`Under ${formatCurrency(LOW_PRICE_WARNING)} - please double-check`}>
      <AlertTriangle size={11} />
      Check
    </span>
  );
}

// Initial price on top, latest (or final) price below it
function PriceCell({ initial, latestAmount, isFinal }) {
  if (!initial && !latestAmount) {
    return <span className="stfqm-muted">No prices yet</span>;
  }

  return (
    <div className="stfqm-prices">
      <div className="stfqm-price-line">
        <span className="stfqm-price-label">Initial</span>
        {initial ? (
          <>
            <span className="stfqm-price-old">{formatCurrency(initial.estimated_cost)}</span>
            {isLowPrice(initial.estimated_cost) && <LowPriceTag />}
          </>
        ) : (
          <span className="stfqm-muted">—</span>
        )}
      </div>
      <div className="stfqm-price-line">
        <span className="stfqm-price-label">{isFinal ? "Final" : "Latest"}</span>
        {latestAmount ? (
          <>
            <span className={`stfqm-price-new ${isFinal ? "final" : ""}`}>{formatCurrency(latestAmount)}</span>
            {isLowPrice(latestAmount) && <LowPriceTag />}
          </>
        ) : (
          <span className="stfqm-muted">Not updated yet</span>
        )}
      </div>
    </div>
  );
}

function ListHead() {
  return (
    <div className="stfar-row stfrv-row stfar-head" role="row">
      <span>Ticket #</span>
      <span>Customer</span>
      <span className="stfar-hide-sm">Submitted</span>
      <span>Status</span>
      <span className="stfar-hide-md">Price</span>
      <span className="stfar-hide-md stfar-right">Next Step</span>
    </div>
  );
}

function RowSkeleton() {
  return (
    <div className="stfar-row stfrv-row stfar-row-skeleton">
      <span className="stfar-skel stfar-skel-sm" />
      <span className="stfar-skel-customer">
        <span className="stfar-skel stfar-skel-avatar" />
        <span className="stfar-skel-stack">
          <span className="stfar-skel stfar-skel-md" />
          <span className="stfar-skel stfar-skel-xs" />
        </span>
      </span>
      <span className="stfar-hide-sm stfar-skel-stack">
        <span className="stfar-skel stfar-skel-sm" />
        <span className="stfar-skel stfar-skel-xs" />
      </span>
      <span>
        <span className="stfar-skel stfar-skel-pill" />
      </span>
      <span className="stfar-hide-md stfar-skel-stack">
        <span className="stfar-skel stfar-skel-md" />
        <span className="stfar-skel stfar-skel-md" />
      </span>
      <span className="stfar-hide-md stfar-right">
        <span className="stfar-skel stfar-skel-btn" />
      </span>
    </div>
  );
}

function TicketRow({ ticket: t, onOpen }) {
  const displayName = t.full_name || t.customer_username;
  const style = STATUS_STYLE[t.status] || { tone: "blue", icon: Eye, label: t.status };
  const StatusIcon = style.icon;
  const submittedAt = t.assessment?.submitted_at;
  const waiting = daysAgo(submittedAt);
  const stillWaiting = NEEDS_REVIEW_STATUSES.includes(t.status);
  const oldWait = stillWaiting && waiting && waiting.days >= OLD_WAIT_DAYS;
  const returned = isReturnedByAdmin(t);

  const initial = t.quotations?.find((q) => q.quotation_type === "INITIAL");
  const updated = [...(t.quotations || [])]
    .filter((q) => q.quotation_type === "UPDATED")
    .sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at))[0];
  // Latest price: the newest Updated Quotation, or the Final Sheet's approved price
  const finalCost = t.final_sheet?.final_cost;
  const latestAmount = finalCost || updated?.estimated_cost;

  const nextStep = getNextStep(t, updated);
  const NextIcon = nextStep.icon;
  const avatarTone = AVATAR_TONES[Number(t.id || 0) % AVATAR_TONES.length];

  return (
    <div
      className={`stfar-row stfrv-row stfar-item ${returned ? "returned" : ""} ${
        nextStep.kind === "action" ? "needs-action" : ""
      }`}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(t.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(t.id);
        }
      }}
    >
      <span className="stfar-ticket">{t.ticket_number}</span>

      <span className="stfar-customer">
        <span className={`stfar-avatar tone-${avatarTone}`}>{getInitials(displayName)}</span>
        <span className="stfar-customer-text">
          <span className="stfar-customer-name">{displayName}</span>
          {t.solar_package && <span className="stfar-package">{t.solar_package}</span>}
          {t.partner_installer_username && (
            <span className="stfrv-installer">
              <HardHat size={12} />
              {t.partner_installer_username}
            </span>
          )}
          {/* Next step shows here on smaller screens */}
          <span className={`stfar-next-inline ${nextStep.kind}`}>
            <NextIcon size={12} />
            {nextStep.text}
          </span>
        </span>
      </span>

      <span className="stfar-hide-sm stfar-submitted">
        <span className="stfar-date">{formatDate(submittedAt)}</span>
        {waiting && stillWaiting && (
          <span className={`stfar-wait ${oldWait ? "old" : ""}`}>
            {oldWait ? <AlertTriangle size={11} /> : <Clock size={11} />}
            {waiting.text}
          </span>
        )}
      </span>

      <span className="stfar-status-cell">
        <span className={`stfar-status tone-${style.tone}`}>
          <StatusIcon size={13} />
          {t.status_display || style.label}
        </span>
        {returned && (
          <span className="stfar-returned-tag">
            <Undo2 size={11} />
            Returned by Admin
          </span>
        )}
      </span>

      <span className="stfar-hide-md">
        <PriceCell initial={initial} latestAmount={latestAmount} isFinal={Boolean(finalCost)} />
      </span>

      <span className="stfar-hide-md stfar-right">
        <span className={`stfar-next ${nextStep.kind}`}>
          <NextIcon size={14} />
          {nextStep.text}
          {(nextStep.kind === "action" || nextStep.kind === "urgent") && (
            <ArrowRight size={14} className="stfar-next-arrow" />
          )}
        </span>
      </span>
    </div>
  );
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

// One list for the roof assessment and the quotation of every ticket.
export default function StaffReviewHubPage() {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState([]);
  const [count, setCount] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrevious, setHasPrevious] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeFilter, setActiveFilter] = useState(DEFAULT_FILTER);
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCounts, setFilterCounts] = useState({});
  const [reloadKey, setReloadKey] = useState(0);

  const currentFilter = FILTERS.find((f) => f.key === activeFilter) || FILTERS[0];

  // Wait a moment after typing before searching
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchTerm(searchInput.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Load the current page
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const data = await getStaffTicketsPage(page, currentFilter.statuses.join(","), searchTerm || null);
        if (cancelled) return;
        setTickets(data.results);
        setCount(data.count);
        setHasNext(Boolean(data.next));
        setHasPrevious(Boolean(data.previous));
        setError("");
      } catch {
        if (!cancelled) setError("Could not load tickets. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, activeFilter, searchTerm, reloadKey]);

  // Counts for the Filter list - when the page opens and on Refresh
  useEffect(() => {
    let cancelled = false;

    async function loadCounts() {
      const results = await Promise.allSettled(
        FILTERS.map((f) => getStaffTicketsPage(1, f.statuses.join(",")))
      );
      if (cancelled) return;
      const next = {};
      results.forEach((r, i) => {
        if (r.status === "fulfilled") next[FILTERS[i].key] = r.value.count;
      });
      setFilterCounts(next);
    }

    loadCounts();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  function changeFilter(key) {
    setActiveFilter(key);
    setPage(1);
  }

  function clearAll() {
    setSearchInput("");
    changeFilter(DEFAULT_FILTER);
  }

  function goToTicket(id) {
    navigate(`/staff/assessment-review/${id}`);
  }

  function refresh() {
    setError("");
    setReloadKey((k) => k + 1);
  }

  function goToPage(p) {
    setPage(p);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const hasActiveFilters = activeFilter !== DEFAULT_FILTER || Boolean(searchTerm);
  const allCaughtUp = activeFilter === "NEEDS_REVIEW" && !searchTerm;
  const needsCount = filterCounts.NEEDS_REVIEW;

  return (
    <StaffLayout
      pageTitle="Assessment & Quotation"
      pageSubtitle="Review roof assessments, send updated quotations and forward them to the Admin"
    >
      <div className="stfar-page">
        {/* ---------- Banner ---------- */}
        <section className="stfar-hero">
          <div className="stfar-hero-glow" aria-hidden="true" />
          <div className="stfar-hero-icon">
            <ClipboardList size={26} />
          </div>
          <div className="stfar-hero-text">
            <h1>Assessments &amp; Quotations</h1>
            <p>
              {needsCount === undefined
                ? "Check each roof assessment, send an updated quotation, and forward it to the Admin."
                : needsCount === 0
                ? "You're all caught up. Nothing is waiting for your review."
                : `${needsCount} ticket${needsCount === 1 ? " is" : "s are"} waiting for your review and updated quotation.`}
            </p>
          </div>
          <div className="stfar-hero-actions">
            {needsCount > 0 && activeFilter !== "NEEDS_REVIEW" && (
              <button type="button" className="stfar-hero-btn gold" onClick={() => changeFilter("NEEDS_REVIEW")}>
                <ClipboardCheck size={16} />
                Show these
              </button>
            )}
            <button type="button" className="stfar-hero-btn glass" onClick={refresh} disabled={loading}>
              <RefreshCw size={16} className={loading ? "spin" : ""} />
              Refresh
            </button>
          </div>
        </section>

        {/* ---------- Ticket list ---------- */}
        <section className="stfar-card">
          <div className="stfar-card-head">
            <div className="stfar-card-title">
              <h2>
                <ClipboardList size={18} />
                Ticket List
              </h2>
              <p>Click any row to open the assessment and send an updated quotation.</p>
            </div>

            <div className="stfar-tools">
              <div className="stfar-search">
                <Search size={17} className="stfar-search-icon" />
                <input
                  type="text"
                  placeholder="Search customer or ticket #"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                />
                {searchInput && (
                  <button
                    type="button"
                    className="stfar-search-clear"
                    onClick={() => setSearchInput("")}
                    aria-label="Clear search"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              <FilterMenu
                options={FILTERS}
                activeKey={activeFilter}
                counts={filterCounts}
                onPick={changeFilter}
                alertKey="NEEDS_REVIEW"
                ariaLabel="Choose what to show"
              />
            </div>
          </div>

          {error ? (
            <div className="stfar-empty">
              <span className="stfar-empty-badge red">
                <AlertCircle size={26} />
              </span>
              <p className="stfar-empty-title">Something went wrong</p>
              <p className="stfar-empty-hint">{error}</p>
              <button type="button" className="stfar-btn-primary" onClick={refresh}>
                <RefreshCw size={15} />
                Try again
              </button>
            </div>
          ) : loading ? (
            <div className="stfar-list" role="table">
              <ListHead />
              {Array.from({ length: 5 }).map((_, i) => (
                <RowSkeleton key={i} />
              ))}
            </div>
          ) : tickets.length === 0 ? (
            allCaughtUp ? (
              <div className="stfar-empty">
                <span className="stfar-empty-badge green">
                  <PartyPopper size={26} />
                </span>
                <p className="stfar-empty-title">All caught up!</p>
                <p className="stfar-empty-hint">No ticket is waiting for review right now.</p>
                <button type="button" className="stfar-btn-secondary" onClick={() => changeFilter("ALL")}>
                  See all tickets
                </button>
              </div>
            ) : (
              <div className="stfar-empty">
                <span className="stfar-empty-badge">
                  <SearchX size={26} />
                </span>
                <p className="stfar-empty-title">
                  {searchTerm ? "No tickets match your search" : "No tickets in this view"}
                </p>
                <p className="stfar-empty-hint">
                  {searchTerm ? "Try a different name or ticket number." : "Try another filter."}
                </p>
                {hasActiveFilters && (
                  <button type="button" className="stfar-btn-secondary" onClick={clearAll}>
                    Back to Needs Review
                  </button>
                )}
              </div>
            )
          ) : (
            <>
              <div className="stfar-list" role="table">
                <ListHead />
                {tickets.map((t) => (
                  <TicketRow key={t.id} ticket={t} onOpen={goToTicket} />
                ))}
              </div>

              {totalPages > 1 && (
                <div className="stfar-pagination">
                  <div className="stfar-pagination-controls">
                    <button
                      type="button"
                      className="stfar-page-btn"
                      disabled={!hasPrevious}
                      onClick={() => goToPage(page - 1)}
                      aria-label="Previous page"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    {getPageNumbers(page, totalPages).map((p, i) =>
                      p === "..." ? (
                        <span key={`gap-${i}`} className="stfar-page-gap">…</span>
                      ) : (
                        <button
                          key={p}
                          type="button"
                          className={`stfar-page-num ${p === page ? "active" : ""}`}
                          onClick={() => goToPage(p)}
                        >
                          {p}
                        </button>
                      )
                    )}
                    <button
                      type="button"
                      className="stfar-page-btn"
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

        <p className="stfar-footnote">
          <AlertTriangle size={13} />
          Waiting {OLD_WAIT_DAYS} days or more is marked in orange. Prices under {formatCurrency(LOW_PRICE_WARNING)} get
          a "Check" tag, in case of a typo.
        </p>
      </div>
    </StaffLayout>
  );
}