import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Filter, ChevronDown } from "lucide-react";
import StaffLayout from "../components/StaffLayout";
import { getStaffTickets } from "../../../api/staffTickets";
import "../styles/staff-dashboard.css";

const RETURNED_FOR_REVISION_STATUS = "STAFF_REVIEW";

const TERMINAL_STATUSES = ["WITHDRAWN", "APPROVED", "NC_CANNOT_PROCEED", "NC_CAN_REAPPLY"];

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

const FILTER_OPTIONS = [
  { key: "ALL", label: "All" },
  { key: "APPROVED", label: "Approved" },
  { key: "WITHDRAWN", label: "Withdrawn" },
  { key: "IN_PROGRESS", label: "In Progress" },
  { key: "NOT_COMPATIBLE", label: "Not Compatible" },
];

const POLL_INTERVAL_MS = 15000;

export default function StaffDashboardPage() {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterKey, setFilterKey] = useState("ALL");

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

  const totalActive = tickets.filter((t) => !TERMINAL_STATUSES.includes(t.status)).length;
  const pendingAssignment = tickets.filter((t) => t.status === "REQUEST_SUBMITTED").length;
  const awaitingAssessmentReview = tickets.filter((t) => t.status === "ASSESSMENT_SUBMITTED").length;
  const awaitingAdminApproval = tickets.filter((t) => t.status === "ADMIN_REVIEW").length;
  const totalWithdrawn = tickets.filter((t) => t.status === "WITHDRAWN").length;

  const returnedForRevision = tickets.filter(
    (t) => t.status === RETURNED_FOR_REVISION_STATUS && t.admin_revision_notes
  );

  function matchesFilter(t) {
    if (filterKey === "ALL") return true;
    if (filterKey === "IN_PROGRESS") return STATUS_BADGE_CLASS[t.status] === "in-progress";
    if (filterKey === "NOT_COMPATIBLE") return STATUS_BADGE_CLASS[t.status] === "not-compatible";
    return t.status === filterKey;
  }

  const recentActivity = [...tickets]
    .filter(matchesFilter)
    .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
    .slice(0, 8);

  const summaryCards = [
    { label: "Total Active Tickets", value: totalActive },
    { label: "Pending Partner Installer Assignment", value: pendingAssignment },
    { label: "Assessment Submitted — Awaiting Review", value: awaitingAssessmentReview },
    { label: "Awaiting Admin Approval", value: awaitingAdminApproval },
    { label: "Total Withdrawn Requests", value: totalWithdrawn },
  ];

  const activeFilterLabel = FILTER_OPTIONS.find((f) => f.key === filterKey)?.label || "All";

  return (
    <StaffLayout pageTitle="Staff Dashboard" pageSubtitle="Overview of system activity">
      {loading && <p className="stf-dashboard-loading">Loading...</p>}
      {error && <p className="stf-dashboard-error">{error}</p>}

      {!loading && !error && (
        <>
          {returnedForRevision.length > 0 && (
            <div className="stf-revision-alert">
              <AlertTriangle size={20} />
              <span>
                {returnedForRevision.length} ticket
                {returnedForRevision.length > 1 ? "s" : ""} returned for revision by Admin
              </span>
              <button
                className="stf-revision-alert-button"
                onClick={() => alert(`Ticket(s): ${returnedForRevision.map((t) => t.ticket_number).join(", ")}`)}
              >
                View
              </button>
            </div>
          )}

          <div className="stf-summary-grid">
            {summaryCards.map((card) => (
              <div className="stf-summary-card" key={card.label}>
                <p className="stf-summary-value">{card.value}</p>
                <p className="stf-summary-label">{card.label}</p>
              </div>
            ))}
          </div>

          <div className="stf-recent-activity">
            <div className="stf-recent-header-row">
              <h2>Recent Activity</h2>
              <div className="stf-recent-controls">
                <div className="stf-filter-wrapper">
                  <button
                    className="stf-filter-button"
                    onClick={() => setFilterOpen((v) => !v)}
                  >
                    <Filter size={14} />
                    {activeFilterLabel}
                    <ChevronDown size={14} />
                  </button>
                  {filterOpen && (
                    <div className="stf-filter-dropdown">
                      {FILTER_OPTIONS.map((opt) => (
                        <button
                          key={opt.key}
                          className={`stf-filter-option ${filterKey === opt.key ? "active" : ""}`}
                          onClick={() => {
                            setFilterKey(opt.key);
                            setFilterOpen(false);
                          }}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button
                     className="stf-view-all-button"
                     onClick={() => navigate("/staff/manage-tickets")}
                >
                 Manage Tickets
               </button>
              </div>
            </div>

            {recentActivity.length === 0 ? (
              <p className="stf-recent-empty">No recent ticket activity.</p>
            ) : (
              <div className="stf-recent-table">
                <div className="stf-recent-row stf-recent-head">
                  <span>Ticket #</span>
                  <span>Customer</span>
                  <span>Partner Installer</span>
                  <span>Last Updated</span>
                  <span>Status</span>
                  <span>Action</span>
                </div>

                {recentActivity.map((t) => {
                  const badgeClass = STATUS_BADGE_CLASS[t.status] || "in-progress";
                  const initials = t.customer_username.slice(0, 2).toUpperCase();
                  return (
                    <div className="stf-recent-row" key={t.id}>
                      <span className="stf-recent-ticket">{t.ticket_number}</span>
                      <span className="stf-recent-customer-cell">
                        <span className="stf-recent-avatar">{initials}</span>
                        {t.customer_username}
                      </span>
                      <span className="stf-recent-installer">
                        {t.partner_installer_username || "—"}
                      </span>
                      <span className="stf-recent-date">
                        {new Date(t.updated_at).toLocaleDateString()}
                      </span>
                      <span>
                        <span className={`stf-status-badge ${badgeClass}`}>
                          {t.status_display}
                        </span>
                      </span>
                      <span>
                        <button
                          className="stf-recent-action-button"
                          onClick={() => navigate(`/staff/manage-tickets/${t.id}`)}
                        >
                          View
                        </button>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </StaffLayout>
  );
}