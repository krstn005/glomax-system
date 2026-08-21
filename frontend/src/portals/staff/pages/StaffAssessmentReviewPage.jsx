import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import StaffLayout from "../components/StaffLayout";
import { getStaffTickets } from "../../../api/staffTickets";
import "../styles/staff-assessment-review.css";

// Assessment Review deals with tickets whose Partner Installer has
// submitted a roof assessment - ASSESSMENT_SUBMITTED is the normal
// first pass, STAFF_REVIEW is the same decision step reopened after
// Admin returns a ticket for revision (matches TicketDecisionSerializer).
const REVIEWABLE_STATUSES = ["ASSESSMENT_SUBMITTED", "STAFF_REVIEW"];

const TABS = [
  { key: "NEEDS_REVIEW", label: "Needs Review" },
  { key: "ALL", label: "All Reviewed" },
];

const STATUS_BADGE_CLASS = {
  APPROVED: "approved",
  COMPLETED: "approved",
  NC_CANNOT_PROCEED: "not-compatible",
  NC_CAN_REAPPLY: "not-compatible",
  ADMIN_REVIEW: "in-progress",
  ASSESSMENT_SUBMITTED: "in-progress",
  STAFF_REVIEW: "in-progress",
};

const POLL_INTERVAL_MS = 15000;

export default function StaffAssessmentReviewPage() {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("NEEDS_REVIEW");
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load(isInitial) {
      try {
        const data = await getStaffTickets();
        if (cancelled) return;
        // "All Reviewed" only makes sense for tickets that had an
        // assessment submitted at all - excludes tickets still
        // waiting on the Partner Installer's site visit.
        const withAssessment = data.filter((t) => t.assessment);
        setTickets(withAssessment);
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
    if (activeTab === "NEEDS_REVIEW") return REVIEWABLE_STATUSES.includes(t.status);
    return true;
  }

  const filteredTickets = tickets.filter(matchesTab).filter((t) => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return true;
    return (
      (t.full_name || t.customer_username).toLowerCase().includes(term) ||
      t.ticket_number.toLowerCase().includes(term)
    );
  });

  return (
    <StaffLayout pageTitle="Assessment Review" pageSubtitle="Review submitted roof assessments and forward decisions">
      {loading && <p className="stfar-loading">Loading...</p>}
      {error && <p className="stfar-error">{error}</p>}

      {!loading && !error && (
        <>
          <div className="stfar-toolbar">
            <div className="stfar-tabs">
              {TABS.map((tab) => (
                <button
                  key={tab.key}
                  className={`stfar-tab ${activeTab === tab.key ? "active" : ""}`}
                  onClick={() => setActiveTab(tab.key)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="stfar-search">
              <Search size={16} />
              <input
                type="text"
                placeholder="Search by customer or ticket #..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div className="stfar-table-card">
            {filteredTickets.length === 0 ? (
              <p className="stfar-empty">No tickets in this view.</p>
            ) : (
              <table className="stfar-table">
                <colgroup>
                  <col style={{ width: "13%" }} />
                  <col style={{ width: "22%" }} />
                  <col style={{ width: "20%" }} />
                  <col style={{ width: "15%" }} />
                  <col style={{ width: "18%" }} />
                  <col style={{ width: "12%" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>Ticket #</th>
                    <th>Customer</th>
                    <th>Partner Installer</th>
                    <th>Submitted</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTickets.map((t) => {
                    const badgeClass = STATUS_BADGE_CLASS[t.status] || "in-progress";
                    const initials = (t.full_name || t.customer_username).slice(0, 2).toUpperCase();

                    return (
                      <tr key={t.id}>
                        <td className="stfar-td-strong">{t.ticket_number}</td>
                        <td>
                          <div className="stfar-customer-cell">
                            <span className="stfar-row-avatar">{initials}</span>
                            {t.full_name || t.customer_username}
                          </div>
                        </td>
                        <td>{t.partner_installer_username || "—"}</td>
                        <td>{new Date(t.assessment.submitted_at).toLocaleDateString()}</td>
                        <td>
                          <span className={`stfar-status-badge ${badgeClass}`}>
                            {t.status_display}
                          </span>
                        </td>
                        <td>
                          <button
                            className="stfar-action-button"
                            onClick={() => navigate(`/staff/assessment-review/${t.id}`)}
                          >
                            {REVIEWABLE_STATUSES.includes(t.status) ? "Review" : "View"}
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