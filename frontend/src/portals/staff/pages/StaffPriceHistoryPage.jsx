import { useEffect, useState } from "react";
import { Info } from "lucide-react";
import StaffLayout from "../components/StaffLayout";
import { getPriceHistory } from "../../../api/staffQuotations";
import { formatCurrency } from "../../../utils/currency";
import "../styles/staff-price-history.css";

export default function StaffPriceHistoryPage() {
  const [prices, setPrices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const data = await getPriceHistory();
        setPrices(data);
      } catch {
        setError("Could not load Price History. Please try again.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const activePrices = prices.filter((p) => p.is_active);

  // Same fixed package list the Active Prices page uses, so a summary
  // card renders even if a package currently has no active entry.
  const summaryPackages = [
    { kw: 3, systemType: "ON_GRID", label: "3KW", tag: "Ongrid" },
    { kw: 6, systemType: "ON_GRID", label: "6KW", tag: "Ongrid" },
    { kw: 8, systemType: "ON_GRID", label: "8KW", tag: "Ongrid" },
    { kw: 10, systemType: "ON_GRID", label: "10KW", tag: "Ongrid" },
    { kw: 3, systemType: "HYBRID", label: "3KW", tag: "Hybrid" },
    { kw: 6, systemType: "HYBRID", label: "6KW", tag: "Hybrid" },
    { kw: 8, systemType: "HYBRID", label: "8KW", tag: "Hybrid" },
    { kw: 10, systemType: "HYBRID", label: "10KW", tag: "Hybrid" },
  ];

  return (
    <StaffLayout pageTitle="Price History">
      {loading && <p className="stfph-loading">Loading...</p>}
      {error && <p className="stfph-error">{error}</p>}

      {!loading && !error && (
        <>
          <div className="stfph-notice">
            <Info size={16} />
            <p>
              <strong>Read-only audit log.</strong> This is the full history of every
              price entry ever recorded. The latest entry per package automatically
              becomes the active price shown in the Active Price List.
            </p>
          </div>

          <h2 className="stfph-summary-title">Current Active Prices</h2>
          <div className="stfph-summary-grid">
            {summaryPackages.map((pkg) => {
              const match = activePrices.find(
                (p) => p.rated_capacity_kw == pkg.kw && p.system_type === pkg.systemType
              );
              return (
                <div
  className={`stfph-summary-card ${pkg.systemType === "HYBRID" ? "hybrid" : ""}`}
  key={`${pkg.systemType}-${pkg.kw}`}
>
  <p className="stfph-summary-label">
    {pkg.label} <span>{pkg.tag}</span>
  </p>
  <p className="stfph-summary-price">
    {match ? formatCurrency(match.price) : "—"}
  </p>
</div>
              );
            })}
          </div>

          <h2 className="stfph-table-title">Full History</h2>
          <div className="stfph-table-card">
            {prices.length === 0 ? (
              <p className="stfph-empty">No price entries on record.</p>
            ) : (
              <table className="stfph-table">
                <colgroup>
                  <col style={{ width: "22%" }} />
                  <col style={{ width: "14%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "16%" }} />
                  <col style={{ width: "18%" }} />
                  <col style={{ width: "20%" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>Package</th>
                    <th>System Type</th>
                    <th>KW</th>
                    <th>Price</th>
                    <th>Date Added</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {prices.map((p) => (
                    <tr key={p.id}>
                      <td className="stfph-td-strong">{p.package_name}</td>
                      <td>
                        <span className={`stfph-system-type ${p.system_type === "HYBRID" ? "hybrid" : "ongrid"}`}>
                          {p.system_type_display}
                        </span>
                      </td>
                      <td>{p.rated_capacity_kw}KW</td>
                      <td className="stfph-td-strong">{formatCurrency(p.price)}</td>
                      <td>
                        {new Date(p.date_added).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                      </td>
                      <td>
                        <span className={`stfph-status ${p.is_active ? "active" : "inactive"}`}>
                          {p.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </StaffLayout>
  );
}