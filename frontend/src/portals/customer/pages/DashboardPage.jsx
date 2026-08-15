import { useEffect, useState } from 'react';
import { getMyTickets, withdrawTicket } from '../../../api/tickets';
import CustomerLayout from '../components/CustomerLayout';
import '../styles/dashboard.css';

const STATUS_STEPS = [
  { key: 'REQUEST_SUBMITTED', label: 'Submitted' },
  { key: 'PI_ASSIGNED', label: 'Installer Assigned' },
  { key: 'ASSESSMENT_SUBMITTED', label: 'Assessment Submitted' },
  { key: 'STAFF_REVIEW', label: 'Staff Review' },
  { key: 'ADMIN_REVIEW', label: 'Admin Review' },
  { key: 'APPROVED', label: 'Approved' },
];

const NOT_COMPATIBLE_STATUSES = ['NC_CANNOT_PROCEED', 'NC_CAN_REAPPLY'];

function getBadgeClass(status) {
  if (status === 'APPROVED') return 'badge badge-green';
  if (NOT_COMPATIBLE_STATUSES.includes(status)) return 'badge badge-red';
  if (status === 'WITHDRAWN') return 'badge badge-gray';
  return 'badge badge-navy';
}

export default function DashboardPage() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionBusy, setActionBusy] = useState(false);

  useEffect(() => {
    loadTickets();
  }, []);

  async function loadTickets() {
    try {
      setLoading(true);
      const data = await getMyTickets();
      setTickets(data);
      setError('');
    } catch  {
      setError('Could not load your requests. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const activeTicket = tickets.find(
    (t) => !['APPROVED', 'WITHDRAWN', 'NC_CANNOT_PROCEED'].includes(t.status)
  );

  const recentTickets = [...tickets]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 5);

  const firstName = (localStorage.getItem('username') || 'there').split(' ')[0];

  async function handleWithdraw(ticketId) {
    const confirmed = window.confirm('Are you sure you want to withdraw your request?');
    if (!confirmed) return;
    try {
      setActionBusy(true);
      await withdrawTicket(ticketId);
      await loadTickets();
    } catch {
      alert('Something went wrong withdrawing your request. Please try again.');
    } finally {
      setActionBusy(false);
    }
  }

  return (
    <CustomerLayout>
      <div className="db-heading">
        <h1>Welcome back, {firstName}!</h1>
        <p>Here's an overview of your roof assessment requests.</p>
      </div>

      {loading && <p className="db-loading">Loading your requests...</p>}
      {error && <p className="db-error">{error}</p>}

      {!loading && !error && activeTicket && (
        <div className="db-active-card">
          <div className="db-active-left">
            <div className="db-active-icon">☀</div>
            <div>
              <p className="db-active-title">
                Active Request — {activeTicket.ticket_number}
              </p>
              <p className="db-active-sub">
                {activeTicket.status_display}
                {activeTicket.property_address ? ` • ${activeTicket.property_address}` : ''}
              </p>
            </div>
          </div>

          {activeTicket.status === 'REQUEST_SUBMITTED' && (
            <button
              className="db-btn-white"
              disabled={actionBusy}
              onClick={() => handleWithdraw(activeTicket.id)}
            >
              Withdraw
            </button>
          )}

          {activeTicket.status === 'NC_CAN_REAPPLY' && (
            <a className="db-btn-white" href="/new-request">
              Reapply
            </a>
          )}
        </div>
      )}

      {!loading && !error && activeTicket && (
        <div className="db-progress-card">
          <div className="db-progress-steps">
            {STATUS_STEPS.map((step, index) => {
              const currentIndex = STATUS_STEPS.findIndex((s) => s.key === activeTicket.status);
              const isDone = currentIndex >= 0 && index <= currentIndex;
              return (
                <div key={step.key} className={`db-step ${isDone ? 'done' : ''}`}>
                  <div className="db-step-dot" />
                  <span>{step.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!loading && !error && activeTicket?.quotations?.length > 0 && (
        <div className="db-quote-row">
          {activeTicket.quotations
            .filter((q) => q.quotation_type === 'INITIAL')
            .map((q) => (
              <div key={q.id} className="db-quote-card">
                <p className="db-quote-title">Initial Quotation</p>
                <p className="db-quote-cost">₱{q.estimated_cost}</p>
                <p className="db-quote-terms">{q.payment_terms_description}</p>
              </div>
            ))}
          {activeTicket.quotations
            .filter((q) => q.quotation_type === 'UPDATED')
            .map((q) => (
              <div key={q.id} className="db-quote-card">
                <p className="db-quote-title">Updated Quotation</p>
                <p className="db-quote-cost">₱{q.estimated_cost}</p>
                <p className="db-quote-terms">{q.payment_terms_description}</p>
              </div>
            ))}
        </div>
      )}

      {!loading && !error && (
        <div className="db-table-card">
          <div className="db-table-header">
            <h2>Recent Requests</h2>
            <a href="/past-requests">View All</a>
          </div>

          {recentTickets.length === 0 ? (
            <p className="db-empty">You haven't submitted any requests yet.</p>
          ) : (
            <table className="db-table">
              <thead>
                <tr>
                  <th>Ref #</th>
                  <th>Date</th>
                  <th>Address</th>
                  <th>Package</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentTickets.map((t) => (
                  <tr key={t.id}>
                    <td className="db-td-strong">{t.ticket_number}</td>
                    <td>{new Date(t.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</td>
                    <td>{t.property_address}</td>
                    <td>{t.solar_package || '—'}</td>
                    <td>
                      <span className={getBadgeClass(t.status)}>{t.status_display}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </CustomerLayout>
  );
}