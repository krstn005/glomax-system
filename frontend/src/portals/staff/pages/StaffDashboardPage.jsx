import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  SlidersHorizontal,
  ChevronDown,
  ChevronRight,
  UserPlus,
  ClipboardCheck,
  Inbox,
  ArrowRight,
  Check,
  X,
  AlertCircle,
  CalendarDays,
  Clock,
  PartyPopper,
  Sun,
  Moon,
  Sunrise,
} from "lucide-react";
import StaffLayout from "../components/StaffLayout";
import { getStaffTickets } from "../../../api/staffTickets";
import "../styles/staff-dashboard.css";

const RETURNED_FOR_REVISION_STATUS = "STAFF_REVIEW";

// Finished tickets - everything else counts as "active"
const TERMINAL_STATUSES = ["WITHDRAWN", "APPROVED", "COMPLETED", "NC_CANNOT_PROCEED", "NC_CAN_REAPPLY"];

// Same colors as the rest of the system
const STATUS_BADGE_CLASS = {
  APPROVED: "approved",
  COMPLETED: "completed",
  WITHDRAWN: "withdrawn",
  NC_CANNOT_PROCEED: "not-compatible",
  NC_CAN_REAPPLY: "not-compatible",
  REQUEST_SUBMITTED: "pending",
  PI_ASSIGNED: "in-progress",
  ASSESSMENT_SUBMITTED: "review",
  STAFF_REVIEW: "review",
  ADMIN_REVIEW: "admin",
};

// Filter options (these replace the old count cards at the top)
const FILTER_OPTIONS = [
  { key: "ALL", label: "All", tone: "navy", match: () => true },
  { key: "ACTIVE", label: "Active Tickets", tone: "navy", match: (s) => !TERMINAL_STATUSES.includes(s) },
  { key: "NEW", label: "Pending Assignment", tone: "amber", match: (s) => s === "REQUEST_SUBMITTED" },
  { key: "VISIT", label: "Site Visit", tone: "blue", match: (s) => s === "PI_ASSIGNED" },
  { key: "REVIEW", label: "Awaiting Review", tone: "violet", match: (s) => s === "ASSESSMENT_SUBMITTED" || s === "STAFF_REVIEW" },
  { key: "ADMIN", label: "Awaiting Admin", tone: "indigo", match: (s) => s === "ADMIN_REVIEW" },
  { key: "APPROVED", label: "Approved", tone: "green-light", match: (s) => s === "APPROVED" },
  { key: "COMPLETED", label: "Completed", tone: "green", match: (s) => s === "COMPLETED" },
  { key: "NOT_COMPATIBLE", label: "Not Compatible", tone: "red", match: (s) => s === "NC_CANNOT_PROCEED" || s === "NC_CAN_REAPPLY" },
  { key: "WITHDRAWN", label: "Withdrawn", tone: "gray", match: (s) => s === "WITHDRAWN" },
];

const POLL_INTERVAL_MS = 15000;

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
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
  if (days < 7) return `${days} day${days > 1 ? "s" : ""} ago`;
  return formatDate(value);
}

function daysWaiting(value) {
  if (!value) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86400000));
}

function daysUntil(value) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  return Math.round((d - today) / 86400000);
}

function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length > 1) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return { text: "Good morning", icon: Sunrise };
  if (h < 18) return { text: "Good afternoon", icon: Sun };
  return { text: "Good evening", icon: Moon };
}

function customerName(t) {
  return t.full_name || t.customer_username || "Customer";
}

/* ------------------------------------------------------------------ */

function RecentRowSkeleton() {
  return (
    <div className="stfdb-row stfdb-row-skeleton">
      <span className="stfdb-skel-customer">
        <span className="stfdb-skel stfdb-skel-avatar" />
        <span className="stfdb-skel-stack">
          <span className="stfdb-skel stfdb-skel-w-md" />
          <span className="stfdb-skel stfdb-skel-w-sm" />
        </span>
      </span>
      <span className="stfdb-skel stfdb-skel-w-sm" />
      <span className="stfdb-skel stfdb-skel-w-sm" />
      <span className="stfdb-skel stfdb-skel-pill" />
    </div>
  );
}

// Filter button with a gold indicator and count when a filter is on
function FilterDropdown({ value, counts, onChange }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    function handleKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, []);

  const current = FILTER_OPTIONS.find((o) => o.key === value) || FILTER_OPTIONS[0];
  const isFiltered = value !== "ALL";

  function pick(key) {
    onChange(key);
    setOpen(false);
  }

  return (
    <div className="stfdb-filter" ref={wrapRef}>
      <button
        type="button"
        className={`stfdb-filter-btn ${open ? "open" : ""} ${isFiltered ? "filtered" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <SlidersHorizontal size={15} />
        <span>{current.label}</span>
        {isFiltered && <span className="stfdb-filter-indicator">{counts[value]}</span>}
        <ChevronDown size={15} className="stfdb-filter-chevron" />
      </button>

      {open && (
        <div className="stfdb-filter-menu" role="listbox">
          <p className="stfdb-filter-menu-title">Filter by status</p>
          <div className="stfdb-filter-list">
            {FILTER_OPTIONS.map((o) => {
              const selected = o.key === value;
              return (
                <button
                  key={o.key}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={`stfdb-filter-option ${selected ? "selected" : ""}`}
                  onClick={() => pick(o.key)}
                >
                  <span className={`stfdb-dot tone-${o.tone}`} />
                  <span className="stfdb-filter-option-label">{o.label}</span>
                  <span className="stfdb-filter-option-count">{counts[o.key]}</span>
                  <span className="stfdb-filter-check">{selected && <Check size={15} />}</span>
                </button>
              );
            })}
          </div>
          {isFiltered && (
            <button type="button" className="stfdb-filter-reset" onClick={() => pick("ALL")}>
              <X size={14} />
              Clear filter
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

export default function StaffDashboardPage() {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterKey, setFilterKey] = useState("ALL");
  const [reloadKey, setReloadKey] = useState(0);
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load(isInitial) {
      try {
        if (isInitial) setLoading(true);
        const data = await getStaffTickets();
        if (cancelled) return;
        setTickets(data);
        setLastUpdated(new Date());
        if (isInitial) setError("");
      } catch {
        if (isInitial && !cancelled) setError("Could not load tickets. Please try again.");
      } finally {
        if (isInitial && !cancelled) setLoading(false);
      }
    }

    load(true);
    const interval = setInterval(() => load(false), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [reloadKey]);

  const pendingAssignment = tickets.filter((t) => t.status === "REQUEST_SUBMITTED").length;
  const awaitingReview = tickets.filter(
    (t) => t.status === "ASSESSMENT_SUBMITTED" || t.status === "STAFF_REVIEW"
  ).length;

  const returnedForRevision = tickets.filter(
    (t) => t.status === RETURNED_FOR_REVISION_STATUS && t.admin_revision_notes
  );

  function handleViewRevisions() {
    if (returnedForRevision.length === 1) {
      navigate(`/staff/manage-tickets/${returnedForRevision[0].id}`);
    } else {
      navigate("/staff/assessment-review");
    }
  }

  const filterCounts = Object.fromEntries(
    FILTER_OPTIONS.map((o) => [o.key, tickets.filter((t) => o.match(t.status)).length])
  );
  const currentFilter = FILTER_OPTIONS.find((o) => o.key === filterKey) || FILTER_OPTIONS[0];

  const recentActivity = [...tickets]
    .filter((t) => currentFilter.match(t.status))
    .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
    .slice(0, 8);

  // Things Staff should act on: new requests (oldest first), then assessments to review
  const needsAction = [
    ...tickets
      .filter((t) => t.status === "REQUEST_SUBMITTED")
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      .map((t) => ({ ticket: t, kind: "assign" })),
    ...tickets
      .filter((t) => t.status === "ASSESSMENT_SUBMITTED" || t.status === "STAFF_REVIEW")
      .sort((a, b) => new Date(a.updated_at) - new Date(b.updated_at))
      .map((t) => ({ ticket: t, kind: "review" })),
  ];

  // Site visits from today onwards
  const upcomingVisits = tickets
    .filter((t) => t.visit_date && t.status === "PI_ASSIGNED" && daysUntil(t.visit_date) >= 0)
    .sort((a, b) => new Date(a.visit_date) - new Date(b.visit_date))
    .slice(0, 4);

  const username = localStorage.getItem("username") || "there";
  const hello = greeting();
  const HelloIcon = hello.icon;
  const todayText = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  let heroLine = "Everything is up to date. Nice work!";
  if (!loading && (pendingAssignment > 0 || awaitingReview > 0)) {
    const parts = [];
    if (pendingAssignment > 0) parts.push(`${pendingAssignment} new request${pendingAssignment > 1 ? "s" : ""} waiting for an installer`);
    if (awaitingReview > 0) parts.push(`${awaitingReview} assessment${awaitingReview > 1 ? "s" : ""} to review`);
    heroLine = `You have ${parts.join(" and ")}.`;
  }

  function goToTicket(id) {
    navigate(`/staff/manage-tickets/${id}`);
  }

  function rowKeyDown(e, id) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      goToTicket(id);
    }
  }

  return (
    <StaffLayout pageTitle="Staff Dashboard" pageSubtitle="Overview of system activity">
      <div className="stfdb-page">
        {error && !loading ? (
          <div className="stfdb-card">
            <div className="stfdb-empty">
              <span className="stfdb-empty-badge red">
                <AlertCircle size={26} />
              </span>
              <p className="stfdb-empty-title">Something went wrong</p>
              <p className="stfdb-empty-hint">{error}</p>
              <button type="button" className="stfdb-btn-primary" onClick={() => setReloadKey((k) => k + 1)}>
                Try again
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* ---------- Welcome banner ---------- */}
            <section className="stfdb-hero">
              <div className="stfdb-hero-glow" aria-hidden="true" />
              <div className="stfdb-hero-text">
                <span className="stfdb-hero-date">
                  <HelloIcon size={14} />
                  {todayText}
                </span>
                <h1>
                  {hello.text}, <span>{username}</span>
                </h1>
                <p>{loading ? "Loading today's work..." : heroLine}</p>
              </div>
              <div className="stfdb-hero-actions">
                <button type="button" className="stfdb-hero-btn gold" onClick={() => navigate("/staff/manage-tickets")}>
                  <UserPlus size={16} />
                  Assign installers
                </button>
                <button type="button" className="stfdb-hero-btn glass" onClick={() => navigate("/staff/assessment-review")}>
                  <ClipboardCheck size={16} />
                  Review assessments
                </button>
              </div>
            </section>

            {/* ---------- Returned for revision ---------- */}
            {!loading && returnedForRevision.length > 0 && (
              <div className="stfdb-alert">
                <span className="stfdb-alert-icon">
                  <AlertTriangle size={20} />
                </span>
                <div className="stfdb-alert-text">
                  <p className="stfdb-alert-title">
                    {returnedForRevision.length} ticket{returnedForRevision.length > 1 ? "s" : ""} returned for revision
                  </p>
                  <p className="stfdb-alert-sub">The Admin sent these back with notes. Please review and resubmit.</p>
                </div>
                <button type="button" className="stfdb-alert-btn" onClick={handleViewRevisions}>
                  Review now
                  <ArrowRight size={15} />
                </button>
              </div>
            )}

            {/* ---------- Main grid ---------- */}
            <div className="stfdb-grid">
              {/* Recent activity */}
              <section className="stfdb-card stfdb-recent">
                <div className="stfdb-card-head">
                  <div>
                    <h2>Recent Activity</h2>
                    <p>
                      {filterKey === "ALL"
                        ? "The latest 8 tickets that were updated"
                        : `Latest ${currentFilter.label.toLowerCase()} · ${filterCounts[filterKey]} in total`}
                      {lastUpdated && <span className="stfdb-live"> · Live, refreshes every 15s</span>}
                    </p>
                  </div>
                  <div className="stfdb-card-controls">
                    <button type="button" className="stfdb-view-all" onClick={() => navigate("/staff/manage-tickets")}>
                      Manage Tickets
                      <ArrowRight size={15} />
                    </button>
                    <FilterDropdown value={filterKey} counts={filterCounts} onChange={setFilterKey} />
                  </div>
                </div>

                <div className="stfdb-table">
                  <div className="stfdb-row stfdb-row-head">
                    <span>Customer</span>
                    <span>Partner Installer</span>
                    <span>Updated</span>
                    <span>Status</span>
                  </div>

                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => <RecentRowSkeleton key={i} />)
                  ) : recentActivity.length === 0 ? (
                    <div className="stfdb-empty">
                      <span className="stfdb-empty-badge">
                        <Inbox size={26} />
                      </span>
                      <p className="stfdb-empty-title">No recent ticket activity</p>
                      <p className="stfdb-empty-hint">
                        {filterKey === "ALL"
                          ? "Tickets will show up here as customers submit requests."
                          : `No ${currentFilter.label.toLowerCase()} tickets right now.`}
                      </p>
                      {filterKey !== "ALL" && (
                        <button type="button" className="stfdb-btn-secondary" onClick={() => setFilterKey("ALL")}>
                          Show all
                        </button>
                      )}
                    </div>
                  ) : (
                    recentActivity.map((t) => {
                      const badgeClass = STATUS_BADGE_CLASS[t.status] || "in-progress";
                      const name = customerName(t);
                      return (
                        <div
                          className="stfdb-row stfdb-row-click"
                          key={t.id}
                          onClick={() => goToTicket(t.id)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => rowKeyDown(e, t.id)}
                        >
                          <span className="stfdb-customer">
                            <span className="stfdb-avatar">{getInitials(name)}</span>
                            <span className="stfdb-customer-text">
                              <span className="stfdb-customer-name">{name}</span>
                              <span className="stfdb-ticket-no">{t.ticket_number}</span>
                            </span>
                          </span>
                          <span className="stfdb-installer">
                            {t.partner_installer_username ? (
                              <>
                                <span className="stfdb-mini-avatar">{getInitials(t.partner_installer_username)}</span>
                                {t.partner_installer_username}
                              </>
                            ) : (
                              <span className="stfdb-muted">Not assigned</span>
                            )}
                          </span>
                          <span className="stfdb-date" title={formatDate(t.updated_at)}>
                            {timeAgo(t.updated_at)}
                          </span>
                          <span>
                            <span className={`stfdb-badge ${badgeClass}`}>
                              <span className="stfdb-badge-dot" />
                              {t.status_display}
                            </span>
                          </span>
                          <ChevronRight size={17} className="stfdb-row-arrow" />
                        </div>
                      );
                    })
                  )}
                </div>
              </section>

              {/* Side column */}
              <aside className="stfdb-side">
                {/* Needs attention */}
                <section className="stfdb-card stfdb-todo">
                  <div className="stfdb-side-head">
                    <h2>Needs your attention</h2>
                    {!loading && needsAction.length > 0 && <span className="stfdb-count">{needsAction.length}</span>}
                  </div>

                  {loading ? (
                    <div className="stfdb-skel-stack">
                      <span className="stfdb-skel stfdb-skel-todo" />
                      <span className="stfdb-skel stfdb-skel-todo" />
                    </div>
                  ) : needsAction.length === 0 ? (
                    <div className="stfdb-allclear">
                      <PartyPopper size={22} />
                      <div>
                        <strong>All caught up</strong>
                        <span>No requests or assessments waiting on you.</span>
                      </div>
                    </div>
                  ) : (
                    <ul className="stfdb-todo-list">
                      {needsAction.slice(0, 5).map(({ ticket, kind }) => {
                        const waited = daysWaiting(kind === "assign" ? ticket.created_at : ticket.updated_at);
                        return (
                          <li key={ticket.id}>
                            <button type="button" className="stfdb-todo-item" onClick={() => goToTicket(ticket.id)}>
                              <span className={`stfdb-todo-icon ${kind}`}>
                                {kind === "assign" ? <UserPlus size={15} /> : <ClipboardCheck size={15} />}
                              </span>
                              <span className="stfdb-todo-text">
                                <strong>{customerName(ticket)}</strong>
                                <span>
                                  {ticket.ticket_number} · {kind === "assign" ? "Assign an installer" : "Review assessment"}
                                </span>
                              </span>
                              <span className={`stfdb-wait ${waited >= 3 ? "late" : ""}`}>
                                <Clock size={11} />
                                {waited === 0 ? "Today" : `${waited}d`}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {!loading && needsAction.length > 5 && (
                    <button type="button" className="stfdb-side-link" onClick={() => navigate("/staff/manage-tickets")}>
                      See all {needsAction.length} <ArrowRight size={14} />
                    </button>
                  )}
                </section>

                {/* Upcoming visits */}
                <section className="stfdb-card">
                  <div className="stfdb-side-head">
                    <h2>Upcoming site visits</h2>
                    <button type="button" className="stfdb-side-link small" onClick={() => navigate("/staff/calendar")}>
                      Calendar <ArrowRight size={13} />
                    </button>
                  </div>
                  {loading ? (
                    <div className="stfdb-skel-stack">
                      <span className="stfdb-skel stfdb-skel-todo" />
                    </div>
                  ) : upcomingVisits.length === 0 ? (
                    <p className="stfdb-side-empty">
                      <CalendarDays size={16} />
                      No visits scheduled yet.
                    </p>
                  ) : (
                    <ul className="stfdb-visits">
                      {upcomingVisits.map((t) => {
                        const d = new Date(t.visit_date);
                        const left = daysUntil(t.visit_date);
                        return (
                          <li key={t.id}>
                            <button type="button" className="stfdb-visit" onClick={() => goToTicket(t.id)}>
                              <span className="stfdb-visit-cal">
                                <span>{d.toLocaleDateString("en-US", { month: "short" })}</span>
                                <strong>{d.getDate()}</strong>
                              </span>
                              <span className="stfdb-visit-text">
                                <strong>{customerName(t)}</strong>
                                <span>{t.partner_installer_username || "Partner Installer"}</span>
                              </span>
                              <span className={`stfdb-visit-when ${left <= 1 ? "soon" : ""}`}>
                                {left === 0 ? "Today" : left === 1 ? "Tomorrow" : `In ${left} days`}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              </aside>
            </div>
          </>
        )}
      </div>
    </StaffLayout>
  );
}