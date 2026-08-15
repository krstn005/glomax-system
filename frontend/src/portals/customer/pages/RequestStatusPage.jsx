import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getMyTickets } from '../../../api/tickets';
import CustomerLayout from '../components/CustomerLayout';
import '../styles/request-status.css';

function getBadgeClass(status) {
  if (status === 'APPROVED') return 'rs-badge rs-badge-green';
  if (status === 'NC_CANNOT_PROCEED' || status === 'NC_CAN_REAPPLY') return 'rs-badge rs-badge-red';
  if (status === 'WITHDRAWN') return 'rs-badge rs-badge-gray';
  return 'rs-badge rs-badge-blue';
}

function getBadgeLabel(ticket) {
  return ticket.status_display;
}

export default function RequestStatusPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const data = await getMyTickets();
        setTickets(data);
        setError('');
      } catch (err) {
        setError('Could not load your requests. Please try again.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const selectedId = searchParams.get('ticket');
  const activeTicket = tickets.find(
    (t) => !['APPROVED', 'WITHDRAWN', 'NC_CANNOT_PROCEED'].includes(t.status)
  );
  const sortedTickets = [...tickets].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const ticket = selectedId
    ? tickets.find((t) => String(t.id) === selectedId)
    : activeTicket || sortedTickets[0];

  function handleSelectChange(e) {
    setSearchParams({ ticket: e.target.value });
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  if (loading) {
    return (
      <CustomerLayout pageTitle="Request Status">
        <p className="rs-loading">Loading...</p>
      </CustomerLayout>
    );
  }

  if (error) {
    return (
      <CustomerLayout pageTitle="Request Status">
        <p className="rs-error">{error}</p>
      </CustomerLayout>
    );
  }

  if (!ticket) {
    return (
      <CustomerLayout pageTitle="Request Status">
        <p className="rs-empty">You don't have any requests yet.</p>
      </CustomerLayout>
    );
  }

  const isWithdrawn = ticket.status === 'WITHDRAWN';
  const isNotCompatible = ['NC_CANNOT_PROCEED', 'NC_CAN_REAPPLY'].includes(ticket.status);
  const isApproved = ticket.status === 'APPROVED';
  const hasAssessment = Boolean(ticket.assessment);
  const hasDecision = isApproved || isNotCompatible || isWithdrawn;
  const hasCompleted = isApproved;

  return (
    <CustomerLayout>
      <div className="rs-heading">
        <h1>Request Status</h1>
        <p>{ticket.ticket_number} — {formatDate(ticket.created_at)}</p>
      </div>

      {sortedTickets.length > 1 && (
        <div className="rs-selector">
          <label>Viewing:</label>
          <select value={ticket.id} onChange={handleSelectChange}>
            {sortedTickets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.ticket_number} — {t.status_display}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="rs-card">
        <div className="rs-card-top">
          <div>
            <h2>{ticket.ticket_number}</h2>
            <p className="rs-card-date">{formatDate(ticket.created_at)}</p>
          </div>
          <span className={getBadgeClass(ticket.status)}>{getBadgeLabel(ticket)}</span>
        </div>

        <div className="rs-timeline">
          <div className="rs-tl-item">
            <div className="rs-tl-dot done">✓</div>
            <div className="rs-tl-line" />
            <div className="rs-tl-content">
              <p className="rs-tl-title">Submitted</p>
              <p className="rs-tl-date">{formatDate(ticket.created_at)}</p>
            </div>
          </div>

          <div className="rs-tl-item">
            <div className={`rs-tl-dot ${hasAssessment ? 'done' : 'current'}`}>
              {hasAssessment ? '✓' : ''}
            </div>
            <div className="rs-tl-line" />
            <div className="rs-tl-content">
              <p className={`rs-tl-title ${!hasAssessment ? 'pending' : ''}`}>Assessment</p>
              {/* ⚠️ Check this field name against your AssessmentSerializer */}
              <p className="rs-tl-date">{hasAssessment ? formatDate(ticket.assessment?.submitted_at) : ''}</p>
            </div>
          </div>

          <div className="rs-tl-item">
            <div className={`rs-tl-dot ${hasDecision ? 'done' : hasAssessment ? 'current' : 'pending'}`}>
              {hasDecision ? '✓' : ''}
            </div>
            <div className="rs-tl-line" />
            <div className="rs-tl-content">
              <p className={`rs-tl-title ${!hasDecision ? 'pending' : ''}`}>Decision</p>
              <p className="rs-tl-date">
                {hasDecision ? formatDate(ticket.completed_at || ticket.withdrawn_at || ticket.updated_at) : ''}
              </p>
            </div>
          </div>

          <div className="rs-tl-item rs-tl-item-last">
            <div className={`rs-tl-dot ${hasCompleted ? 'done' : 'pending'}`}>
              {hasCompleted ? '✓' : ''}
            </div>
            <div className="rs-tl-content">
              <p className={`rs-tl-title ${!hasCompleted ? 'pending' : ''}`}>Completed</p>
              <p className="rs-tl-date">{hasCompleted ? formatDate(ticket.completed_at) : ''}</p>
            </div>
          </div>
        </div>

        {/* ⚠️ Verify this is the right field for the rejection/not-compatible reason */}
        {isNotCompatible && ticket.admin_revision_notes && (
          <div className="rs-reason-box">
            Reason: {ticket.admin_revision_notes}
          </div>
        )}

        {isWithdrawn && (
          <div className="rs-reason-box rs-reason-gray">
            This request was withdrawn.
          </div>
        )}

        {!isNotCompatible && !isWithdrawn && (
          <div className="rs-info-grid">
            <div>
              <p className="rs-info-label">Package</p>
              <p className="rs-info-value">{ticket.solar_package}</p>
            </div>
            <div>
              <p className="rs-info-label">Address</p>
              <p className="rs-info-value">{ticket.property_address}</p>
            </div>
            <div>
              <p className="rs-info-label">Technician</p>
              <p className="rs-info-value">{ticket.partner_installer_username || '—'}</p>
            </div>
            <div>
              <p className="rs-info-label">{isApproved ? 'Total Price' : 'Estimated Price'}</p>
              <p className="rs-info-value">
                ₱{(ticket.final_sheet?.final_cost || ticket.quotations?.[0]?.estimated_cost || 0).toLocaleString()}
              </p>
            </div>
          </div>
        )}
      </div>
    </CustomerLayout>
  );
}