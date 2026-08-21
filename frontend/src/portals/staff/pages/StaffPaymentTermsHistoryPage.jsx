import { useEffect, useState } from "react";
import { Info } from "lucide-react";
import StaffLayout from "../components/StaffLayout";
import { getPaymentTerms } from "../../../api/staffQuotations";
import "../styles/staff-payment-terms-history.css";

export default function StaffPaymentTermsHistoryPage() {
  const [terms, setTerms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const data = await getPaymentTerms();
        setTerms(data);
      } catch {
        setError("Could not load Payment Terms History. Please try again.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function parseSegments(entry) {
    return entry.description
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((segment) => {
        const match = segment.match(/^(\d+%)\s*(.*)$/);
        return match
          ? { percent: match[1], label: match[2] || segment }
          : { percent: null, label: segment };
      });
  }

  // The most recent entry's segments are what's currently "active" -
  // matches the same "latest entry becomes current" pattern used on
  // Active Prices, applied here to Payment Terms instead.
  const latestEntry = terms[0];
  const currentSegments = latestEntry ? parseSegments(latestEntry) : [];

  return (
    <StaffLayout pageTitle="Payment Terms History">
      {loading && <p className="stfpt-loading">Loading...</p>}
      {error && <p className="stfpt-error">{error}</p>}

      {!loading && !error && (
        <>
          <div className="stfpt-notice">
            <Info size={16} />
            <p>
              <strong>Read-only audit log.</strong> This is the full history of every
              Payment Terms entry ever recorded. The most recently added entry is the
              one currently used on new quotations.
            </p>
          </div>

          <h2 className="stfpt-summary-title">Current Payment Terms</h2>
          {currentSegments.length === 0 ? (
            <p className="stfpt-empty">No Payment Terms on record.</p>
          ) : (
            <div className="stfpt-summary-grid">
              {currentSegments.map((seg, i) => (
                <div className="stfpt-summary-card" key={i}>
                  <p className="stfpt-summary-percent">{seg.percent || "—"}</p>
                  <p className="stfpt-summary-label">{seg.label}</p>
                  <p className="stfpt-summary-date">
                    {new Date(latestEntry.date_added).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                  </p>
                </div>
              ))}
            </div>
          )}

          <h2 className="stfpt-table-title">Full History</h2>
          <div className="stfpt-table-card">
            {terms.length === 0 ? (
              <p className="stfpt-empty">No Payment Terms entries on record.</p>
            ) : (
              <table className="stfpt-table">
                <colgroup>
                  <col style={{ width: "60%" }} />
                  <col style={{ width: "22%" }} />
                  <col style={{ width: "18%" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>Payment Terms</th>
                    <th>Effective Since</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {terms.map((entry, i) => (
                    <tr key={entry.id}>
                      <td className="stfpt-td-strong">{entry.description}</td>
                      <td>
                        {new Date(entry.date_added).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                      </td>
                      <td>
                        <span className={`stfpt-status ${i === 0 ? "current" : "past"}`}>
                          {i === 0 ? "Current" : "Past"}
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