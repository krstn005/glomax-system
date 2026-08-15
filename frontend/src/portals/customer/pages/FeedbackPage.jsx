import { useEffect, useState } from 'react';
import { getMyTickets } from '../../../api/tickets';
import { submitFeedback } from '../../../api/feedback';
import CustomerLayout from '../components/CustomerLayout';
import '../styles/feedback.css';

function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function StarRow({ value, onChange, readOnly }) {
  return (
    <div className="fb-stars">
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          className={`fb-star ${n <= value ? 'filled' : ''} ${readOnly ? '' : 'clickable'}`}
          onClick={() => !readOnly && onChange(n)}
        >
          ★
        </span>
      ))}
    </div>
  );
}

function FeedbackCard({ ticket, onSubmitted }) {
  const existing = ticket.feedback;
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit() {
    if (rating === 0) {
      setError('Please select a star rating.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await submitFeedback(ticket.id, { rating, comment });
      onSubmitted();
    } catch (err) {
      setError('Something went wrong submitting your feedback. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fb-card">
      <div className="fb-card-top">
        <div className="fb-card-icon">☀</div>
        <div className="fb-card-info">
          <div className="fb-card-title-row">
            <span className="fb-card-ticket">{ticket.ticket_number}</span>
            <span className="fb-badge">{ticket.status_display}</span>
          </div>
          <p className="fb-card-package">
            {ticket.solar_package} — {ticket.system_type}
          </p>
          <p className="fb-card-meta">
            {ticket.property_address} · {ticket.partner_installer_username || '—'} · {formatDate(ticket.created_at)}
            {ticket.final_sheet?.final_cost ? ` · ₱${ticket.final_sheet.final_cost.toLocaleString()}` : ''}
          </p>
        </div>
      </div>

      {existing ? (
        <div className="fb-submitted">
          <StarRow value={existing.rating} readOnly />
          <p className="fb-submitted-comment">
            {existing.comment}
            {existing.created_at ? ` — Submitted ${formatDate(existing.created_at)}` : ''}
          </p>
        </div>
      ) : (
        <div className="fb-form">
          <p className="fb-form-label">Your Rating</p>
          <StarRow value={rating} onChange={setRating} />
          <p className="fb-form-label">Comments</p>
          <textarea
            placeholder="Share your experience..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          {error && <p className="fb-error">{error}</p>}
          <button className="fb-submit-btn" disabled={submitting} onClick={handleSubmit}>
            {submitting ? 'Submitting...' : 'Submit Feedback'}
          </button>
        </div>
      )}
    </div>
  );
}

export default function FeedbackPage() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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

  useEffect(() => {
    load();
  }, []);

  const approvedTickets = tickets
    .filter((t) => t.status === 'APPROVED')
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const submittedCount = approvedTickets.filter((t) => t.feedback).length;

  return (
    <CustomerLayout>
      <div className="fb-heading">
        <h1>Customer Feedback</h1>
        <p>Rate and review your completed solar installations</p>
      </div>

      {loading && <p className="fb-loading">Loading...</p>}
      {error && <p className="fb-error">{error}</p>}

      {!loading && !error && (
        <>
          <div className="fb-banner">
            <div className="fb-banner-left">
              <div className="fb-banner-icon">★</div>
              <div>
                <p className="fb-banner-title">Your Feedback Matters</p>
                <p className="fb-banner-sub">Help us improve by sharing your experience with our installation team</p>
              </div>
            </div>
            <div className="fb-banner-right">
              <p className="fb-banner-count">{submittedCount}/{approvedTickets.length}</p>
              <p className="fb-banner-count-label">Reviews Submitted</p>
            </div>
          </div>

          {approvedTickets.length === 0 ? (
            <p className="fb-empty">Feedback will be available once your request is completed.</p>
          ) : (
            approvedTickets.map((t) => (
              <FeedbackCard key={t.id} ticket={t} onSubmitted={load} />
            ))
          )}
        </>
      )}
    </CustomerLayout>
  );
}