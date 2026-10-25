import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Star,
  Sun,
  Check,
  Send,
  MapPin,
  HardHat,
  CalendarDays,
  Wallet,
  AlertCircle,
  MessageSquareQuote,
  CheckCircle2,
  Clock,
  Search,
  SearchX,
  X,
  SlidersHorizontal,
  ChevronDown,
  Layers,
} from 'lucide-react';
import { getMyTickets } from '../../../api/tickets';
import { submitFeedback } from '../../../api/feedback';
import { formatCurrency } from '../../../utils/currency';
import { getServerErrorMessage } from '../../../utils/profileHelpers';
import CustomerLayout from '../components/CustomerLayout';
import '../styles/feedback.css';

const HIGHLIGHT_OPTIONS = [
  { value: 'PROFESSIONAL_TEAM', label: 'Professional Team' },
  { value: 'ON_TIME', label: 'On-Time' },
  { value: 'CLEAN_INSTALLATION', label: 'Clean Installation' },
  { value: 'QUALITY_MATERIALS', label: 'Quality Materials' },
  { value: 'FRIENDLY_STAFF', label: 'Friendly Staff' },
  { value: 'FAST_INSTALLATION', label: 'Fast Installation' },
];

const RATING_WORDS = {
  1: 'Poor',
  2: 'Fair',
  3: 'Good',
  4: 'Very Good',
  5: 'Excellent',
};

const COMMENT_LIMIT = 500;

// Choices in the Filter drop-down
const FILTER_OPTIONS = [
  { key: 'ALL', label: 'All Requests', icon: Layers, tone: 'navy' },
  { key: 'PENDING', label: 'Waiting for Review', icon: Clock, tone: 'gold' },
  { key: 'REVIEWED', label: 'Reviewed', icon: CheckCircle2, tone: 'green' },
];

function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function systemLabel(systemType) {
  return systemType === 'HYBRID' ? 'Hybrid' : 'On-Grid';
}

// Filter button beside the search box. When a filter is on, the button
// turns navy, shows the filter's name, and gets a small clear (x) button.
function FilterDropdown({ options, value, counts, onChange }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function handleClickOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    function handleKey(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const current = options.find((o) => o.key === value) || options[0];
  const CurrentIcon = current.icon;
  const isFiltered = value !== 'ALL';

  function pick(key) {
    onChange(key);
    setOpen(false);
  }

  return (
    <div className="fb-filter" ref={wrapRef}>
      <button
        type="button"
        className={`fb-filter-btn ${open ? 'open' : ''} ${isFiltered ? 'filtered' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Filter requests"
      >
        {isFiltered ? <CurrentIcon size={16} /> : <SlidersHorizontal size={16} />}
        <span className="fb-filter-text">{isFiltered ? current.label : 'Filter'}</span>
        <ChevronDown size={16} className="fb-filter-chevron" />
      </button>

      {isFiltered && (
        <button type="button" className="fb-filter-clear" onClick={() => onChange('ALL')} aria-label="Clear filter">
          <X size={14} />
        </button>
      )}

      {open && (
        <div className="fb-filter-menu" role="listbox" aria-label="Filter requests">
          {options.map((o) => {
            const Icon = o.icon;
            const isSelected = o.key === value;
            return (
              <button
                key={o.key}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={`fb-filter-option tone-${o.tone} ${isSelected ? 'selected' : ''}`}
                onClick={() => pick(o.key)}
              >
                <span className="fb-filter-option-icon">
                  <Icon size={15} />
                </span>
                <span className="fb-filter-option-label">{o.label}</span>
                <span className="fb-filter-option-count">{counts[o.key]}</span>
                <span className="fb-filter-check">{isSelected && <Check size={15} />}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Stars that light up on hover. Real buttons, so they also work with a keyboard.
function StarRating({ value, onChange, readOnly = false, size = 30 }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;

  return (
    <div className={`fb-stars ${readOnly ? 'read-only' : ''}`} onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((n) => {
        const active = n <= shown;
        const star = (
          <Star
            size={size}
            className="fb-star-icon"
            fill={active ? '#facc15' : 'none'}
            color={active ? '#eab308' : '#d1d5db'}
            strokeWidth={1.8}
          />
        );
        if (readOnly) {
          return (
            <span key={n} className="fb-star">
              {star}
            </span>
          );
        }
        return (
          <button
            key={n}
            type="button"
            className={`fb-star fb-star-btn ${active ? 'active' : ''}`}
            onMouseEnter={() => setHover(n)}
            onFocus={() => setHover(n)}
            onBlur={() => setHover(0)}
            onClick={() => onChange(n)}
            aria-label={`${n} star${n > 1 ? 's' : ''}`}
          >
            {star}
          </button>
        );
      })}
      {shown > 0 && <span className="fb-rating-word">{RATING_WORDS[shown]}</span>}
    </div>
  );
}

function MetaItem({ icon: Icon, children }) {
  return (
    <span className="fb-meta-item">
      <Icon size={14} />
      <span>{children}</span>
    </span>
  );
}

function FeedbackCard({ ticket, showThanks, onSubmitted }) {
  const existing = ticket.feedback;
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [highlights, setHighlights] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  function toggleHighlight(value) {
    setHighlights((prev) => (prev.includes(value) ? prev.filter((h) => h !== value) : [...prev, value]));
  }

  function pickRating(n) {
    setRating(n);
    setError('');
  }

  async function handleSubmit() {
    if (rating === 0) {
      setError('Please pick a star rating first.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await submitFeedback(ticket.id, { rating, comments: comment.trim(), highlights });
      await onSubmitted();
    } catch (err) {
      setError(getServerErrorMessage(err, 'Something went wrong submitting your feedback. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  }

  const price = ticket.final_sheet?.final_cost;
  const completed = ticket.status === 'COMPLETED';

  return (
    <div className={`fb-card ${existing ? 'reviewed' : 'pending'}`}>
      <div className="fb-card-top">
        <span className="fb-card-icon">
          <Sun size={20} />
        </span>
        <div className="fb-card-info">
          <div className="fb-card-title-row">
            <span className="fb-card-ticket">{ticket.ticket_number}</span>
            <span className={`fb-status ${completed ? 'completed' : 'approved'}`}>{ticket.status_display}</span>
          </div>
          <div className="fb-card-package-row">
            <span className="fb-card-package">{ticket.solar_package}</span>
            <span className={`fb-system-tag ${ticket.system_type === 'HYBRID' ? 'hybrid' : 'ongrid'}`}>
              {systemLabel(ticket.system_type)}
            </span>
          </div>
        </div>
        {price && (
          <div className="fb-card-price">
            <span>Final Price</span>
            <strong>{formatCurrency(price)}</strong>
          </div>
        )}
      </div>

      <div className="fb-meta">
        {ticket.property_address && <MetaItem icon={MapPin}>{ticket.property_address}</MetaItem>}
        <MetaItem icon={HardHat}>{ticket.partner_installer_username || 'No installer'}</MetaItem>
        <MetaItem icon={CalendarDays}>
          {completed && ticket.completed_at
            ? `Installed ${formatDate(ticket.completed_at)}`
            : `Submitted ${formatDate(ticket.created_at)}`}
        </MetaItem>
        {price && (
          <span className="fb-meta-price">
            <MetaItem icon={Wallet}>{formatCurrency(price)}</MetaItem>
          </span>
        )}
      </div>

      <div className="fb-card-body">
        {showThanks ? (
          <div className="fb-confirm">
            <span className="fb-confirm-icon">
              <CheckCircle2 size={28} />
            </span>
            <p className="fb-confirm-title">Thanks for your feedback!</p>
            <p className="fb-confirm-sub">Your review helps our team and Partner Installers do better.</p>
          </div>
        ) : existing ? (
          <div className="fb-submitted">
            <div className="fb-submitted-head">
              <StarRating value={existing.rating} readOnly size={22} />
              {existing.submitted_at && (
                <span className="fb-submitted-date">Reviewed {formatDate(existing.submitted_at)}</span>
              )}
            </div>
            {existing.highlights_display && existing.highlights_display.length > 0 && (
              <div className="fb-highlight-tags">
                {existing.highlights_display.map((h) => (
                  <span key={h} className="fb-highlight-tag">
                    <Check size={12} />
                    {h}
                  </span>
                ))}
              </div>
            )}
            {existing.comments && (
              <div className="fb-quote">
                <MessageSquareQuote size={18} />
                <p>{existing.comments}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="fb-form">
            <div className="fb-step">
              <p className="fb-form-label">
                <span className="fb-step-num">1</span>
                How was your experience?
              </p>
              <StarRating value={rating} onChange={pickRating} />
            </div>

            <div className="fb-step">
              <p className="fb-form-label">
                <span className="fb-step-num">2</span>
                What stood out? <span className="fb-optional">(optional)</span>
              </p>
              <div className="fb-highlight-options">
                {HIGHLIGHT_OPTIONS.map((opt) => {
                  const picked = highlights.includes(opt.value);
                  return (
                    <button
                      type="button"
                      key={opt.value}
                      className={`fb-highlight-option ${picked ? 'selected' : ''}`}
                      onClick={() => toggleHighlight(opt.value)}
                      aria-pressed={picked}
                    >
                      {picked && <Check size={13} />}
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="fb-step">
              <p className="fb-form-label">
                <span className="fb-step-num">3</span>
                Comments <span className="fb-optional">(optional)</span>
              </p>
              <div className="fb-textarea-wrap">
                <textarea
                  placeholder="Tell us about the site visit, the installation, or anything we can do better..."
                  value={comment}
                  maxLength={COMMENT_LIMIT}
                  onChange={(e) => setComment(e.target.value)}
                />
                <span className="fb-char-count">
                  {comment.length}/{COMMENT_LIMIT}
                </span>
              </div>
            </div>

            {error && (
              <div className="fb-alert fb-alert-red">
                <span className="fb-alert-icon">
                  <AlertCircle size={18} />
                </span>
                <div className="fb-alert-text">
                  <p className="fb-alert-title">Could not submit yet</p>
                  <p>{error}</p>
                </div>
              </div>
            )}

            <div className="fb-form-footer">
              <button type="button" className="fb-submit-btn" disabled={submitting} onClick={handleSubmit}>
                <Send size={15} />
                {submitting ? 'Submitting...' : 'Submit Feedback'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FeedbackSkeleton() {
  return (
    <>
      {Array.from({ length: 2 }).map((_, i) => (
        <span key={i} className="fb-skel fb-skel-card" />
      ))}
    </>
  );
}

export default function FeedbackPage() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  // The card just reviewed stays where it is for a moment to show "Thanks"
  const [thanksId, setThanksId] = useState(null);

  useEffect(() => {
    if (!thanksId) return undefined;
    const timer = setTimeout(() => setThanksId(null), 3000);
    return () => clearTimeout(timer);
  }, [thanksId]);

  async function handleSubmitted(id) {
    setThanksId(id);
    await load({ silent: true });
  }

  // silent = refresh in the background without showing the skeleton, so
  // the "Thanks for your feedback" message stays on screen after submitting
  async function load({ silent = false } = {}) {
    try {
      if (!silent) setLoading(true);
      const data = await getMyTickets();
      setTickets(data);
      setError('');
    } catch {
      if (!silent) setError('Could not load your requests. Please try again.');
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // Both APPROVED and COMPLETED tickets are eligible for feedback -
  // COMPLETED comes after APPROVED, so a finished installation should
  // stay reviewable, not drop out of this list once it's done.
  const eligibleTickets = tickets
    .filter((t) => t.status === 'APPROVED' || t.status === 'COMPLETED')
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  // A card stays in "waiting" for a moment after it is reviewed, to show "Thanks"
  const isWaiting = (t) => !t.feedback || t.id === thanksId;

  const counts = {
    ALL: eligibleTickets.length,
    PENDING: eligibleTickets.filter(isWaiting).length,
    REVIEWED: eligibleTickets.filter((t) => !isWaiting(t)).length,
  };

  const search = searchText.trim().toLowerCase();

  const visibleTickets = eligibleTickets.filter((t) => {
    const matchesStatus =
      statusFilter === 'ALL' || (statusFilter === 'PENDING' ? isWaiting(t) : !isWaiting(t));
    const matchesSearch =
      search === '' ||
      t.ticket_number?.toLowerCase().includes(search) ||
      t.property_address?.toLowerCase().includes(search) ||
      t.solar_package?.toLowerCase().includes(search);
    return matchesStatus && matchesSearch;
  });

  const pendingTickets = visibleTickets.filter(isWaiting);
  const reviewedTickets = visibleTickets.filter((t) => !isWaiting(t));

  const reviewedCount = eligibleTickets.filter((t) => t.feedback).length;
  const waitingCount = eligibleTickets.length - reviewedCount;
  const progress = eligibleTickets.length ? Math.round((reviewedCount / eligibleTickets.length) * 100) : 0;
  const showProgress = !loading && !error && eligibleTickets.length > 0;

  function clearFilters() {
    setSearchText('');
    setStatusFilter('ALL');
  }

  return (
    <CustomerLayout pageTitle="Customer Feedback" pageSubtitle="Rate and review your completed solar installations">
      <div className="fb-page">
        {/* ---------- Banner ---------- */}
        <section className="fb-hero">
          <div className="fb-hero-glow" aria-hidden="true" />
          <div className="fb-hero-icon">
            <Star size={26} />
          </div>
          <div className="fb-hero-text">
            <h1>Your Feedback Matters</h1>
            <p>
              {showProgress && waitingCount > 0
                ? `${waitingCount} installation${waitingCount === 1 ? ' is' : 's are'} waiting for your rating.`
                : 'Help us improve by sharing your experience with our installation team.'}
            </p>
          </div>
          {showProgress && (
            <div className="fb-hero-progress">
              <p className="fb-hero-count">
                <strong>{reviewedCount}</strong> of {eligibleTickets.length} reviewed
              </p>
              <div className="fb-progress" aria-label={`${progress}% reviewed`}>
                <span className="fb-progress-fill" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}
        </section>

        {loading && <FeedbackSkeleton />}

        {!loading && error && (
          <div className="fb-panel">
            <div className="fb-empty">
              <span className="fb-empty-badge red">
                <AlertCircle size={26} />
              </span>
              <p className="fb-empty-title">Something went wrong</p>
              <p className="fb-empty-hint">{error}</p>
              <button type="button" className="fb-btn-primary" onClick={() => load()}>
                Try again
              </button>
            </div>
          </div>
        )}

        {!loading && !error && eligibleTickets.length === 0 && (
          <div className="fb-panel">
            <div className="fb-empty">
              <span className="fb-empty-badge">
                <Star size={26} />
              </span>
              <p className="fb-empty-title">Nothing to review yet</p>
              <p className="fb-empty-hint">
                You can rate your experience once one of your requests is approved. We'd love to hear how the site visit
                and installation went.
              </p>
              <Link to="/request-status" className="fb-btn-primary">
                View Request Status
              </Link>
            </div>
          </div>
        )}

        {!loading && !error && eligibleTickets.length > 0 && (
          <>
            <section className="fb-toolbar">
              <div className="fb-search">
                <Search size={17} className="fb-search-icon" />
                <input
                  type="text"
                  placeholder="Search ref #, address or package"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  aria-label="Search requests"
                />
                {searchText && (
                  <button
                    type="button"
                    className="fb-search-clear"
                    onClick={() => setSearchText('')}
                    aria-label="Clear search"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              <FilterDropdown
                options={FILTER_OPTIONS}
                value={statusFilter}
                counts={counts}
                onChange={setStatusFilter}
              />
            </section>

            {visibleTickets.length === 0 && (
              <div className="fb-panel">
                <div className="fb-empty">
                  <span className="fb-empty-badge">
                    <SearchX size={26} />
                  </span>
                  <p className="fb-empty-title">No requests match</p>
                  <p className="fb-empty-hint">Try a different search or filter.</p>
                  <button type="button" className="fb-btn-secondary" onClick={clearFilters}>
                    Show all requests
                  </button>
                </div>
              </div>
            )}

            {pendingTickets.length > 0 && (
              <section className="fb-section">
                <div className="fb-section-head">
                  <span className="fb-section-icon gold">
                    <Clock size={16} />
                  </span>
                  <h2>Waiting for your review</h2>
                </div>
                {pendingTickets.map((t) => (
                  <FeedbackCard
                    key={t.id}
                    ticket={t}
                    showThanks={t.id === thanksId}
                    onSubmitted={() => handleSubmitted(t.id)}
                  />
                ))}
              </section>
            )}

            {reviewedTickets.length > 0 && (
              <section className="fb-section">
                <div className="fb-section-head">
                  <span className="fb-section-icon navy">
                    <CheckCircle2 size={16} />
                  </span>
                  <h2>Your reviews</h2>
                </div>
                {reviewedTickets.map((t) => (
                  <FeedbackCard key={t.id} ticket={t} onSubmitted={() => load({ silent: true })} />
                ))}
              </section>
            )}
          </>
        )}
      </div>
    </CustomerLayout>
  );
}