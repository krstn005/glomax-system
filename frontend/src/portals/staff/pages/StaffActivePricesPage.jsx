import { useEffect, useState } from "react";
import { Info } from "lucide-react";
import StaffLayout from "../components/StaffLayout";
import { getPriceHistory, getPaymentTerms } from "../../../api/staffQuotations";
import { formatCurrency } from "../../../utils/currency";
import "../styles/staff-active-prices.css";

export default function StaffActivePricesPage() {
  const [prices, setPrices] = useState([]);
  const [paymentTerms, setPaymentTerms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const [priceData, termsData] = await Promise.all([
          getPriceHistory(),
          getPaymentTerms(),
        ]);
        setPrices(priceData.filter((p) => p.is_active));
        setPaymentTerms(termsData.slice(0, 1));
      } catch {
        setError("Could not load pricing data. Please try again.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const onGridPrices = prices
    .filter((p) => p.system_type === "ON_GRID")
    .sort((a, b) => a.rated_capacity_kw - b.rated_capacity_kw);
  const hybridPrices = prices
    .filter((p) => p.system_type === "HYBRID")
    .sort((a, b) => a.rated_capacity_kw - b.rated_capacity_kw);

  const termsSegments = paymentTerms[0]
    ? paymentTerms[0].description.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  function segmentHeadline(segment) {
    const match = segment.match(/^(\d+%)\s*(.*)$/);
    if (match) {
      return { headline: match[1], rest: match[2] };
    }
    return { headline: segment, rest: "" };
  }

  return (
    <StaffLayout pageTitle="Active Price List">
      {loading && <p className="stfap-loading">Loading...</p>}
      {error && <p className="stfap-error">{error}</p>}

      {!loading && !error && (
        <>
          <div className="stfap-notice">
            <Info size={16} />
            <p>
              <strong>Read-only view.</strong> These are the currently active prices. To
              change a price, an Admin adds a new entry in Price History — the latest
              entry per package automatically becomes the active price.
            </p>
          </div>

          <div className="stfap-group-header">
            <span className="stfap-dot ongrid" />
            <h2>On-Grid PV System</h2>
          </div>
          {onGridPrices.length === 0 ? (
            <p className="stfap-empty">No active On-Grid prices on record.</p>
          ) : (
            <div className="stfap-price-grid">
              {onGridPrices.map((p) => (
                <div className="stfap-price-card" key={p.id}>
                  <div className="stfap-price-top">
                    <span className="stfap-price-kw">{p.rated_capacity_kw}KW</span>
                    <span className="stfap-price-tag ongrid">Ongrid</span>
                  </div>
                  <p className="stfap-price-value">{formatCurrency(p.price)}</p>
                  <p className="stfap-price-date">
                    Effective {new Date(p.date_added).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                  </p>
                  <p className="stfap-price-readonly">Read-only — update via Price History</p>
                </div>
              ))}
            </div>
          )}

          <div className="stfap-group-header">
            <span className="stfap-dot hybrid" />
            <h2>Hybrid PV System</h2>
          </div>
          {hybridPrices.length === 0 ? (
            <p className="stfap-empty">No active Hybrid prices on record.</p>
          ) : (
            <div className="stfap-price-grid">
              {hybridPrices.map((p) => (
                <div className="stfap-price-card" key={p.id}>
                  <div className="stfap-price-top">
                    <span className="stfap-price-kw">{p.rated_capacity_kw}KW</span>
                    <span className="stfap-price-tag hybrid">Hybrid</span>
                  </div>
                  <p className="stfap-price-value">{formatCurrency(p.price)}</p>
                  <p className="stfap-price-date">
                    Effective {new Date(p.date_added).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                  </p>
                  <p className="stfap-price-readonly">Read-only — update via Price History</p>
                </div>
              ))}
            </div>
          )}

          <div className="stfap-group-header">
            <h2>Active Payment Terms</h2>
          </div>
          {termsSegments.length === 0 ? (
            <p className="stfap-empty">No Payment Terms on record.</p>
          ) : (
            <div className="stfap-price-grid">
              {termsSegments.map((segment, i) => {
                const { headline, rest } = segmentHeadline(segment);
                return (
                  <div className="stfap-price-card" key={i}>
                    <p className="stfap-terms-headline">{headline}</p>
                    <p className="stfap-terms-rest">{rest || segment}</p>
                    <p className="stfap-price-date">
                      {new Date(paymentTerms[0].date_added).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </StaffLayout>
  );
}