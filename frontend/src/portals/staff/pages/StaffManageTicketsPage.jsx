import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import StaffLayout from "../components/StaffLayout";
import { getStaffTickets } from "../../../api/staffTickets";
import "../styles/staff-manage-tickets.css";

const TABS = [
  { key: "ALL", label: "All" },
  { key: "REQUEST_SUBMITTED", label: "New Requests" },
  { key: "PI_ASSIGNED", label: "Assigned" },
  { key: "ASSESSMENT_SUBMITTED", label: "Under Assessment" },
  { key: "STAFF_REVIEW", label: "Staff Review" },
  { key: "ADMIN_REVIEW", label: "Admin Review" },
  { key: "WITHDRAWN", label: "Withdrawn" },
];

const STATUS_BADGE_CLASS = {
  APPROVED: "approved",
  COMPLETED: "approved",
  WITHDRAWN: "withdrawn",
  NC_CANNOT_PROCEED: "not-compatible",
  NC_CAN_REAPPLY: "not-compatible",
  REQUEST_SUBMITTED: "in-progress",
  PI_ASSIGNED: "in-progress",
  ASSESSMENT_SUBMITTED: "in-progress",
  STAFF_REVIEW: "in-progress",
  ADMIN_REVIEW: "in-progress",
};

const POLL_INTERVAL_MS = 15000;

export default function StaffManageTicketsPage() {
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
        setTickets(data);
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

  // "All" is the default working view - Withdrawn tickets are kept out
  // of it since they no longer need monitoring or action, but stay
  // reachable via their own tab rather than a separate page.
  function matchesTab(t) {
    if (activeTab === "ALL") return t.status !== "WITHDRAWN";
    return t.status === activeTab;
  }

  const filteredTickets = tickets
    .filter(matchesTab)
    .filter((t) => {
      const term = searchTerm.trim().toLowerCase();
      if (!term) return true;
      return (
        t.customer_username.toLowerCase().includes(term) ||
        t.ticket_number.toLowerCase().includes(term)
      );
    });

  return (
    <StaffLayout pageTitle="Ticket Tracking" pageSubtitle="Monitor ticket status and assign Partner Installers">
      {loading && <p className="stftp-loading">Loading...</p>}
      {error && <p className="stftp-error">{error}</p>}

      {!loading && !error && (
        <>
          <div className="stftp-toolbar">
            <div className="stftp-tabs">
              {TABS.map((tab) => (
                <button
                  key={tab.key}
                  className={`stftp-tab ${activeTab === tab.key ? "active" : ""}`}
                  onClick={() => setActiveTab(tab.key)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="stftp-search">
              <Search size={16} />
              <input
                type="text"
                placeholder="Search by name or ticket #..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div className="stftp-table-card">
            {filteredTickets.length === 0 ? (
              <p className="stftp-empty">No tickets in this view.</p>
            ) : (
              <table className="stftp-table">
                <colgroup>
                  <col className="col-ticket" />
                  <col className="col-customer" />
                  <col className="col-installer" />
                  <col className="col-date" />
                  <col className="col-status" />
                  <col className="col-action" />
                </colgroup>
                <thead>
                  <tr>
                    <th>Ticket #</th>
                    <th>Customer</th>
                    <th>Partner Installer</th>
                    <th>Date</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTickets.map((t) => {
                    const badgeClass = STATUS_BADGE_CLASS[t.status] || "in-progress";
                    const canAssign = t.status === "REQUEST_SUBMITTED";
                    const initials = t.customer_username.slice(0, 2).toUpperCase();

                    return (
                      <tr key={t.id}>
                        <td className="stftp-td-strong">{t.ticket_number}</td>
                        <td>
                          <div className="stftp-customer-cell">
                            <span className="stftp-row-avatar">{initials}</span>
                            {t.customer_username}
                          </div>
                        </td>
                        <td>{t.partner_installer_username || "—"}</td>
                        <td>{new Date(t.created_at).toLocaleDateString()}</td>
                        <td>
                          <span className={`stftp-status-badge ${badgeClass}`}>
                            {t.status_display}
                          </span>
                        </td>
                        <td>
                          {canAssign ? (
                            <button
                              className="stftp-action-button assign"
                              onClick={() => navigate(`/staff/manage-tickets/${t.id}`)}
                            >
                              Assign
                            </button>
                          ) : (
                            <button
                              className="stftp-action-button view"
                              onClick={() => navigate(`/staff/manage-tickets/${t.id}`)}
                            >
                              View
                            </button>
                          )}
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