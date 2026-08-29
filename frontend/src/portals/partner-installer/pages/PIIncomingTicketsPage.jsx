import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PILayout from '../components/PILayout';
import { getInstallerTickets } from '../../../api/piTickets';
import '../styles/pi-incoming-tickets.css';

// "Incoming Tickets" only shows tickets still active in the PI's
// hands or waiting on someone else's next step - a ticket that's
// already Approved, Not Compatible, or Withdrawn belongs on Ticket
// History instead, not here.
const ACTIVE_STATUSES = ['PI_ASSIGNED', 'ASSESSMENT_SUBMITTED', 'STAFF_REVIEW', 'ADMIN_REVIEW'];

const STATUS_BADGE_CLASS = {
  PI_ASSIGNED: 'assigned',
  ASSESSMENT_SUBMITTED: 'in-progress',
  STAFF_REVIEW: 'in-progress',
  ADMIN_REVIEW: 'in-progress',
};

export default function PIIncomingTicketsPage() {
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

  const activeTickets = tickets
    .filter((t) => ACTIVE_STATUSES.includes(t.status))
    .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));

  return (
    <PILayout pageTitle="Incoming Tickets" pageSubtitle="Tickets assigned to you that still need action">
      {loading && <p className="pi-it-loading">Loading...</p>}
      {error && <p className="pi-it-error">{error}</p>}

      {!loading && !error && (
        <div className="pi-it-card">
          {activeTickets.length === 0 ? (
            <p className="pi-it-empty">No incoming tickets right now.</p>
          ) : (
            <div className="pi-it-table">
              <div className="pi-it-row pi-it-head">
                <span>Ref #</span>
                <span>Customer</span>
                <span>Property Address</span>
                <span>Visit Date</span>
                <span>Status</span>
                <span>Action</span>
              </div>

              {activeTickets.map((t) => {
                const badgeClass = STATUS_BADGE_CLASS[t.status] || 'in-progress';
                return (
                  <div className="pi-it-row" key={t.id}>
                    <span className="pi-it-ticket">{t.ticket_number}</span>
                    <span>{t.full_name || t.customer_username}</span>
                    <span>{t.property_address}</span>
                    <span>
                      {t.visit_date ? new Date(t.visit_date).toLocaleDateString() : '—'}
                    </span>
                    <span>
                      <span className={`pi-status-badge ${badgeClass}`}>{t.status_display}</span>
                    </span>
                    <span>
                      <button
                        className="pi-it-action-button"
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
      )}
    </PILayout>
  );
}