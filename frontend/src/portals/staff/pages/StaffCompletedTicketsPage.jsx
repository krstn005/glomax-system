import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  X,
  Inbox,
  Layers,
  CheckCircle2,
  Award,
  XCircle,
  Ban,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  ArrowRight,
  RefreshCw,
  Archive,
  HardHat,
  CalendarCheck,
} from "lucide-react";
import StaffLayout from "../components/StaffLayout";
import FilterMenu from "../../../components/FilterMenu";
import { getStaffTicketsPage } from "../../../api/staffTickets";
import "../styles/staff-completed-tickets.css";

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 400;

const ALL_STATUSES = ["APPROVED", "COMPLETED", "NC_CANNOT_PROCEED", "NC_CAN_REAPPLY", "WITHDRAWN"];

// Filter options - shown in the Filter drop-down button
const FILTERS = [
  { key: "ALL", label: "All Tickets", statuses: ALL_STATUSES, icon: Layers, tone: "navy" },
  { key: "APPROVED", label: "Approved", statuses: ["APPROVED"], icon: CheckCircle2, tone: "green" },
  { key: "COMPLETED", label: "Completed", statuses: ["COMPLETED"], icon: Award, tone: "gold" },
  { key: "NOT_COMPATIBLE", label: "Not Compatible", statuses: ["NC_CANNOT_PROCEED", "NC_CAN_REAPPLY"], icon: XCircle, tone: "red" },
  { key: "WITHDRAWN", label: "Withdrawn", statuses: ["WITHDRAWN"], icon: Ban, tone: "gray" },
];

// Badge look for each ticket status
const OUTCOME_BADGE = {
  APPROVED: { tone: "green", icon: CheckCircle2 },
  COMPLETED: { tone: "gold", icon: Award },
  NC_CANNOT_PROCEED: { tone: "red", icon: XCircle },
  NC_CAN_REAPPLY: { tone: "red", icon: XCircle },
  WITHDRAWN: { tone: "gray", icon: Ban },
};

const AVATAR_TONES = ["navy", "blue", "violet", "green", "amber", "rose"];

function formatDateTime(value) {
  if (!value) return { date: "—", time: "" };
  const d = new Date(value);
  return {
    date: d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }),
    time: d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
  };
}

function getInitials(name) {
  const parts = (name || "?").trim().split(/\s+/);
  const first = parts[0]?.[0] || "?";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : parts[0]?.[1] || "";
  return (first + last).toUpperCase();
}

function ListHead() {
  return (
    <div className="stfct-row stfct-head" role="row">
      <span>Ticket #</span>
      <span>Customer</span>
      <span className="stfct-hide-md">Partner Installer</span>
      <span className="stfct-hide-sm">Date Finished</span>
      <span className="stfct-right">Outcome</span>
    </div>
  );
}

function RowSkeleton() {
  return (
    <div className="stfct-row stfct-row-skeleton">
      <span className="stfct-skel stfct-skel-sm" />
      <span className="stfct-skel-customer">
        <span className="stfct-skel stfct-skel-avatar" />
        <span className="stfct-skel-stack">
          <span className="stfct-skel stfct-skel-md" />
          <span className="stfct-skel stfct-skel-xs" />
        </span>
      </span>
      <span className="stfct-hide-md">
        <span className="stfct-skel stfct-skel-sm" />
      </span>
      <span className="stfct-hide-sm stfct-skel-stack">
        <span className="stfct-skel stfct-skel-sm" />
        <span className="stfct-skel stfct-skel-xs" />
      </span>
      <span className="stfct-right">
        <span className="stfct-skel stfct-skel-pill" />
      </span>
    </div>
  );
}

function TicketRow({ ticket: t, onOpen }) {
  const displayName = t.full_name || t.customer_username;
  const finished = formatDateTime(t.completed_at || t.updated_at);
  const badge = OUTCOME_BADGE[t.status] || OUTCOME_BADGE.APPROVED;
  const BadgeIcon = badge.icon;
  const avatarTone = AVATAR_TONES[Number(t.id || 0) % AVATAR_TONES.length];

  return (
    <div
      className={`stfct-row stfct-item outcome-${badge.tone}`}
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
      <span className="stfct-ticket">{t.ticket_number}</span>

      <span className="stfct-customer">
        <span className={`stfct-avatar tone-${avatarTone}`}>{getInitials(displayName)}</span>
        <span className="stfct-customer-text">
          <span className="stfct-customer-name">{displayName}</span>
          {t.solar_package && <span className="stfct-package">{t.solar_package}</span>}
          {/* Date shows here on phones */}
          <span className="stfct-date-inline">
            <CalendarCheck size={12} />
            {finished.date}
          </span>
        </span>
      </span>

      <span className="stfct-hide-md">
        {t.partner_installer_username ? (
          <span className="stfct-installer">
            <span className="stfct-installer-icon">
              <HardHat size={14} />
            </span>
            <span className="stfct-installer-name">{t.partner_installer_username}</span>
          </span>
        ) : (
          <span className="stfct-muted">Not assigned</span>
        )}
      </span>

      <span className="stfct-hide-sm stfct-finished">
        <span className="stfct-date">{finished.date}</span>
        <span className="stfct-time">{finished.time}</span>
      </span>

      <span className="stfct-right">
        <span className={`stfct-status tone-${badge.tone}`}>
          <BadgeIcon size={13} />
          {t.status_display}
        </span>
        <ArrowRight size={16} className="stfct-row-arrow" />
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

export default function StaffCompletedTicketsPage() {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState([]);
  const [count, setCount] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrevious, setHasPrevious] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeFilter, setActiveFilter] = useState("ALL");
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

  // Load the current page of tickets
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
      try {
        const results = await Promise.all(
          FILTERS.map(async (f) => {
            const data = await getStaffTicketsPage(1, f.statuses.join(","));
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
    setActiveFilter(key);
    setPage(1);
  }

  function clearAll() {
    setSearchInput("");
    changeFilter("ALL");
  }

  function goToTicket(id) {
    navigate(`/staff/completed-tickets/${id}`);
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
  const hasActiveFilters = activeFilter !== "ALL" || Boolean(searchTerm);
  const totalCount = filterCounts.ALL;
  const completedCount = filterCounts.COMPLETED;

  return (
    <StaffLayout pageTitle="Completed Tickets" pageSubtitle="Record of tickets with no further action needed">
      <div className="stfct-page">
        {/* ---------- Banner ---------- */}
        <section className="stfct-hero">
          <div className="stfct-hero-glow" aria-hidden="true" />
          <div className="stfct-hero-icon">
            <Archive size={26} />
          </div>
          <div className="stfct-hero-text">
            <h1>Ticket Records</h1>
            <p>
              {totalCount === undefined
                ? "Every ticket that no longer needs any action from Staff."
                : `${totalCount} closed ticket${totalCount === 1 ? "" : "s"}${
                    completedCount ? `, ${completedCount} with finished installation${completedCount === 1 ? "" : "s"}` : ""
                  }.`}
            </p>
          </div>
          <div className="stfct-hero-actions">
            <button type="button" className="stfct-hero-btn glass" onClick={refresh} disabled={loading}>
              <RefreshCw size={16} className={loading ? "spin" : ""} />
              Refresh
            </button>
          </div>
        </section>

        {/* ---------- Ticket list ---------- */}
        <section className="stfct-card">
          <div className="stfct-card-head">
            <div className="stfct-card-title">
              <h2>
                <Archive size={18} />
                Ticket List
              </h2>
              <p>Click any row to view the full ticket record.</p>
            </div>

            <div className="stfct-tools">
              <div className="stfct-search">
                <Search size={17} className="stfct-search-icon" />
                <input
                  type="text"
                  placeholder="Search customer or ticket #"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                />
                {searchInput && (
                  <button
                    type="button"
                    className="stfct-search-clear"
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
                ariaLabel="Filter by outcome"
              />
            </div>
          </div>

          {error ? (
            <div className="stfct-empty">
              <span className="stfct-empty-badge red">
                <AlertCircle size={26} />
              </span>
              <p className="stfct-empty-title">Something went wrong</p>
              <p className="stfct-empty-hint">{error}</p>
              <button type="button" className="stfct-btn-primary" onClick={refresh}>
                <RefreshCw size={15} />
                Try again
              </button>
            </div>
          ) : loading ? (
            <div className="stfct-list" role="table">
              <ListHead />
              {Array.from({ length: 5 }).map((_, i) => (
                <RowSkeleton key={i} />
              ))}
            </div>
          ) : tickets.length === 0 ? (
            <div className="stfct-empty">
              <span className="stfct-empty-badge">
                <Inbox size={26} />
              </span>
              <p className="stfct-empty-title">
                {searchTerm ? "No tickets match your search" : "No tickets in this view"}
              </p>
              <p className="stfct-empty-hint">
                {searchTerm ? "Try a different name or ticket number." : "Try another filter."}
              </p>
              {hasActiveFilters && (
                <button type="button" className="stfct-btn-secondary" onClick={clearAll}>
                  Show all tickets
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="stfct-list" role="table">
                <ListHead />
                {tickets.map((t) => (
                  <TicketRow key={t.id} ticket={t} onOpen={goToTicket} />
                ))}
              </div>

              {totalPages > 1 && (
                <div className="stfct-pagination">
                    <div className="stfct-pagination-controls">
                      <button
                        type="button"
                        className="stfct-page-btn"
                        disabled={!hasPrevious}
                        onClick={() => goToPage(page - 1)}
                        aria-label="Previous page"
                      >
                        <ChevronLeft size={16} />
                      </button>
                      {getPageNumbers(page, totalPages).map((p, i) =>
                        p === "..." ? (
                          <span key={`gap-${i}`} className="stfct-page-gap">…</span>
                        ) : (
                          <button
                            key={p}
                            type="button"
                            className={`stfct-page-num ${p === page ? "active" : ""}`}
                            onClick={() => goToPage(p)}
                          >
                            {p}
                          </button>
                        )
                      )}
                      <button
                        type="button"
                        className="stfct-page-btn"
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
      </div>
    </StaffLayout>
  );
}
