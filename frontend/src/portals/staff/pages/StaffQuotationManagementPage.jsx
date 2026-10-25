import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  X,
  Inbox,
  Layers,
  FilePen,
  ShieldCheck,
  CheckCircle2,
  Award,
  FileX,
  Send,
  FileCheck,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  RefreshCw,
  Receipt,
  Clock,
  Eye,
} from "lucide-react";
import StaffLayout from "../components/StaffLayout";
import FilterMenu from "../../../components/FilterMenu";
import { getStaffTicketsPage } from "../../../api/staffTickets";
import { formatCurrency } from "../../../utils/currency";
import "../styles/staff-quotation-management.css";

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 400;

// Prices under this amount get a "Check amount" tag - catches typos like ₱1.00
const LOW_PRICE_WARNING = 1000;

const ALL_STATUSES = [
  "REQUEST_SUBMITTED",
  "PI_ASSIGNED",
  "ASSESSMENT_SUBMITTED",
  "STAFF_REVIEW",
  "ADMIN_REVIEW",
  "APPROVED",
  "COMPLETED",
];

const NEEDS_QUOTATION_STATUSES = ["ASSESSMENT_SUBMITTED", "STAFF_REVIEW"];
const BEFORE_ASSESSMENT_STATUSES = ["REQUEST_SUBMITTED", "PI_ASSIGNED"];

// Filter options - shown in the Filter drop-down button
const FILTERS = [
  { key: "ALL", label: "All Tickets", statuses: ALL_STATUSES, icon: Layers, tone: "navy" },
  { key: "NEEDS_QUOTATION", label: "Needs Quotation", statuses: NEEDS_QUOTATION_STATUSES, icon: FilePen, tone: "gold" },
  { key: "ADMIN_REVIEW", label: "Awaiting Admin", statuses: ["ADMIN_REVIEW"], icon: ShieldCheck, tone: "blue" },
  { key: "APPROVED", label: "Approved", statuses: ["APPROVED"], icon: CheckCircle2, tone: "green" },
  { key: "COMPLETED", label: "Completed", statuses: ["COMPLETED"], icon: Award, tone: "gold" },
];

const AVATAR_TONES = ["navy", "blue", "violet", "green", "amber", "rose"];

// Works out the quotation status. A ticket with a Final Sheet is
// "Finalized" - the Final Sheet's final_cost is the approved price.
function getQuotationStatus(ticket, initial, updated) {
  if (ticket.final_sheet) {
    return { label: "Finalized", tone: "green", icon: FileCheck };
  }
  if (!initial && !updated) {
    return { label: "No Quotation Yet", tone: "gray", icon: FileX };
  }
  if (NEEDS_QUOTATION_STATUSES.includes(ticket.status) && !updated) {
    return { label: "Awaiting Update", tone: "amber", icon: FilePen };
  }
  if (!updated) {
    return { label: "Initial Sent", tone: "blue", icon: Send };
  }
  return { label: "Up to Date", tone: "green", icon: CheckCircle2 };
}

// What Staff should do next.
// kind: "action" = Staff need to act, "wait" = waiting on someone else,
// "done" = nothing left to do, "muted" = missing info.
function getNextStep(ticket, updated) {
  if (ticket.final_sheet) {
    return { text: "Price is final", kind: "done", icon: FileCheck };
  }
  if (NEEDS_QUOTATION_STATUSES.includes(ticket.status) && !updated) {
    return { text: "Send updated quotation", kind: "action", icon: FilePen };
  }
  if (NEEDS_QUOTATION_STATUSES.includes(ticket.status)) {
    return { text: "Send to Admin", kind: "action", icon: ShieldCheck };
  }
  if (ticket.status === "ADMIN_REVIEW") {
    return { text: "Waiting for Admin", kind: "wait", icon: Clock };
  }
  if (BEFORE_ASSESSMENT_STATUSES.includes(ticket.status)) {
    return { text: "Waiting for assessment", kind: "wait", icon: Clock };
  }
  if (ticket.status === "APPROVED" || ticket.status === "COMPLETED") {
    return { text: "No final sheet", kind: "muted", icon: FileX };
  }
  return { text: "—", kind: "muted", icon: Eye };
}

function isLowPrice(amount) {
  const value = Number(amount);
  return !Number.isNaN(value) && value > 0 && value < LOW_PRICE_WARNING;
}

function getInitials(name) {
  const parts = (name || "?").trim().split(/\s+/);
  const first = parts[0]?.[0] || "?";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : parts[0]?.[1] || "";
  return (first + last).toUpperCase();
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
    <div className="stfqm-row stfqm-head" role="row">
      <span>Ticket #</span>
      <span>Customer</span>
      <span>Quotation</span>
      <span className="stfqm-hide-sm">Price</span>
      <span className="stfqm-hide-md stfqm-right">Next Step</span>
    </div>
  );
}

function RowSkeleton() {
  return (
    <div className="stfqm-row stfqm-row-skeleton">
      <span className="stfqm-skel stfqm-skel-sm" />
      <span className="stfqm-skel-customer">
        <span className="stfqm-skel stfqm-skel-avatar" />
        <span className="stfqm-skel-stack">
          <span className="stfqm-skel stfqm-skel-md" />
          <span className="stfqm-skel stfqm-skel-xs" />
        </span>
      </span>
      <span>
        <span className="stfqm-skel stfqm-skel-pill" />
      </span>
      <span className="stfqm-hide-sm stfqm-skel-stack">
        <span className="stfqm-skel stfqm-skel-md" />
        <span className="stfqm-skel stfqm-skel-md" />
      </span>
      <span className="stfqm-hide-md stfqm-right">
        <span className="stfqm-skel stfqm-skel-btn" />
      </span>
    </div>
  );
}

function TicketRow({ ticket: t, onOpen }) {
  const displayName = t.full_name || t.customer_username;
  const initial = t.quotations?.find((q) => q.quotation_type === "INITIAL");
  const updated = [...(t.quotations || [])]
    .filter((q) => q.quotation_type === "UPDATED")
    .sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at))[0];
  const qStatus = getQuotationStatus(t, initial, updated);
  const StatusIcon = qStatus.icon;
  const nextStep = getNextStep(t, updated);
  const NextIcon = nextStep.icon;

  // Latest price: the newest Updated Quotation, or the
  // Final Sheet's approved price when there is one
  const finalCost = t.final_sheet?.final_cost;
  const latestAmount = finalCost || updated?.estimated_cost;
  const avatarTone = AVATAR_TONES[Number(t.id || 0) % AVATAR_TONES.length];

  return (
    <div
      className={`stfqm-row stfqm-item ${nextStep.kind === "action" ? "needs-action" : ""}`}
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
      <span className="stfqm-ticket">{t.ticket_number}</span>

      <span className="stfqm-customer">
        <span className={`stfqm-avatar tone-${avatarTone}`}>{getInitials(displayName)}</span>
        <span className="stfqm-customer-text">
          <span className="stfqm-customer-name">{displayName}</span>
          {t.solar_package && <span className="stfqm-package">{t.solar_package}</span>}
          {/* Next step shows here on smaller screens */}
          <span className={`stfqm-next-inline ${nextStep.kind}`}>
            <NextIcon size={12} />
            {nextStep.text}
          </span>
        </span>
      </span>

      <span>
        <span className={`stfqm-status tone-${qStatus.tone}`}>
          <StatusIcon size={13} />
          {qStatus.label}
        </span>
      </span>

      <span className="stfqm-hide-sm">
        <PriceCell initial={initial} latestAmount={latestAmount} isFinal={Boolean(finalCost)} />
      </span>

      <span className="stfqm-hide-md stfqm-right">
        <span className={`stfqm-next ${nextStep.kind}`}>
          <NextIcon size={14} />
          {nextStep.text}
          {nextStep.kind === "action" && <ArrowRight size={14} className="stfqm-next-arrow" />}
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

export default function StaffQuotationManagementPage() {
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

  function goToQuotation(id) {
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
  const hasActiveFilters = activeFilter !== "ALL" || Boolean(searchTerm);
  const needsCount = filterCounts.NEEDS_QUOTATION;

  return (
    <StaffLayout pageTitle="Quotation Management" pageSubtitle="Manage quotations for active tickets">
      <div className="stfqm-page">
        {/* ---------- Banner ---------- */}
        <section className="stfqm-hero">
          <div className="stfqm-hero-glow" aria-hidden="true" />
          <div className="stfqm-hero-icon">
            <Receipt size={26} />
          </div>
          <div className="stfqm-hero-text">
            <h1>Quotations</h1>
            <p>
              {needsCount === undefined
                ? "Track the price of every ticket, from the first quotation to the final sheet."
                : needsCount === 0
                ? "You're all caught up. No ticket needs an updated quotation right now."
                : `${needsCount} ticket${needsCount === 1 ? " needs" : "s need"} an updated quotation after the site assessment.`}
            </p>
          </div>
          <div className="stfqm-hero-actions">
            {needsCount > 0 && activeFilter !== "NEEDS_QUOTATION" && (
              <button type="button" className="stfqm-hero-btn gold" onClick={() => changeFilter("NEEDS_QUOTATION")}>
                <FilePen size={16} />
                Show these
              </button>
            )}
            <button type="button" className="stfqm-hero-btn glass" onClick={refresh} disabled={loading}>
              <RefreshCw size={16} className={loading ? "spin" : ""} />
              Refresh
            </button>
          </div>
        </section>

        {/* ---------- Ticket list ---------- */}
        <section className="stfqm-card">
          <div className="stfqm-card-head">
            <div className="stfqm-card-title">
              <h2>
                <Receipt size={18} />
                Ticket List
              </h2>
              <p>Click any row to open the ticket's assessment and quotation.</p>
            </div>

            <div className="stfqm-tools">
              <div className="stfqm-search">
                <Search size={17} className="stfqm-search-icon" />
                <input
                  type="text"
                  placeholder="Search customer or ticket #"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                />
                {searchInput && (
                  <button
                    type="button"
                    className="stfqm-search-clear"
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
                alertKey="NEEDS_QUOTATION"
                ariaLabel="Filter tickets"
              />
            </div>
          </div>

          {error ? (
            <div className="stfqm-empty">
              <span className="stfqm-empty-badge red">
                <AlertCircle size={26} />
              </span>
              <p className="stfqm-empty-title">Something went wrong</p>
              <p className="stfqm-empty-hint">{error}</p>
              <button type="button" className="stfqm-btn-primary" onClick={refresh}>
                <RefreshCw size={15} />
                Try again
              </button>
            </div>
          ) : loading ? (
            <div className="stfqm-list" role="table">
              <ListHead />
              {Array.from({ length: 5 }).map((_, i) => (
                <RowSkeleton key={i} />
              ))}
            </div>
          ) : tickets.length === 0 ? (
            <div className="stfqm-empty">
              <span className="stfqm-empty-badge">
                <Inbox size={26} />
              </span>
              <p className="stfqm-empty-title">
                {searchTerm ? "No tickets match your search" : "No tickets in this view"}
              </p>
              <p className="stfqm-empty-hint">
                {searchTerm ? "Try a different name or ticket number." : "Try another filter."}
              </p>
              {hasActiveFilters && (
                <button type="button" className="stfqm-btn-secondary" onClick={clearAll}>
                  Show all tickets
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="stfqm-list" role="table">
                <ListHead />
                {tickets.map((t) => (
                  <TicketRow key={t.id} ticket={t} onOpen={goToQuotation} />
                ))}
              </div>

              {totalPages > 1 && (
                <div className="stfqm-pagination">
                    <div className="stfqm-pagination-controls">
                      <button
                        type="button"
                        className="stfqm-page-btn"
                        disabled={!hasPrevious}
                        onClick={() => goToPage(page - 1)}
                        aria-label="Previous page"
                      >
                        <ChevronLeft size={16} />
                      </button>
                      {getPageNumbers(page, totalPages).map((p, i) =>
                        p === "..." ? (
                          <span key={`gap-${i}`} className="stfqm-page-gap">…</span>
                        ) : (
                          <button
                            key={p}
                            type="button"
                            className={`stfqm-page-num ${p === page ? "active" : ""}`}
                            onClick={() => goToPage(p)}
                          >
                            {p}
                          </button>
                        )
                      )}
                      <button
                        type="button"
                        className="stfqm-page-btn"
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

        <p className="stfqm-footnote">
          <AlertTriangle size={13} />
          Prices under {formatCurrency(LOW_PRICE_WARNING)} get a "Check" tag, in case of a typo.
        </p>
      </div>
    </StaffLayout>
  );
}
