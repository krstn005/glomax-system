import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import StaffLayout from "../components/StaffLayout";
import { getStaffTickets } from "../../../api/staffTickets";
import { formatCurrency } from "../../../utils/currency";
import "../styles/staff-quotation-management.css";

// Quotation Management shows every active ticket, Request Submitted
// through Approved - only closed tickets (Not Compatible in either
// form, or Withdrawn) are excluded, since those need no further
// price management.
const EXCLUDED_STATUSES = ["NC_CANNOT_PROCEED", "NC_CAN_REAPPLY", "WITHDRAWN"];

const TABS = [
  { key: "ALL", label: "All" },
  { key: "NEEDS_QUOTATION", label: "Needs Updated Quotation" },
  { key: "ADMIN_REVIEW", label: "Awaiting Admin" },
  { key: "APPROVED", label: "Approved" },
];

// Statuses where Staff can (or soon will need to) send an Updated
// Quotation - matches the same two moments the detail page's form
// is unlocked for.
const NEEDS_QUOTATION_STATUSES = ["ASSESSMENT_SUBMITTED", "STAFF_REVIEW"];

const STATUS_BADGE_CLASS = {
  APPROVED: "approved",
  COMPLETED: "approved",
  REQUEST_SUBMITTED: "in-progress",
  PI_ASSIGNED: "in-progress",
  ASSESSMENT_SUBMITTED: "in-progress",
  STAFF_REVIEW: "in-progress",
  ADMIN_REVIEW: "in-progress",
};

const POLL_INTERVAL_MS = 15000;

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
                    <th>Status</th>
                    <th>Initial Quotation</th>
                    <th>Latest Updated Quotation</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTickets.map((t) => {
                    const badgeClass = STATUS_BADGE_CLASS[t.status] || "in-progress";
                    const initials = t.customer_username.slice(0, 2).toUpperCase();
                    const initial = t.quotations?.find((q) => q.quotation_type === "INITIAL");
                    const updated = [...(t.quotations || [])]
                      .filter((q) => q.quotation_type === "UPDATED")
                      .sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at))[0];

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
                          <span className={`stfqm-status-badge ${badgeClass}`}>
                            {t.status_display}
                          </span>
                        </td>
                        <td>{initial ? formatCurrency(initial.estimated_cost) : "—"}</td>
                        <td>{updated ? formatCurrency(updated.estimated_cost) : "—"}</td>
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