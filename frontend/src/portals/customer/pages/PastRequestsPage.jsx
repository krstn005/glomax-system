import { useEffect, useState } from 'react';
import { getMyTickets } from '../../../api/tickets';
import CustomerLayout from '../components/CustomerLayout';
import '../styles/past-requests.css';

const ACTIVE_STATUSES = ['REQUEST_SUBMITTED', 'PI_ASSIGNED', 'ASSESSMENT_SUBMITTED', 'STAFF_REVIEW', 'ADMIN_REVIEW'];

function getBadgeClass(status) {
  if (status === 'APPROVED') return 'pr-badge pr-badge-green';
  if (status === 'NC_CANNOT_PROCEED' || status === 'NC_CAN_REAPPLY') return 'pr-badge pr-badge-red';
  if (status === 'WITHDRAWN') return 'pr-badge pr-badge-gray';
  return 'pr-badge pr-badge-blue';
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export default function PastRequestsPage() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedTicket, setSelectedTicket] = useState(null);

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

  const pastTickets = tickets
    .filter((t) => !ACTIVE_STATUSES.includes(t.status))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  return (
    <CustomerLayout pageTitle="Past Requests" pageSubtitle="All previously submitted schedule requests">
      {loading && <p className="pr-loading">Loading...</p>}
      {error && <p className="pr-error">{error}</p>}

      {!loading && !error && (
        pastTickets.length === 0 ? (
          <p className="pr-empty">You don't have any past requests yet.</p>
        ) : (
          <div className="pr-table-wrap">
            <table className="pr-table">
              <thead>
                <tr>
                  <th>Ref #</th>
                  <th>Date Submitted</th>
                  <th>Address</th>
                  <th>Package</th>
                  <th>System Type</th>
                  <th>Final Price</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pastTickets.map((t) => (
                  <tr key={t.id}>
                    <td className="pr-td-strong">{t.ticket_number}</td>
                    <td>{formatDate(t.created_at)}</td>
                    <td>{t.property_address}</td>
                    <td>{t.solar_package}</td>
                    <td>{t.system_type}</td>
                    <td>
                      ₱{(t.final_sheet?.final_cost || t.quotations?.[0]?.estimated_cost || 0).toLocaleString()}
                    </td>
                    <td>
                      <span className={getBadgeClass(t.status)}>{t.status_display}</span>
                    </td>
                    <td>
                      <button className="pr-view-btn" onClick={() => setSelectedTicket(t)}>
                        View Sheet
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      <div className="pr-new-btn-wrap">
        <a href="/new-request" className="pr-new-btn">+ Submit New Request</a>
      </div>

      {selectedTicket && (
        <div className="pr-modal-overlay" onClick={() => setSelectedTicket(null)}>
          <div className="pr-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pr-modal-header">
              <div>
                <span className="pr-modal-ticket">{selectedTicket.ticket_number}</span>
                <span className={getBadgeClass(selectedTicket.status)}>{selectedTicket.status_display}</span>
                <p className="pr-modal-subdate">Request submitted on {formatDate(selectedTicket.created_at)}</p>
              </div>
              <button className="pr-modal-close" onClick={() => setSelectedTicket(null)}>✕</button>
            </div>

            <div className="pr-modal-body">
              <p className="pr-section-label">Customer Information</p>
              <div className="pr-info-box">
                <div className="pr-info-row">
                  <span>Full Name</span>
                  <strong>{selectedTicket.customer_username}</strong>
                </div>
                <div className="pr-info-row">
                  <span>Contact Number</span>
                  <strong>{selectedTicket.contact_number}</strong>
                </div>
                <div className="pr-info-row">
                  <span>Address</span>
                  <strong>{selectedTicket.property_address}</strong>
                </div>
              </div>

              <p className="pr-section-label">Request Details</p>
              <div className="pr-info-box">
                <div className="pr-info-row">
                  <span>Reference No.</span>
                  <strong>{selectedTicket.ticket_number}</strong>
                </div>
                <div className="pr-info-row">
                  <span>Date Submitted</span>
                  <strong>{formatDate(selectedTicket.created_at)}</strong>
                </div>
                <div className="pr-info-row">
                  <span>Preferred Package</span>
                  <strong>{selectedTicket.solar_package}</strong>
                </div>
                <div className="pr-info-row">
                  <span>System Type</span>
                  <strong>{selectedTicket.system_type}</strong>
                </div>
                <div className="pr-info-row">
                  <span>Assigned Technician</span>
                  <strong>{selectedTicket.partner_installer_username || '—'}</strong>
                </div>
                <div className="pr-info-row">
                  <span>Final Price</span>
                  <strong>
                    ₱{(selectedTicket.final_sheet?.final_cost || selectedTicket.quotations?.[0]?.estimated_cost || 0).toLocaleString()}
                  </strong>
                </div>
              </div>

              {selectedTicket.status === 'NC_CANNOT_PROCEED' || selectedTicket.status === 'NC_CAN_REAPPLY' ? (
                selectedTicket.admin_revision_notes && (
                  <>
                    <p className="pr-section-label">Reason</p>
                    <div className="pr-reason-box">{selectedTicket.admin_revision_notes}</div>
                  </>
                )
              ) : null}
            </div>
          </div>
        </div>
      )}
    </CustomerLayout>
  );
}