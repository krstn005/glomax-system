import { useEffect, useRef, useState } from 'react';
import {
  Star,
  MessageSquareText,
  X,
  Quote,
  AlertCircle,
  ChevronDown,
  Check,
  Clock,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Award,
} from 'lucide-react';
import PILayout from '../components/PILayout';
import { getInstallerTickets } from '../../../api/piTickets';
import '../styles/pi-my-ratings.css';

const SORT_OPTIONS = [
  { key: 'NEWEST', label: 'Newest first', icon: Clock },
  { key: 'HIGHEST', label: 'Highest rating', icon: TrendingUp },
  { key: 'LOWEST', label: 'Lowest rating', icon: TrendingDown },
];

function scoreLabel(score) {
  if (score >= 4.5) return 'Excellent';
  if (score >= 3.5) return 'Very good';
  if (score >= 2.5) return 'Good';
  if (score >= 1.5) return 'Fair';
  if (score > 0) return 'Needs work';
  return 'No ratings yet';
}

// Color group for a single rating - used for the line on top of each card
function ratingTone(rating) {
  if (rating >= 4) return 'gold';
  if (rating === 3) return 'amber';
  return 'red';
}

function formatDate(value, month = 'short') {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-US', { month, day: 'numeric', year: 'numeric' });
}

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : parts[0]?.[1] || '';
  return (first + last).toUpperCase();
}

// Stars that can be partly filled, so 4.5 shows 4 and a half stars
function StarRow({ rating, size = 16, light = false }) {
  return (
    <span className="pimr-stars" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => {
        const fill = Math.max(0, Math.min(1, rating - (n - 1)));
        return (
          <span key={n} className="pimr-star" style={{ width: size, height: size }}>
            <Star size={size} className={light ? 'pimr-star-empty light' : 'pimr-star-empty'} />
            <span className="pimr-star-fill" style={{ width: `${fill * 100}%` }}>
              <Star size={size} fill="#facc15" color="#facc15" />
            </span>
          </span>
        );
      })}
    </span>
  );
}

// Sort dropdown
function SortMenu({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
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
  }, []);

  const current = SORT_OPTIONS.find((o) => o.key === value) || SORT_OPTIONS[0];
  const CurrentIcon = current.icon;

  function pick(key) {
    onChange(key);
    setOpen(false);
  }

  return (
    <div className="pimr-sort" ref={wrapRef}>
      <button
        type="button"
        className={`pimr-sort-btn ${open ? 'open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <CurrentIcon size={15} className="pimr-sort-icon" />
        <span className="pimr-sort-value">{current.label}</span>
        <ChevronDown size={15} className="pimr-sort-chevron" />
      </button>

      {open && (
        <div className="pimr-sort-menu" role="listbox">
          <p className="pimr-sort-menu-title">Sort reviews</p>
          <div className="pimr-sort-list">
            {SORT_OPTIONS.map(({ key, label, icon: Icon }) => {
              const selected = key === value;
              return (
                <button
                  key={key}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={`pimr-sort-option ${selected ? 'selected' : ''}`}
                  onClick={() => pick(key)}
                >
                  <span className="pimr-sort-option-icon">
                    <Icon size={14} />
                  </span>
                  <span className="pimr-sort-option-label">{label}</span>
                  <span className="pimr-sort-check">{selected && <Check size={15} />}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function RatingsSkeleton() {
  return (
    <div className="pimr-page" aria-busy="true">
      <div className="pimr-skel pimr-skel-hero" />
      <div className="pimr-skel pimr-skel-bar-head" />
      <div className="pimr-reviews-grid">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="pimr-skel pimr-skel-review" />
        ))}
      </div>
    </div>
  );
}

export default function PIMyRatingsPage() {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedReview, setSelectedReview] = useState(null);
  const [starFilter, setStarFilter] = useState(null); // null = all, or 1-5
  const [sortBy, setSortBy] = useState('NEWEST');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await getInstallerTickets();
        if (cancelled) return;
        const withFeedback = data
          .filter((t) => t.feedback)
          .map((t) => ({
            ticketNumber: t.ticket_number,
            customerName: t.full_name || t.customer_username || 'Customer',
            rating: Number(t.feedback.rating) || 0,
            comments: t.feedback.comments,
            submittedAt: t.feedback.submitted_at,
          }));
        setReviews(withFeedback);
        setError('');
      } catch {
        if (!cancelled) setError('Could not load your ratings. Please try again.');
      } finally {
        if (!cancelled) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  // Close the popup with Esc
  useEffect(() => {
    if (!selectedReview) return undefined;
    function handleKey(e) {
      if (e.key === 'Escape') setSelectedReview(null);
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [selectedReview]);

  function refresh() {
    setRefreshing(true);
    setError('');
    setReloadKey((k) => k + 1);
  }

  function retry() {
    setLoading(true);
    refresh();
  }

  const totalReviews = reviews.length;
  const average = totalReviews ? reviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews : 0;
  const averageText = average.toFixed(1);

  const distribution = [5, 4, 3, 2, 1].map((star) => {
    const count = reviews.filter((r) => r.rating === star).length;
    return { star, count, percent: totalReviews ? Math.round((count / totalReviews) * 100) : 0 };
  });

  const shownReviews = reviews
    .filter((r) => (starFilter ? r.rating === starFilter : true))
    .sort((a, b) => {
      if (sortBy === 'HIGHEST') return b.rating - a.rating || new Date(b.submittedAt) - new Date(a.submittedAt);
      if (sortBy === 'LOWEST') return a.rating - b.rating || new Date(b.submittedAt) - new Date(a.submittedAt);
      return new Date(b.submittedAt) - new Date(a.submittedAt);
    });

  // Click a bar to show only that star rating. Click it again to show all.
  function toggleStar(star) {
    setStarFilter((current) => (current === star ? null : star));
  }

  if (loading) {
    return (
      <PILayout pageTitle="My Ratings" pageSubtitle="What customers say about your work">
        <RatingsSkeleton />
      </PILayout>
    );
  }

  return (
    <PILayout pageTitle="My Ratings" pageSubtitle="What customers say about your work">
      <div className="pimr-page">
        {error ? (
          <div className="pimr-card">
            <div className="pimr-empty-state">
              <span className="pimr-empty-badge red">
                <AlertCircle size={26} />
              </span>
              <p className="pimr-empty-title">Something went wrong</p>
              <p className="pimr-empty-hint">{error}</p>
              <button type="button" className="pimr-btn-primary" onClick={retry}>
                <RefreshCw size={15} />
                Try again
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* ---------- Banner: score + rating bars ---------- */}
            <section className="pimr-hero">
              <div className="pimr-hero-glow" aria-hidden="true" />

              <div className="pimr-score">
                <span className="pimr-score-kicker">
                  <Award size={14} />
                  Overall Score
                </span>
                <p className="pimr-score-value">
                  {averageText}
                  <span>/ 5.0</span>
                </p>
                <StarRow rating={average} size={22} light />
                <div className="pimr-score-meta">
                  <span className="pimr-score-tag">{scoreLabel(average)}</span>
                  <span className="pimr-score-count">
                    {totalReviews} rating{totalReviews === 1 ? '' : 's'}
                  </span>
                </div>
              </div>

              <div className="pimr-dist">
                <div className="pimr-dist-head">
                  <span>Click a bar to filter the reviews</span>
                  <button
                    type="button"
                    className="pimr-hero-refresh"
                    onClick={refresh}
                    disabled={refreshing}
                    aria-label="Refresh"
                    title="Refresh"
                  >
                    <RefreshCw size={15} className={refreshing ? 'spin' : ''} />
                  </button>
                </div>
                {distribution.map((d) => (
                  <button
                    type="button"
                    key={d.star}
                    className={`pimr-dist-row ${starFilter === d.star ? 'active' : ''} ${d.count === 0 ? 'empty' : ''}`}
                    onClick={() => toggleStar(d.star)}
                    disabled={d.count === 0}
                    aria-pressed={starFilter === d.star}
                    title={d.count === 0 ? 'No ratings' : `Show only ${d.star}-star reviews`}
                  >
                    <span className="pimr-dist-star">
                      {d.star}
                      <Star size={13} fill="#facc15" color="#facc15" />
                    </span>
                    <span className="pimr-dist-track">
                      <span className="pimr-dist-fill" style={{ width: `${d.percent}%` }} />
                    </span>
                    <span className="pimr-dist-count">{d.count}</span>
                  </button>
                ))}
              </div>
            </section>

            {/* ---------- Reviews ---------- */}
            {totalReviews === 0 ? (
              <div className="pimr-card">
                <div className="pimr-empty-state">
                  <span className="pimr-empty-badge">
                    <MessageSquareText size={26} />
                  </span>
                  <p className="pimr-empty-title">No ratings yet</p>
                  <p className="pimr-empty-hint">They'll show up here once customers leave feedback on finished jobs.</p>
                </div>
              </div>
            ) : (
              <>
                <div className="pimr-toolbar">
                  <div className="pimr-toolbar-title">
                    <h2>
                      <MessageSquareText size={18} />
                      Customer Reviews
                    </h2>
                    <p>
                      {starFilter
                        ? `${shownReviews.length} ${starFilter}-star review${shownReviews.length === 1 ? '' : 's'}`
                        : `All ${totalReviews} review${totalReviews === 1 ? '' : 's'}`}
                      {' · click a card to read it in full'}
                    </p>
                  </div>

                  <div className="pimr-toolbar-right">
                    {starFilter && (
                      <button type="button" className="pimr-clear" onClick={() => setStarFilter(null)}>
                        {starFilter}
                        <Star size={12} fill="currentColor" />
                        only
                        <X size={13} />
                      </button>
                    )}
                    <SortMenu value={sortBy} onChange={setSortBy} />
                  </div>
                </div>

                {shownReviews.length === 0 ? (
                  <div className="pimr-card">
                    <div className="pimr-empty-state compact">
                      <span className="pimr-empty-badge">
                        <Star size={24} />
                      </span>
                      <p className="pimr-empty-title">No {starFilter}-star reviews</p>
                      <button type="button" className="pimr-btn-secondary" onClick={() => setStarFilter(null)}>
                        Show all reviews
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="pimr-reviews-grid">
                    {shownReviews.map((r) => (
                      <button
                        type="button"
                        className={`pimr-review-card tone-${ratingTone(r.rating)}`}
                        key={r.ticketNumber}
                        onClick={() => setSelectedReview(r)}
                      >
                        <div className="pimr-review-top">
                          <span className="pimr-review-rating">
                            <StarRow rating={r.rating} size={15} />
                            <span className="pimr-rating-num">{r.rating.toFixed(1)}</span>
                          </span>
                          <span className="pimr-review-date">{formatDate(r.submittedAt)}</span>
                        </div>

                        <div className="pimr-review-body">
                          <Quote size={18} className="pimr-quote-icon" />
                          {r.comments ? (
                            <p className="pimr-review-comment">{r.comments}</p>
                          ) : (
                            <p className="pimr-review-comment muted">No written comment.</p>
                          )}
                        </div>

                        <div className="pimr-review-bottom">
                          <span className="pimr-avatar">{getInitials(r.customerName)}</span>
                          <span className="pimr-review-name">{r.customerName}</span>
                          <span className="pimr-review-ticket">{r.ticketNumber}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* Review popup */}
      {selectedReview && (
        <div className="pimr-modal-overlay" onClick={() => setSelectedReview(null)}>
          <div className="pimr-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="pimr-modal-head">
              <StarRow rating={selectedReview.rating} size={20} light />
              <span className="pimr-modal-date">{formatDate(selectedReview.submittedAt, 'long')}</span>
              <button
                type="button"
                className="pimr-modal-close"
                onClick={() => setSelectedReview(null)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="pimr-modal-body">
              <Quote size={22} className="pimr-quote-icon" />
              {selectedReview.comments ? (
                <p className="pimr-modal-comment">{selectedReview.comments}</p>
              ) : (
                <p className="pimr-modal-comment muted">No written comment was left for this rating.</p>
              )}
            </div>

            <div className="pimr-modal-foot">
              <span className="pimr-avatar large">{getInitials(selectedReview.customerName)}</span>
              <div>
                <p className="pimr-modal-name">{selectedReview.customerName}</p>
                <p className="pimr-modal-ticket">{selectedReview.ticketNumber}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </PILayout>
  );
}