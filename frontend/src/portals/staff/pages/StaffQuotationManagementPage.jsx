import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import StaffLayout from "../components/StaffLayout";
import { getStaffTickets } from "../../../api/staffTickets";
import { formatCurrency } from "../../../utils/currency";
import "../styles/staff-quotation-management.css";

const EXCLUDED_STATUSES = ["NC_CANNOT_PROCEED", "NC_CAN_REAPPLY", "WITHDRAWN"];

const TABS = [
  { key: "ALL", label: "All" },
  { key: "NEEDS_QUOTATION", label: "Needs Updated Quotation" },
  { key: "ADMIN_REVIEW", label: "Awaiting Admin" },
  { key: "APPROVED", label: "Approved" },
];

const NEEDS_QUOTATION_STATUSES = ["ASSESSMENT_SUBMITTED", "STAFF_REVIEW"];

const POLL_INTERVAL_MS = 15000;

// Derives a quotation-specific status. A ticket with a Final Sheet is
// "Finalized" regardless of whether Quotation records exist for it -
// the Final Sheet's final_cost is the real, authoritative price once
// Admin has approved, even if Initial/Updated Quotation records were
// never created for this ticket (e.g. older test data).
function getQuotationStatus(ticket, initial, updated) {
  if (ticket.final_sheet) {
    return { label: "Finalized", className: "current" };
  }
  if (!initial) {
    return { label: "No Quotation Yet", className: "none" };
  }
  if (NEEDS_QUOTATION_STATUSES.includes(ticket.status) && !updated) {
    return { label: "Awaiting Update", className: "awaiting" };
  }
  if (!updated) {
    return { label: "Initial Sent", className: "initial" };
  }
  return { label: "Up to Date", className: "current" };
}

export default function StaffQuotationManagementPage() {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("ALL");

  useEffect(() => {
    let cancelled = false;

    async function load(isInitial) {
      try {
        const data = await getStaffTickets();
        if (cancelled) return;
        const active = data.filter((t) => !EXCLUDED_STATUSES.includes(t.status));
        setTickets(active);
        if (isInitial) setError("");
      } catch {
        if (isInitial) setError("Could not load tickets. Please try again.");
      } finally {
        if (isInitial) setLoading(false);
      }
    }

    load(true);
    const interval = setInterval(() => load(false), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  function matchesTab(t) {
    if (activeTab === "ALL") return true;
    if (activeTab === "NEEDS_QUOTATION") return NEEDS_QUOTATION_STATUSES.includes(t.status);
    return t.status === activeTab;
  }

  const filteredTickets = tickets.filter(matchesTab).filter((t) => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return true;
    return (
      t.customer_username.toLowerCase().includes(term) ||
      t.ticket_number.toLowerCase().includes(term)
    );
  });

  return (
    <StaffLayout pageTitle="Quotation Management" pageSubtitle="Manage quotations for active tickets">
      {loading && <p className="stfqm-loading">Loading...</p>}
      {error && <p className="stfqm-error">{error}</p>}

      {!loading && !error && (
        <>
          <div className="stfqm-toolbar">
            <div className="stfqm-tabs">
              {TABS.map((tab) => (
                <button
                  key={tab.key}
                  className={`stfqm-tab ${activeTab === tab.key ? "active" : ""}`}
                  onClick={() => setActiveTab(tab.key)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="stfqm-search">
              <Search size={16} />
              <input
                type="text"
                placeholder="Search by customer or ticket #..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div className="stfqm-table-card">
            {filteredTickets.length === 0 ? (
              <p className="stfqm-empty">No tickets in this view.</p>
            ) : (
              <table className="stfqm-table">
                <thead>
                  <tr>
                    <th>Ticket #</th>
                    <th>Customer</th>
                    <th>Quotation Status</th>
                    <th>Initial Quotation</th>
                    <th>Latest Updated Quotation</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTickets.map((t) => {
                    const initials = t.customer_username.slice(0, 2).toUpperCase();
                    const initial = t.quotations?.find((q) => q.quotation_type === "INITIAL");
                    const updated = [...(t.quotations || [])]
                      .filter((q) => q.quotation_type === "UPDATED")
                      .sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at))[0];
                    const qStatus = getQuotationStatus(t, initial, updated);

                    // Prefer the actual Updated Quotation record; if
                    // none exists but the ticket has a Final Sheet,
                    // show its final_cost instead - it's real, stored
                    // pricing data, not something invented for display.
                    const latestAmountSource = updated
                      ? { value: formatCurrency(updated.estimated_cost), isFinal: false }
                      : t.final_sheet
                      ? { value: formatCurrency(t.final_sheet.final_cost), isFinal: true }
                      : null;

                    return (
                      <tr key={t.id}>
                        <td className="stfqm-td-strong">{t.ticket_number}</td>
                        <td>
                          <div className="stfqm-customer-cell">
                            <span className="stfqm-row-avatar">{initials}</span>
                            {t.customer_username}
                          </div>
                        </td>
                        <td>
                          <span className={`stfqm-status-badge ${qStatus.className}`}>
                            {qStatus.label}
                          </span>
                        </td>
                        <td>{initial ? formatCurrency(initial.estimated_cost) : "—"}</td>
                        <td>
                          {latestAmountSource ? (
                            <>
                              {latestAmountSource.value}
                              {latestAmountSource.isFinal && (
                                <span className="stfqm-final-tag">Final</span>
                              )}
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td>
                          <button
                            className="stfqm-action-button"
                            onClick={() => navigate(`/staff/quotations/${t.id}`)}
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </StaffLayout>
  );
}