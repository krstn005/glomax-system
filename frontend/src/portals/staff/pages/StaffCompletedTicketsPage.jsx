import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import StaffLayout from "../components/StaffLayout";
import { getStaffTickets } from "../../../api/staffTickets";
import "../styles/staff-completed-tickets.css";

// Completed Tickets covers tickets that have nothing left to track:
// Approved/Completed and Not Compatible (a real outcome was reached),
// plus Withdrawn (the customer left before any outcome). Withdrawn is
// still its own separate tab rather than merged into Approved/Not
// Compatible, since it isn't a decision the team made - the customer
// opted out before staff ever reached one.
const FINISHED_STATUSES = ["APPROVED", "COMPLETED", "NC_CANNOT_PROCEED", "NC_CAN_REAPPLY", "WITHDRAWN"];

const TABS = [
  { key: "ALL", label: "All" },
  { key: "APPROVED", label: "Approved" },
  { key: "NOT_COMPATIBLE", label: "Not Compatible" },
  { key: "WITHDRAWN", label: "Withdrawn" },
];

const STATUS_BADGE_CLASS = {
  APPROVED: "approved",
  COMPLETED: "approved",
  NC_CANNOT_PROCEED: "not-compatible",
  NC_CAN_REAPPLY: "not-compatible",
  WITHDRAWN: "withdrawn",
};

const POLL_INTERVAL_MS = 15000;

export default function StaffCompletedTicketsPage() {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("ALL");
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load(isInitial) {
      try {
        const data = await getStaffTickets();
        if (cancelled) return;
        const finished = data.filter((t) => FINISHED_STATUSES.includes(t.status));
        setTickets(finished);
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
    if (activeTab === "APPROVED") return t.status === "APPROVED" || t.status === "COMPLETED";
    if (activeTab === "NOT_COMPATIBLE") {
      return t.status === "NC_CANNOT_PROCEED" || t.status === "NC_CAN_REAPPLY";
    }
    if (activeTab === "WITHDRAWN") return t.status === "WITHDRAWN";
    return true;
  }

  const filteredTickets = tickets
    .filter(matchesTab)
    .filter((t) => {
      const term = searchTerm.trim().toLowerCase();
      if (!term) return true;
      return (
        (t.full_name || t.customer_username).toLowerCase().includes(term) ||
        t.ticket_number.toLowerCase().includes(term)
      );
    })
    // Most recently finished first
    .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));

  return (
    <StaffLayout pageTitle="Completed Tickets" pageSubtitle="Record of tickets with no further action needed">
      {loading && <p className="stfct-loading">Loading...</p>}
      {error && <p className="stfct-error">{error}</p>}

      {!loading && !error && (
        <>
          <div className="stfct-toolbar">
            <div className="stfct-tabs">
              {TABS.map((tab) => (
                <button
                  key={tab.key}
                  className={`stfct-tab ${activeTab === tab.key ? "active" : ""}`}
                  onClick={() => setActiveTab(tab.key)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="stfct-search">
              <Search size={16} />
              <input
                type="text"
                placeholder="Search by customer or ticket #..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div className="stfct-table-card">
            {filteredTickets.length === 0 ? (
              <p className="stfct-empty">No tickets in this view.</p>
            ) : (
              <table className="stfct-table">
                <colgroup>
                  <col style={{ width: "13%" }} />
                  <col style={{ width: "22%" }} />
                  <col style={{ width: "18%" }} />
                  <col style={{ width: "15%" }} />
                  <col style={{ width: "20%" }} />
                  <col style={{ width: "12%" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>Ticket #</th>
                    <th>Customer</th>
                    <th>Partner Installer</th>
                    <th>Date Finished</th>
                    <th>Outcome</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTickets.map((t) => {
                    const badgeClass = STATUS_BADGE_CLASS[t.status] || "approved";
                    const initials = (t.full_name || t.customer_username).slice(0, 2).toUpperCase();
                    const finishedDate = t.completed_at || t.updated_at;

                    return (
                      <tr key={t.id}>
                        <td className="stfct-td-strong">{t.ticket_number}</td>
                        <td>
                          <div className="stfct-customer-cell">
                            <span className="stfct-row-avatar">{initials}</span>
                            {t.full_name || t.customer_username}
                          </div>
                        </td>
                        <td>{t.partner_installer_username || "—"}</td>
                        <td>{new Date(finishedDate).toLocaleDateString()}</td>
                        <td>
                          <span className={`stfct-status-badge ${badgeClass}`}>
                            {t.status_display}
                          </span>
                        </td>
                        <td>
                          <button
                            className="stfct-action-button"
                            onClick={() => navigate(`/staff/completed-tickets/${t.id}`)}
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