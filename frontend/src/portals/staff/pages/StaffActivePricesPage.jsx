import { useEffect, useState } from "react";
import {
  Tag,
  Inbox,
  Zap,
  BatteryCharging,
  CalendarCheck,
  AlertCircle,
  Lock,
  RefreshCw,
  CheckCircle2,
} from "lucide-react";
import StaffLayout from "../components/StaffLayout";
import { getPriceHistory, getPaymentTerms } from "../../../api/staffQuotations";
import { formatCurrency } from "../../../utils/currency";
import "../styles/staff-active-prices.css";

// Fixed package list, so a tile shows even if a package has no active price yet
const PACKAGE_SIZES = [3, 6, 8, 10];

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Picks the active prices. If the API sends "is_active", use it.
// If not, the newest entry for each package (system type + kW) is the
// active one - the same rule shown in the banner at the top.
function pickActivePrices(priceData) {
  const hasActiveFlag = priceData.some((p) => typeof p.is_active === "boolean");
  if (hasActiveFlag) {
    return priceData.filter((p) => p.is_active);
  }

  const latest = {};
  priceData.forEach((p) => {
    const key = `${p.system_type}-${Number(p.rated_capacity_kw)}`;
    if (!latest[key] || new Date(p.date_added) > new Date(latest[key].date_added)) {
      latest[key] = p;
    }
  });
  return Object.values(latest);
}

// Splits "30% Down Payment, 70% Upon Installation" into
// [{ percent: "30%", value: 30, text: "Down Payment" }, ...]
function splitPaymentTerms(description) {
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

// One tile per package size (3, 6, 8, 10 kW + any other size that has a price)
function buildTiles(prices) {
  const sizes = new Set(PACKAGE_SIZES);
  prices.forEach((p) => sizes.add(Number(p.rated_capacity_kw)));
  return [...sizes]
    .sort((a, b) => a - b)
    .map((kw) => ({ kw, match: prices.find((p) => Number(p.rated_capacity_kw) === kw) }));
}

function CardHead({ icon: Icon, tone, title, hint, right }) {
  return (
    <div className="stfap-card-head">
      <span className={`stfap-card-icon tone-${tone}`}>
        <Icon size={18} />
      </span>
      <div className="stfap-card-head-text">
        <h2>{title}</h2>
        {hint && <p>{hint}</p>}
      </div>
      {right}
    </div>
  );
}

function SystemCard({ icon, tone, title, hint, systemLabel, prices, loading }) {
  const tiles = buildTiles(prices);
  return (
    <section className={`stfap-card stfap-system tone-${tone}`}>
      <CardHead
        icon={icon}
        tone={tone}
        title={title}
        hint={hint}
        right={
          !loading && (
            <span className="stfap-count-pill">
              {prices.length} active
            </span>
          )
        }
      />

      <div className="stfap-tiles">
        {loading
          ? PACKAGE_SIZES.map((kw) => (
              <div key={kw} className="stfap-tile">
                <span className="stfap-skel stfap-skel-kw" />
                <div className="stfap-skel-stack">
                  <span className="stfap-skel stfap-skel-w-sm" />
                  <span className="stfap-skel stfap-skel-w-md" />
                </div>
              </div>
            ))
          : tiles.map(({ kw, match }) => (
              <div key={kw} className={`stfap-tile ${match ? "" : "empty"}`}>
                <span className="stfap-kw">
                  <strong>{kw}</strong>
                  <small>kW</small>
                </span>
                <div className="stfap-tile-text">
                  <span className="stfap-tile-name">
                    {kw}KW {systemLabel}
                  </span>
                  {match ? (
                    <>
                      <span className="stfap-tile-price">{formatCurrency(match.price)}</span>
                      <span className="stfap-tile-since">Since {formatDate(match.date_added)}</span>
                    </>
                  ) : (
                    <span className="stfap-tile-none">No active price</span>
                  )}
                </div>
                {match && (
                  <span className="stfap-tile-badge" title="Active">
                    <CheckCircle2 size={15} />
                  </span>
                )}
              </div>
            ))}
      </div>
    </section>
  );
}

export default function StaffActivePricesPage() {
  const [prices, setPrices] = useState([]);
  const [paymentTerms, setPaymentTerms] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const [priceData, termsData] = await Promise.all([getPriceHistory(), getPaymentTerms()]);
        if (cancelled) return;
        setPrices(pickActivePrices(priceData));
        setPaymentTerms(termsData[0] || null);
        setError("");
      } catch {
        if (!cancelled) setError("Could not load pricing data. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  function refresh() {
    setError("");
    setReloadKey((k) => k + 1);
  }

  const byCapacity = (a, b) => Number(a.rated_capacity_kw) - Number(b.rated_capacity_kw);
  const onGridPrices = prices.filter((p) => p.system_type === "ON_GRID").sort(byCapacity);
  const hybridPrices = prices.filter((p) => p.system_type === "HYBRID").sort(byCapacity);
  const termParts = splitPaymentTerms(paymentTerms?.description);
  const totalPercent = termParts.reduce((sum, part) => sum + part.value, 0);

  // Newest change among the active prices (for the banner)
  const lastChange = prices.reduce((latest, p) => {
    if (!latest || new Date(p.date_added) > new Date(latest)) return p.date_added;
    return latest;
  }, null);

  let heroText;
  if (loading) heroText = "Loading the prices in use right now...";
  else if (error) heroText = "Prices could not be loaded right now.";
  else if (prices.length === 0) heroText = "No active prices yet. An Admin can add them in Price History.";
  else
    heroText = `${prices.length} package price${prices.length === 1 ? "" : "s"} in use · last change on ${formatDate(
      lastChange
    )}.`;

  return (
    <StaffLayout pageTitle="Active Price List" pageSubtitle="Current package prices and payment terms">
      <div className="stfap-page">
        {/* ---------- Banner ---------- */}
        <section className="stfap-hero">
          <div className="stfap-hero-glow" aria-hidden="true" />
          <div className="stfap-hero-icon">
            <Tag size={26} />
          </div>
          <div className="stfap-hero-text">
            <div className="stfap-hero-title">
              <h1>Active Price List</h1>
              <span className="stfap-readonly">
                <Lock size={12} />
                Read-only
              </span>
            </div>
            <p>{heroText}</p>
          </div>
          <div className="stfap-hero-actions">
            <button type="button" className="stfap-hero-btn glass" onClick={refresh} disabled={loading}>
              <RefreshCw size={16} className={loading ? "spin" : ""} />
              Refresh
            </button>
          </div>
        </section>

        <p className="stfap-rule">
          These are the prices used on quotations right now. To change a price, an Admin adds a new entry in
          Price History. The newest entry for each package becomes the active price.
        </p>

        {error ? (
          <div className="stfap-card">
            <div className="stfap-empty-state">
              <span className="stfap-empty-badge stfap-empty-badge-red">
                <AlertCircle size={26} />
              </span>
              <p className="stfap-empty-title">Something went wrong</p>
              <p className="stfap-empty-hint">{error}</p>
              <button type="button" className="stfap-btn-primary" onClick={refresh}>
                <RefreshCw size={15} />
                Try again
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="stfap-systems">
              <SystemCard
                icon={Zap}
                tone="blue"
                title="On-Grid PV System"
                hint="Connected to the power grid"
                systemLabel="On-Grid"
                prices={onGridPrices}
                loading={loading}
              />
              <SystemCard
                icon={BatteryCharging}
                tone="gold"
                title="Hybrid PV System"
                hint="Grid power with battery backup"
                systemLabel="Hybrid"
                prices={hybridPrices}
                loading={loading}
              />
            </div>

            {/* ---------- Payment terms ---------- */}
            <section className="stfap-card">
              <CardHead
                icon={CalendarCheck}
                tone="green"
                title="Active Payment Terms"
                hint={
                  paymentTerms && !loading
                    ? `Used on new quotations · since ${formatDate(paymentTerms.date_added)}`
                    : "Used on new quotations"
                }
              />

              {loading ? (
                <div className="stfap-terms">
                  <span className="stfap-skel stfap-skel-bar" />
                  <div className="stfap-steps">
                    {Array.from({ length: 2 }).map((_, i) => (
                      <div key={i} className="stfap-step">
                        <span className="stfap-skel stfap-skel-kw" />
                        <div className="stfap-skel-stack">
                          <span className="stfap-skel stfap-skel-w-sm" />
                          <span className="stfap-skel stfap-skel-w-md" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : termParts.length === 0 ? (
                <div className="stfap-empty-state small">
                  <span className="stfap-empty-badge">
                    <Inbox size={24} />
                  </span>
                  <p className="stfap-empty-title">No payment terms on record</p>
                  <p className="stfap-empty-hint">An Admin can add payment terms in Payment Terms History.</p>
                </div>
              ) : (
                <div className="stfap-terms">
                  {Math.abs(totalPercent - 100) < 1 && (
                    <div className="stfap-split" aria-hidden="true">
                      {termParts
                        .filter((part) => part.value > 0)
                        .map((part, i) => (
                          <span
                            key={i}
                            className={`stfap-split-part part-${i % 3}`}
                            style={{ flexGrow: part.value }}
                          >
                            {part.percent}
                          </span>
                        ))}
                    </div>
                  )}
                  <div className="stfap-steps">
                    {termParts.map((part, i) => (
                      <div key={i} className="stfap-step">
                        <span className={`stfap-step-percent part-${i % 3}`}>{part.percent || "—"}</span>
                        <div className="stfap-step-text">
                          <span className="stfap-step-label">Payment {i + 1}</span>
                          <span className="stfap-step-value">{part.text || "Of the total price"}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </StaffLayout>
  );
}