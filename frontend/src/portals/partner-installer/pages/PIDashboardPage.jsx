
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PILayout from '../components/PILayout';
import { getInstallerTickets } from '../../../api/piTickets';
import '../styles/pi-dashboard.css';

// How each ticket status counts toward the 4 stat cards.
// NOTE: the Ticket model has a COMPLETED status, but nothing in the
// backend ever sets it yet - APPROVED is currently the last real
// "successful" state a ticket reaches, so it's used as "Completed"
// here for now. Worth revisiting once the Assessment Sheet /
// installation-progress flow is built.
const NEW_ASSIGNED_STATUSES = ['PI_ASSIGNED'];
const IN_PROGRESS_STATUSES = ['ASSESSMENT_SUBMITTED', 'STAFF_REVIEW', 'ADMIN_REVIEW'];
const COMPLETED_STATUSES = ['APPROVED', 'COMPLETED'];
const NOT_COMPATIBLE_STATUSES = ['NC_CANNOT_PROCEED', 'NC_CAN_REAPPLY'];

const STATUS_BADGE_CLASS = {
  PI_ASSIGNED: 'assigned',
  ASSESSMENT_SUBMITTED: 'in-progress',
  STAFF_REVIEW: 'in-progress',
  ADMIN_REVIEW: 'in-progress',
  APPROVED: 'compatible',
  COMPLETED: 'compatible',
  NC_CANNOT_PROCEED: 'not-compatible',
  NC_CAN_REAPPLY: 'not-compatible',
  WITHDRAWN: 'withdrawn',
};

export default function PIDashboardPage() {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await getInstallerTickets();
        if (!cancelled) {
          setTickets(data);
          setError('');
        }
      } catch {
        if (!cancelled) setError('Could not load your tickets. Please try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const countByStatus = (statuses) => tickets.filter((t) => statuses.includes(t.status)).length;

  const statCards = [
    {
      label: 'New Assigned Tickets',
      value: countByStatus(NEW_ASSIGNED_STATUSES),
      note: 'Action required within 24hrs',
    },
    {
      label: 'In Progress',
      value: countByStatus(IN_PROGRESS_STATUSES),
      note: 'Active field installations',
    },
    {
      label: 'Completed',
      value: countByStatus(COMPLETED_STATUSES),
      note: 'This month',
    },
    {
      label: 'Not Compatible',
      value: countByStatus(NOT_COMPATIBLE_STATUSES),
      note: 'Require review',
    },
  ];

  const incomingRequests = [...tickets]
    .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
    .slice(0, 5);

  return (
    <PILayout
      pageTitle="Glomax Enterprises Solar Management Panel"
      pageSubtitle="Real-time metrics and alerts for your active territory"
    >
      {loading && <p className="pi-dashboard-loading">Loading...</p>}
      {error && <p className="pi-dashboard-error">{error}</p>}

      {!loading && !error && (
        <>
          <div className="pi-stat-grid">
            {statCards.map((card) => (
              <div className="pi-stat-card" key={card.label}>
                <p className="pi-stat-label">{card.label}</p>
                <p className="pi-stat-value">{card.value}</p>
                <p className="pi-stat-note">{card.note}</p>
              </div>
            ))}
          </div>

          <div className="pi-incoming">
            <div className="pi-incoming-header">
              <h2>Incoming Requests</h2>
              <button
                className="pi-view-all-button"
                onClick={() => navigate('/partner-installer/incoming-tickets')}
              >
                View All
              </button>
            </div>

            {incomingRequests.length === 0 ? (
              <p className="pi-incoming-empty">No tickets assigned yet.</p>
            ) : (
              <div className="pi-incoming-table">
                <div className="pi-incoming-row pi-incoming-head">
                  <span>Ticket Number</span>
                  <span>Customer Name</span>
                  <span>Visit Date</span>
                  <span>Status</span>
                  <span>Action</span>
                </div>

                {incomingRequests.map((t) => {
                  const badgeClass = STATUS_BADGE_CLASS[t.status] || 'in-progress';
                  return (
                    <div className="pi-incoming-row" key={t.id}>
                      <span className="pi-incoming-ticket">{t.ticket_number}</span>
                      <span>{t.full_name || t.customer_username}</span>
                      <span>
                        {t.visit_date
                          ? new Date(t.visit_date).toLocaleDateString()
                          : '—'}
                      </span>
                      <span>
                        <span className={`pi-status-badge ${badgeClass}`}>
                          {t.status_display}
                        </span>
                      </span>
                      <span>
                        <button
                          className="pi-action-button"
                          onClick={() => navigate(`/partner-installer/incoming-tickets/${t.id}`)}
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
    </PILayout>
  );
}