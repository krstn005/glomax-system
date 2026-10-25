import { useEffect, useMemo, useState } from "react";
import {
  Inbox,
  AlertCircle,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  Lock,
  RefreshCw,
  History,
  Clock,
} from "lucide-react";
import StaffLayout from "../components/StaffLayout";
import { getPaymentTerms } from "../../../api/staffQuotations";
import "../styles/staff-payment-terms-history.css";

const PAGE_SIZE = 20;

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Splits "30% Down Payment, 70% Upon Installation" into
// [{ percent: "30%", value: 30, text: "Down Payment" }, ...]
function splitTerms(description) {
  if (!description) return [];
  return description
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((segment) => {
      const match = segment.match(/^(\d+(?:\.\d+)?)%\s*(.*)$/);
      if (match) return { percent: `${match[1]}%`, value: Number(match[1]), text: match[2] };
      return { percent: null, value: 0, text: segment };
    });
}

// How long a version was (or has been) in use
function usedFor(from, to) {
  if (!from) return "";
  const end = to ? new Date(to) : new Date();
  const days = Math.max(0, Math.floor((end - new Date(from)) / 86400000));
  if (days === 0) return to ? "Used for less than a day" : "Added today";
  const label = days === 1 ? "1 day" : `${days} days`;
  return to ? `Used for ${label}` : `In use for ${label}`;
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

// Coloured bar that shows how the total is split
function SplitBar({ parts, small }) {
  // Only draw the bar when the parts add up to 100%
  const withValue = parts.filter((part) => part.value > 0);
  const total = withValue.reduce((sum, part) => sum + part.value, 0);
  if (withValue.length === 0 || Math.abs(total - 100) >= 1) return null;
  return (
    <div className={`stfpt-split ${small ? "small" : ""}`} aria-hidden="true">
      {withValue.map((part, i) => (
        <span key={i} className={`stfpt-split-part part-${i % 3}`} style={{ flexGrow: part.value }}>
          {!small && part.percent}
        </span>
      ))}
    </div>
  );
}

// One chip per payment: "30%  Upon Downpayment"
function TermChips({ parts }) {
  return (
    <div className="stfpt-chips">
      {parts.map((part, i) => (
        <span key={i} className="stfpt-chip">
          {part.percent && <span className={`stfpt-chip-percent part-${i % 3}`}>{part.percent}</span>}
          <span className="stfpt-chip-text">{part.text || "Of the total price"}</span>
        </span>
      ))}
    </div>
  );
}

function ItemSkeleton() {
  return (
    <li className="stfpt-item stfpt-item-skeleton">
      <span className="stfpt-skel stfpt-skel-badge" />
      <div className="stfpt-item-card">
        <span className="stfpt-skel stfpt-skel-w-md" />
        <span className="stfpt-skel stfpt-skel-w-lg" />
      </div>
    </li>
  );
}

export default function StaffPaymentTermsHistoryPage() {
  const [terms, setTerms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const data = await getPaymentTerms();
        if (cancelled) return;
        setTerms(data);
        setError("");
      } catch {
        if (!cancelled) setError("Could not load Payment Terms History. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  // Newest first - the newest entry is the one in use
  const sortedTerms = useMemo(
    () =>
      [...terms].sort((a, b) => {
        const diff = new Date(b.date_added) - new Date(a.date_added);
        return diff !== 0 ? diff : b.id - a.id;
      }),
    [terms]
  );

  const currentEntry = sortedTerms[0];
  const currentParts = currentEntry ? splitTerms(currentEntry.description) : [];

  const totalPages = Math.max(1, Math.ceil(sortedTerms.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * PAGE_SIZE;
  const pageItems = sortedTerms.slice(startIndex, startIndex + PAGE_SIZE);

  function refresh() {
    setError("");
    setReloadKey((k) => k + 1);
  }

  function goToPage(p) {
    setPage(p);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  let heroText;
  if (loading) heroText = "Loading every payment terms entry...";
  else if (error) heroText = "Payment Terms History could not be loaded right now.";
  else if (!currentEntry) heroText = "No payment terms yet. Entries added by the Admin will show up here.";
  else
    heroText = `Version ${sortedTerms.length} is in use since ${formatDate(currentEntry.date_added)} · ${
      sortedTerms.length
    } version${sortedTerms.length === 1 ? "" : "s"} in total.`;

  return (
    <StaffLayout pageTitle="Payment Terms History" pageSubtitle="Every payment terms entry recorded by the Admin">
      <div className="stfpt-page">
        {/* ---------- Banner ---------- */}
        <section className="stfpt-hero">
          <div className="stfpt-hero-glow" aria-hidden="true" />
          <div className="stfpt-hero-icon">
            <CalendarCheck size={26} />
          </div>
          <div className="stfpt-hero-text">
            <div className="stfpt-hero-title">
              <h1>Payment Terms History</h1>
              <span className="stfpt-readonly">
                <Lock size={12} />
                Read-only
              </span>
            </div>
            <p>{heroText}</p>
          </div>
          <div className="stfpt-hero-actions">
            <button type="button" className="stfpt-hero-btn glass" onClick={refresh} disabled={loading}>
              <RefreshCw size={16} className={loading ? "spin" : ""} />
              Refresh
            </button>
          </div>
        </section>

        <p className="stfpt-rule">
          This is the full history of every payment terms entry. The newest entry is the one used on new
          quotations.
        </p>

        {error ? (
          <div className="stfpt-card">
            <div className="stfpt-empty-state">
              <span className="stfpt-empty-badge stfpt-empty-badge-red">
                <AlertCircle size={26} />
              </span>
              <p className="stfpt-empty-title">Something went wrong</p>
              <p className="stfpt-empty-hint">{error}</p>
              <button type="button" className="stfpt-btn-primary" onClick={refresh}>
                <RefreshCw size={15} />
                Try again
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* ---------- Current payment terms ---------- */}
            <section className="stfpt-card stfpt-current">
              <div className="stfpt-card-head">
                <span className="stfpt-card-icon tone-green">
                  <CalendarCheck size={18} />
                </span>
                <div className="stfpt-card-head-text">
                  <h2>Current Payment Terms</h2>
                  <p>Used on every new quotation</p>
                </div>
                {!loading && currentEntry && (
                  <span className="stfpt-status current">
                    <span className="stfpt-status-dot" />
                    Version {sortedTerms.length}
                  </span>
                )}
              </div>

              {loading ? (
                <div className="stfpt-current-body">
                  <span className="stfpt-skel stfpt-skel-bar" />
                  <span className="stfpt-skel stfpt-skel-w-lg" />
                </div>
              ) : !currentEntry ? (
                <div className="stfpt-empty-state small">
                  <span className="stfpt-empty-badge">
                    <Inbox size={24} />
                  </span>
                  <p className="stfpt-empty-title">No payment terms on record</p>
                  <p className="stfpt-empty-hint">Payment terms added by the Admin will show up here.</p>
                </div>
              ) : (
                <div className="stfpt-current-body">
                  <SplitBar parts={currentParts} />
                  {currentParts.length > 0 && (
                    <div className="stfpt-steps">
                      {currentParts.map((part, i) => (
                        <div key={i} className="stfpt-step">
                          <span className={`stfpt-step-percent part-${i % 3}`}>{part.percent || "—"}</span>
                          <div className="stfpt-step-text">
                            <span className="stfpt-step-label">Payment {i + 1}</span>
                            <span className="stfpt-step-value">{part.text || "Of the total price"}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="stfpt-current-foot">
                    <span>
                      <CalendarCheck size={14} />
                      Effective since <strong>{formatDate(currentEntry.date_added)}</strong>
                    </span>
                    <span>
                      <Clock size={14} />
                      {usedFor(currentEntry.date_added, null)}
                    </span>
                  </div>
                </div>
              )}
            </section>

            {/* ---------- Full history ---------- */}
            <section className="stfpt-card stfpt-list-card">
              <div className="stfpt-list-head">
                <span className="stfpt-card-icon tone-navy">
                  <History size={18} />
                </span>
                <div className="stfpt-card-head-text">
                  <h2>Full History</h2>
                  <p>Newest first. Older versions are kept for the records.</p>
                </div>
                {!loading && sortedTerms.length > 0 && (
                  <span className="stfpt-count">
                    {sortedTerms.length} version{sortedTerms.length === 1 ? "" : "s"}
                  </span>
                )}
              </div>

              {!loading && sortedTerms.length === 0 ? (
                <div className="stfpt-empty-state">
                  <span className="stfpt-empty-badge">
                    <Inbox size={26} />
                  </span>
                  <p className="stfpt-empty-title">No entries yet</p>
                  <p className="stfpt-empty-hint">Entries added by the Admin will show up here.</p>
                </div>
              ) : (
                <>
                  <ol className="stfpt-timeline">
                    {loading
                      ? Array.from({ length: 3 }).map((_, i) => <ItemSkeleton key={i} />)
                      : pageItems.map((entry, i) => {
                          const overallIndex = startIndex + i;
                          const versionNumber = sortedTerms.length - overallIndex;
                          const isCurrent = overallIndex === 0;
                          const isFirst = overallIndex === sortedTerms.length - 1;
                          const newer = overallIndex > 0 ? sortedTerms[overallIndex - 1] : null;
                          const parts = splitTerms(entry.description);

                          return (
                            <li key={entry.id} className={`stfpt-item ${isCurrent ? "current" : ""}`}>
                              <span className={`stfpt-version-badge ${isCurrent ? "current" : ""}`}>
                                {versionNumber}
                              </span>

                              <div className="stfpt-item-card">
                                <div className="stfpt-item-top">
                                  <div className="stfpt-item-title">
                                    <strong>Version {versionNumber}</strong>
                                    {isFirst && <span className="stfpt-first-tag">First entry</span>}
                                  </div>
                                  <span className={`stfpt-status ${isCurrent ? "current" : "replaced"}`}>
                                    <span className="stfpt-status-dot" />
                                    {isCurrent ? "Current" : "Replaced"}
                                  </span>
                                </div>

                                {parts.length > 0 ? (
                                  <TermChips parts={parts} />
                                ) : (
                                  <span className="stfpt-terms-text">{entry.description || "—"}</span>
                                )}

                                <SplitBar parts={parts} small />

                                <div className="stfpt-item-foot">
                                  <span>
                                    <CalendarCheck size={13} />
                                    Effective since <strong>{formatDate(entry.date_added)}</strong>
                                  </span>
                                  <span>
                                    <Clock size={13} />
                                    {usedFor(entry.date_added, newer?.date_added)}
                                  </span>
                                </div>
                              </div>
                            </li>
                          );
                        })}
                  </ol>

                  {/* Page buttons only show when there is more than one page */}
                  {!loading && totalPages > 1 && (
                    <div className="stfpt-pagination">
                      <div className="stfpt-pagination-controls">
                        <button
                          type="button"
                          className="stfpt-page-btn"
                          disabled={safePage === 1}
                          onClick={() => goToPage(safePage - 1)}
                          aria-label="Previous page"
                        >
                          <ChevronLeft size={16} />
                        </button>
                        {getPageNumbers(safePage, totalPages).map((p, i) =>
                          p === "..." ? (
                            <span key={`gap-${i}`} className="stfpt-page-gap">…</span>
                          ) : (
                            <button
                              key={p}
                              type="button"
                              className={`stfpt-page-num ${p === safePage ? "active" : ""}`}
                              onClick={() => goToPage(p)}
                            >
                              {p}
                            </button>
                          )
                        )}
                        <button
                          type="button"
                          className="stfpt-page-btn"
                          disabled={safePage === totalPages}
                          onClick={() => goToPage(safePage + 1)}
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
          </>
        )}
      </div>
    </StaffLayout>
  );
}