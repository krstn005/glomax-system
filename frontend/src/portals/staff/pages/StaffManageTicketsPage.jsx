import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  X,
  Clock,
  HardHat,
  ClipboardCheck,
  Eye,
  ShieldCheck,
  Layers,
  Inbox,
  AlertCircle,
  CalendarClock,
  CalendarDays,
  ChevronRight,
  ChevronLeft,
  ArrowRight,
  RefreshCw,
  Ticket,
  UserPlus,
} from "lucide-react";
import StaffLayout from "../components/StaffLayout";
import FilterMenu from "../../../components/FilterMenu";
import { getStaffTicketsPage } from "../../../api/staffTickets";
import "../styles/staff-manage-tickets.css";

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 400;

const ALL_ACTIVE_STATUSES = [
  "REQUEST_SUBMITTED",
  "PI_ASSIGNED",
  "ASSESSMENT_SUBMITTED",
  "STAFF_REVIEW",
  "ADMIN_REVIEW",
];

// Filter options - shown in the Filter drop-down button
const STATUS_FILTERS = [
  { key: "ALL", label: "All Active", statuses: null, icon: Layers, tone: "navy" },
  { key: "REQUEST_SUBMITTED", label: "New Requests", statuses: ["REQUEST_SUBMITTED"], icon: Clock, tone: "gold" },
  { key: "PI_ASSIGNED", label: "Assigned", statuses: ["PI_ASSIGNED"], icon: HardHat, tone: "blue" },
  { key: "ASSESSMENT_SUBMITTED", label: "Assessment In", statuses: ["ASSESSMENT_SUBMITTED"], icon: ClipboardCheck, tone: "blue" },
  { key: "STAFF_REVIEW", label: "Staff Review", statuses: ["STAFF_REVIEW"], icon: Eye, tone: "green" },
  { key: "ADMIN_REVIEW", label: "Admin Review", statuses: ["ADMIN_REVIEW"], icon: ShieldCheck, tone: "blue" },
];

// Badge look for each status
const STATUS_STYLE = {
  REQUEST_SUBMITTED: { tone: "amber", icon: Clock },
  PI_ASSIGNED: { tone: "blue", icon: HardHat },
  ASSESSMENT_SUBMITTED: { tone: "indigo", icon: ClipboardCheck },
  STAFF_REVIEW: { tone: "green", icon: Eye },
  ADMIN_REVIEW: { tone: "violet", icon: ShieldCheck },
};

const AVATAR_TONES = ["navy", "blue", "violet", "green", "amber", "rose"];

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

// "Today", "1 day ago", "5 days ago"
function daysAgo(value) {
  if (!value) return "";
  const start = new Date(value);
  start.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.max(0, Math.round((today - start) / 86400000));
  return days === 0 ? "Today" : `${days} day${days === 1 ? "" : "s"} ago`;
}

function getInitials(name) {
  const parts = (name || "?").trim().split(/\s+/);
  const first = parts[0]?.[0] || "?";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : parts[0]?.[1] || "";
  return (first + last).toUpperCase();
}

function hasPendingReschedule(ticket) {
  return (ticket.reschedule_requests || []).some((r) => r.status === "PENDING");
}

// What Staff should do next with this ticket.
// kind: "urgent" = reschedule request, "action" = Staff need to act, "wait" = waiting on someone else.
function getNextStep(ticket) {
  if (hasPendingReschedule(ticket)) {
    return { text: "Review reschedule", kind: "urgent", icon: CalendarClock };
  }
  switch (ticket.status) {
    case "REQUEST_SUBMITTED":
      return { text: "Assign installer", kind: "action", icon: UserPlus };
    case "PI_ASSIGNED":
      return ticket.visit_date
        ? { text: `Visit on ${formatDate(ticket.visit_date)}`, kind: "wait", icon: CalendarDays }
        : { text: "Waiting for site visit", kind: "wait", icon: Clock };
    case "ASSESSMENT_SUBMITTED":
    case "STAFF_REVIEW":
      return { text: "Review assessment", kind: "action", icon: ClipboardCheck };
    case "ADMIN_REVIEW":
      return { text: "Waiting for Admin", kind: "wait", icon: Clock };
    default:
      return { text: "—", kind: "muted", icon: Clock };
  }
}

function ListHead() {
  return (
    <div className="stftp-row stftp-head" role="row">
      <span>Ticket #</span>
      <span>Customer</span>
      <span className="stftp-hide-md">Partner Installer</span>
      <span className="stftp-hide-sm">Submitted</span>
      <span>Status</span>
      <span className="stftp-hide-md stftp-right">Next Step</span>
    </div>
  );
}

function RowSkeleton() {
  return (
    <div className="stftp-row stftp-row-skeleton">
      <span className="stftp-skel stftp-skel-sm" />
      <span className="stftp-skel-customer">
        <span className="stftp-skel stftp-skel-avatar" />
        <span className="stftp-skel-stack">
          <span className="stftp-skel stftp-skel-md" />
          <span className="stftp-skel stftp-skel-xs" />
        </span>
      </span>
      <span className="stftp-hide-md">
        <span className="stftp-skel stftp-skel-sm" />
      </span>
      <span className="stftp-hide-sm stftp-skel-stack">
        <span className="stftp-skel stftp-skel-sm" />
        <span className="stftp-skel stftp-skel-xs" />
      </span>
      <span>
        <span className="stftp-skel stftp-skel-pill" />
      </span>
      <span className="stftp-hide-md stftp-right">
        <span className="stftp-skel stftp-skel-btn" />
      </span>
    </div>
  );
}

function TicketRow({ ticket: t, onOpen }) {
  const displayName = t.full_name || t.customer_username;
  const style = STATUS_STYLE[t.status] || { tone: "blue", icon: Clock };
  const StatusIcon = style.icon;
  const nextStep = getNextStep(t);
  const NextIcon = nextStep.icon;
  const reschedule = hasPendingReschedule(t);
  const avatarTone = AVATAR_TONES[Number(t.id || 0) % AVATAR_TONES.length];

  return (
    <div
      className={`stftp-row stftp-item ${reschedule ? "reschedule" : ""} ${nextStep.kind === "action" ? "needs-action" : ""}`}
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
      <span className="stftp-ticket">{t.ticket_number}</span>

      <span className="stftp-customer">
        <span className={`stftp-avatar tone-${avatarTone}`}>{getInitials(displayName)}</span>
        <span className="stftp-customer-text">
          <span className="stftp-customer-name">{displayName}</span>
          {t.solar_package && <span className="stftp-package">{t.solar_package}</span>}
          {/* Next step shows here on smaller screens */}
          <span className={`stftp-next-inline ${nextStep.kind}`}>
            <NextIcon size={12} />
            {nextStep.text}
          </span>
        </span>
      </span>

      <span className="stftp-hide-md">
        {t.partner_installer_username ? (
          <span className="stftp-installer">
            <span className="stftp-installer-icon">
              <HardHat size={14} />
            </span>
            <span className="stftp-installer-name">{t.partner_installer_username}</span>
          </span>
        ) : (
          <span className="stftp-muted">Not assigned</span>
        )}
      </span>

      <span className="stftp-hide-sm stftp-submitted">
        <span className="stftp-date">{formatDate(t.created_at)}</span>
        <span className="stftp-time">{daysAgo(t.created_at)}</span>
      </span>

      <span className="stftp-status-cell">
        <span className={`stftp-status tone-${style.tone}`}>
          <StatusIcon size={13} />
          {t.status_display}
        </span>
        {reschedule && (
          <span className="stftp-reschedule-tag">
            <CalendarClock size={11} />
            Reschedule request
          </span>
        )}
      </span>

      <span className="stftp-hide-md stftp-right">
        <span className={`stftp-next ${nextStep.kind}`}>
          <NextIcon size={14} />
          {nextStep.text}
          {(nextStep.kind === "action" || nextStep.kind === "urgent") && (
            <ArrowRight size={14} className="stftp-next-arrow" />
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

export default function StaffManageTicketsPage() {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState([]);
  const [count, setCount] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrevious, setHasPrevious] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCounts, setFilterCounts] = useState({});
  const [reloadKey, setReloadKey] = useState(0);

  const currentFilter = STATUS_FILTERS.find((f) => f.key === statusFilter) || STATUS_FILTERS[0];

  // Wait a moment after typing before searching
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchTerm(searchInput.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Load the current page of tickets
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const statuses = currentFilter.statuses || ALL_ACTIVE_STATUSES;
        const data = await getStaffTicketsPage(page, statuses.join(","), searchTerm || null);
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
  }, [page, statusFilter, searchTerm, reloadKey]);

  // Counts for the Filter list - when the page opens and on Refresh
  useEffect(() => {
    let cancelled = false;

    async function loadCounts() {
      try {
        const results = await Promise.all(
          STATUS_FILTERS.map(async (f) => {
            const statuses = f.statuses || ALL_ACTIVE_STATUSES;
            const data = await getStaffTicketsPage(1, statuses.join(","));
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
    setSearchInput("");
    changeFilter("ALL");
  }

  function goToTicket(id) {
    navigate(`/staff/manage-tickets/${id}`);
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
  const hasActiveFilters = statusFilter !== "ALL" || Boolean(searchTerm);
  const newCount = filterCounts.REQUEST_SUBMITTED;

  return (
    <StaffLayout pageTitle="Ticket Tracking" pageSubtitle="Monitor ticket status and assign Partner Installers">
      <div className="stftp-page">
        {/* ---------- Banner ---------- */}
        <section className="stftp-hero">
          <div className="stftp-hero-glow" aria-hidden="true" />
          <div className="stftp-hero-icon">
            <Ticket size={26} />
          </div>
          <div className="stftp-hero-text">
            <h1>Active Tickets</h1>
            <p>
              {newCount === undefined
                ? "Follow every open ticket, from new request to Admin review."
                : newCount === 0
                ? "No new requests right now. Every ticket has an installer."
                : `${newCount} new request${newCount === 1 ? " needs" : "s need"} a Partner Installer.`}
            </p>
          </div>
          <div className="stftp-hero-actions">
            {newCount > 0 && statusFilter !== "REQUEST_SUBMITTED" && (
              <button type="button" className="stftp-hero-btn gold" onClick={() => changeFilter("REQUEST_SUBMITTED")}>
                <UserPlus size={16} />
                Assign installers
              </button>
            )}
            <button type="button" className="stftp-hero-btn glass" onClick={refresh} disabled={loading}>
              <RefreshCw size={16} className={loading ? "spin" : ""} />
              Refresh
            </button>
          </div>
        </section>

        {/* ---------- Ticket list ---------- */}
        <section className="stftp-card">
          <div className="stftp-card-head">
            <div className="stftp-card-title">
              <h2>
                <Ticket size={18} />
                Ticket List
              </h2>
              <p>Click any row to open the ticket, assign an installer, or review a reschedule.</p>
            </div>

            <div className="stftp-tools">
              <div className="stftp-search">
                <Search size={17} className="stftp-search-icon" />
                <input
                  type="text"
                  placeholder="Search customer or ticket #"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                />
                {searchInput && (
                  <button
                    type="button"
                    className="stftp-search-clear"
                    onClick={() => setSearchInput("")}
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
                alertKey="REQUEST_SUBMITTED"
                ariaLabel="Filter by status"
              />
            </div>
          </div>

          {error ? (
            <div className="stftp-empty">
              <span className="stftp-empty-badge red">
                <AlertCircle size={26} />
              </span>
              <p className="stftp-empty-title">Something went wrong</p>
              <p className="stftp-empty-hint">{error}</p>
              <button type="button" className="stftp-btn-primary" onClick={refresh}>
                <RefreshCw size={15} />
                Try again
              </button>
            </div>
          ) : loading ? (
            <div className="stftp-list" role="table">
              <ListHead />
              {Array.from({ length: 5 }).map((_, i) => (
                <RowSkeleton key={i} />
              ))}
            </div>
          ) : tickets.length === 0 ? (
            <div className="stftp-empty">
              <span className="stftp-empty-badge">
                <Inbox size={26} />
              </span>
              <p className="stftp-empty-title">
                {searchTerm ? "No tickets match your search" : "No tickets in this view"}
              </p>
              <p className="stftp-empty-hint">
                {searchTerm ? "Try a different name or ticket number." : "Try another filter."}
              </p>
              {hasActiveFilters && (
                <button type="button" className="stftp-btn-secondary" onClick={clearAll}>
                  Show all active tickets
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="stftp-list" role="table">
                <ListHead />
                {tickets.map((t) => (
                  <TicketRow key={t.id} ticket={t} onOpen={goToTicket} />
                ))}
              </div>

              {totalPages > 1 && (
                <div className="stftp-pagination">
                    <div className="stftp-pagination-controls">
                      <button
                        type="button"
                        className="stftp-page-btn"
                        disabled={!hasPrevious}
                        onClick={() => goToPage(page - 1)}
                        aria-label="Previous page"
                      >
                        <ChevronLeft size={16} />
                      </button>
                      {getPageNumbers(page, totalPages).map((p, i) =>
                        p === "..." ? (
                          <span key={`gap-${i}`} className="stftp-page-gap">…</span>
                        ) : (
                          <button
                            key={p}
                            type="button"
                            className={`stftp-page-num ${p === page ? "active" : ""}`}
                            onClick={() => goToPage(p)}
                          >
                            {p}
                          </button>
                        )
                      )}
                      <button
                        type="button"
                        className="stftp-page-btn"
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

        <p className="stftp-footnote">
          <CalendarClock size={13} />
          Tickets with a reschedule request are marked in orange so you can answer them quickly.
        </p>
      </div>
    </StaffLayout>
  );
}
