import { useEffect, useMemo, useState } from "react";
import {
  History,
  Tag,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
  Layers,
  Zap,
  BatteryCharging,
  Lock,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Sparkles,
  CheckCircle2,
} from "lucide-react";
import StaffLayout from "../components/StaffLayout";
import { getPriceHistory } from "../../../api/staffQuotations";
import { formatCurrency } from "../../../utils/currency";
import FilterMenu from "../../../components/FilterMenu";
import "../styles/staff-price-history.css";

const PAGE_SIZE = 20;

// Filter options - shown in the Filter drop-down button
const FILTERS = [
  { key: "ALL", label: "All Entries", icon: Layers, tone: "navy" },
  { key: "ON_GRID", label: "On-Grid", icon: Zap, tone: "blue" },
  { key: "HYBRID", label: "Hybrid", icon: BatteryCharging, tone: "gold" },
];

// Fixed package list, so a tile shows even if a package has no active price yet
const PACKAGE_SIZES = [3, 6, 8, 10];

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// "Today", "Yesterday", "5 days ago", "3 months ago"
function timeAgo(value) {
  if (!value) return "";
  const days = Math.floor((Date.now() - new Date(value).getTime()) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

function packageKey(p) {
  return `${p.system_type}-${Number(p.rated_capacity_kw)}`;
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

function CurrentTile({ kw, systemType, match }) {
  const isHybrid = systemType === "HYBRID";
  return (
    <div className={`stfph-current-tile ${match ? "" : "empty"}`}>
      <span className={`stfph-kw ${isHybrid ? "tone-gold" : "tone-blue"}`}>{kw}</span>
      <div className="stfph-current-text">
        <span className="stfph-current-label">
          {kw}KW {isHybrid ? "Hybrid" : "On-Grid"}
        </span>
        <span className="stfph-current-price">{match ? formatCurrency(match.price) : "No active price"}</span>
      </div>
    </div>
  );
}

// Shows how the price changed compared to the older entry of the same package
function PriceChange({ change }) {
  if (!change) {
    return (
      <span className="stfph-change first">
        <Sparkles size={12} />
        First price
      </span>
    );
  }
  if (change.diff === 0) {
    return <span className="stfph-change same">No change</span>;
  }
  const up = change.diff > 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className={`stfph-change ${up ? "up" : "down"}`}>
      <Icon size={12} />
      {up ? "+" : "−"}
      {formatCurrency(Math.abs(change.diff))}
    </span>
  );
}

function RowSkeleton() {
  return (
    <div className="stfph-row stfph-row-skeleton">
      <div className="stfph-cell-package">
        <span className="stfph-skel stfph-skel-kw" />
        <span className="stfph-skel stfph-skel-w-md" />
      </div>
      <div className="stfph-cell-type">
        <span className="stfph-skel stfph-skel-pill" />
      </div>
      <div className="stfph-cell-price">
        <span className="stfph-skel stfph-skel-w-md" />
      </div>
      <div className="stfph-cell-date">
        <span className="stfph-skel stfph-skel-w-sm" />
      </div>
      <div className="stfph-cell-status">
        <span className="stfph-skel stfph-skel-pill" />
      </div>
    </div>
  );
}

export default function StaffPriceHistoryPage() {
  const [prices, setPrices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeFilter, setActiveFilter] = useState("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const data = await getPriceHistory();
        if (cancelled) return;
        setPrices(data);
        setError("");
      } catch {
        if (!cancelled) setError("Could not load Price History. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  // Newest first, so recent price changes are at the top
  const sortedPrices = useMemo(
    () =>
      [...prices].sort((a, b) => {
        const diff = new Date(b.date_added) - new Date(a.date_added);
        return diff !== 0 ? diff : b.id - a.id;
      }),
    [prices]
  );

  // For each entry, compare with the older entry of the same package
  const changes = useMemo(() => {
    const result = {};
    sortedPrices.forEach((p, i) => {
      const older = sortedPrices.slice(i + 1).find((q) => packageKey(q) === packageKey(p));
      result[p.id] = older ? { diff: Number(p.price) - Number(older.price) } : null;
    });
    return result;
  }, [sortedPrices]);

  const activePrices = prices.filter((p) => p.is_active);

  function findActive(kw, systemType) {
    return activePrices.find((p) => Number(p.rated_capacity_kw) === kw && p.system_type === systemType);
  }

  const counts = {
    ALL: prices.length,
    ON_GRID: prices.filter((p) => p.system_type === "ON_GRID").length,
    HYBRID: prices.filter((p) => p.system_type === "HYBRID").length,
  };

  // Search matches the package name or the price
  const rawTerm = searchTerm.trim().toLowerCase();
  const filteredPrices = sortedPrices.filter((p) => {
    if (activeFilter !== "ALL" && p.system_type !== activeFilter) return false;
    if (!rawTerm) return true;
    const name = `${p.package_name || ""} ${Number(p.rated_capacity_kw)}kw`.toLowerCase();
    const price = String(p.price).replace(/[^\d.]/g, "");
    return name.includes(rawTerm) || price.includes(rawTerm.replace(/[^\d.]/g, "") || "\u0000");
  });

  const totalPages = Math.max(1, Math.ceil(filteredPrices.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * PAGE_SIZE;
  const pageItems = filteredPrices.slice(startIndex, startIndex + PAGE_SIZE);

  const hasActiveFilters = activeFilter !== "ALL" || Boolean(rawTerm);
  const newest = sortedPrices[0];

  function changeFilter(key) {
    setActiveFilter(key);
    setPage(1);
  }

  function changeSearch(value) {
    setSearchTerm(value);
    setPage(1);
  }

  function clearAll() {
    changeSearch("");
    changeFilter("ALL");
  }

  function refresh() {
    setError("");
    setReloadKey((k) => k + 1);
  }

  function goToPage(p) {
    setPage(p);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  let heroText;
  if (loading) heroText = "Loading every price entry...";
  else if (error) heroText = "Price History could not be loaded right now.";
  else if (prices.length === 0) heroText = "No price entries yet. Prices added by the Admin will show up here.";
  else
    heroText = `${prices.length} price entr${prices.length === 1 ? "y" : "ies"} · last change on ${formatDate(
      newest?.date_added
    )}.`;

  return (
    <StaffLayout pageTitle="Price History" pageSubtitle="Every price entry recorded by the Admin">
      <div className="stfph-page">
        {/* ---------- Banner ---------- */}
        <section className="stfph-hero">
          <div className="stfph-hero-glow" aria-hidden="true" />
          <div className="stfph-hero-icon">
            <History size={26} />
          </div>
          <div className="stfph-hero-text">
            <div className="stfph-hero-title">
              <h1>Price History</h1>
              <span className="stfph-readonly">
                <Lock size={12} />
                Read-only
              </span>
            </div>
            <p>{heroText}</p>
          </div>
          <div className="stfph-hero-actions">
            <button type="button" className="stfph-hero-btn glass" onClick={refresh} disabled={loading}>
              <RefreshCw size={16} className={loading ? "spin" : ""} />
              Refresh
            </button>
          </div>
        </section>

        <p className="stfph-rule">
          This is the full history of every price entry. The newest entry for each package becomes the active
          price shown in the Active Price List.
        </p>

        {/* ---------- Current prices ---------- */}
        {!error && (
          <section className="stfph-card stfph-current">
            <div className="stfph-card-head">
              <span className="stfph-card-icon tone-green">
                <CheckCircle2 size={18} />
              </span>
              <div className="stfph-card-head-text">
                <h2>Prices In Use</h2>
                <p>The newest entry for each package</p>
              </div>
            </div>
            <div className="stfph-current-groups">
              {[
                { type: "ON_GRID", label: "On-Grid", dot: "ongrid" },
                { type: "HYBRID", label: "Hybrid", dot: "hybrid" },
              ].map((group) => (
                <div key={group.type} className="stfph-current-group">
                  <p className="stfph-current-group-title">
                    <span className={`stfph-dot ${group.dot}`} />
                    {group.label}
                  </p>
                  <div className="stfph-current-grid">
                    {PACKAGE_SIZES.map((kw) =>
                      loading ? (
                        <div key={kw} className="stfph-current-tile">
                          <span className="stfph-skel stfph-skel-kw" />
                          <span className="stfph-skel stfph-skel-w-md" />
                        </div>
                      ) : (
                        <CurrentTile key={kw} kw={kw} systemType={group.type} match={findActive(kw, group.type)} />
                      )
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ---------- Full history list ---------- */}
        <section className="stfph-card stfph-list-card">
          <div className="stfph-list-head">
            <div className="stfph-card-head-text">
              <h2>Price Entries</h2>
              <p>
                {loading
                  ? "Loading..."
                  : `${filteredPrices.length} entr${filteredPrices.length === 1 ? "y" : "ies"}${
                      rawTerm ? ` matching "${searchTerm.trim()}"` : ""
                    } · newest first`}
              </p>
            </div>
            <div className="stfph-tools">
              <div className="stfph-search">
                <Search size={17} className="stfph-search-icon" />
                <input
                  type="text"
                  placeholder="Search package or price..."
                  value={searchTerm}
                  onChange={(e) => changeSearch(e.target.value)}
                />
                {searchTerm && (
                  <button
                    type="button"
                    className="stfph-search-clear"
                    onClick={() => changeSearch("")}
                    aria-label="Clear search"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              <FilterMenu
                options={FILTERS}
                activeKey={activeFilter}
                counts={loading || error ? {} : counts}
                onPick={changeFilter}
                ariaLabel="Filter by system type"
              />
            </div>
          </div>

          {error ? (
            <div className="stfph-empty-state">
              <span className="stfph-empty-badge stfph-empty-badge-red">
                <AlertCircle size={26} />
              </span>
              <p className="stfph-empty-title">Something went wrong</p>
              <p className="stfph-empty-hint">{error}</p>
              <button type="button" className="stfph-btn-primary" onClick={refresh}>
                <RefreshCw size={15} />
                Try again
              </button>
            </div>
          ) : !loading && filteredPrices.length === 0 ? (
            <div className="stfph-empty-state">
              <span className="stfph-empty-badge">
                <Tag size={26} />
              </span>
              <p className="stfph-empty-title">
                {prices.length === 0 ? "No price entries yet" : "No entries match your search or filter"}
              </p>
              <p className="stfph-empty-hint">
                {prices.length === 0
                  ? "Prices added by the Admin will show up here."
                  : "Try a different package, price, or system type."}
              </p>
              {hasActiveFilters && (
                <button type="button" className="stfph-btn-secondary" onClick={clearAll}>
                  Show all entries
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="stfph-list" role="table">
                <div className="stfph-row stfph-row-head" role="row">
                  <div role="columnheader">Package</div>
                  <div role="columnheader" className="stfph-cell-type">System</div>
                  <div role="columnheader">Price</div>
                  <div role="columnheader" className="stfph-cell-date">Date Added</div>
                  <div role="columnheader">Status</div>
                </div>

                {loading
                  ? Array.from({ length: 5 }).map((_, i) => <RowSkeleton key={i} />)
                  : pageItems.map((p) => {
                      const isHybrid = p.system_type === "HYBRID";
                      const kw = Number(p.rated_capacity_kw);
                      return (
                        <div key={p.id} className={`stfph-row ${p.is_active ? "is-active" : ""}`} role="row">
                          <div className="stfph-cell-package" role="cell">
                            <span className={`stfph-kw ${isHybrid ? "tone-gold" : "tone-blue"}`}>{kw}</span>
                            <div className="stfph-package-text">
                              <span className="stfph-package-name">{p.package_name || `${kw}KW`}</span>
                              <span className="stfph-package-meta">
                                <span className={`stfph-type-pill ${isHybrid ? "hybrid" : "ongrid"}`}>
                                  {p.system_type_display}
                                </span>
                                <span className="stfph-meta-date">{formatDate(p.date_added)}</span>
                              </span>
                            </div>
                          </div>
                          <div className="stfph-cell-type" role="cell">
                            <span className={`stfph-type-pill ${isHybrid ? "hybrid" : "ongrid"}`}>
                              {p.system_type_display}
                            </span>
                          </div>
                          <div className="stfph-cell-price" role="cell">
                            <span className="stfph-price">{formatCurrency(p.price)}</span>
                            <PriceChange change={changes[p.id]} />
                          </div>
                          <div className="stfph-cell-date" role="cell">
                            <span className="stfph-date">{formatDate(p.date_added)}</span>
                            <span className="stfph-ago">{timeAgo(p.date_added)}</span>
                          </div>
                          <div className="stfph-cell-status" role="cell">
                            <span className={`stfph-status ${p.is_active ? "active" : "inactive"}`}>
                              <span className="stfph-status-dot" />
                              {p.is_active ? "Active" : "Replaced"}
                            </span>
                          </div>
                        </div>
                      );
                    })}
              </div>

              {!loading && totalPages > 1 && (
                  <div className="stfph-pagination">
                      <div className="stfph-pagination-controls">
                        <button
                          type="button"
                          className="stfph-page-btn"
                          disabled={safePage === 1}
                          onClick={() => goToPage(safePage - 1)}
                          aria-label="Previous page"
                        >
                          <ChevronLeft size={16} />
                        </button>
                        {getPageNumbers(safePage, totalPages).map((p, i) =>
                          p === "..." ? (
                            <span key={`gap-${i}`} className="stfph-page-gap">…</span>
                          ) : (
                            <button
                              key={p}
                              type="button"
                              className={`stfph-page-num ${p === safePage ? "active" : ""}`}
                              onClick={() => goToPage(p)}
                            >
                              {p}
                            </button>
                          )
                        )}
                        <button
                          type="button"
                          className="stfph-page-btn"
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
      </div>
    </StaffLayout>
  );
}
