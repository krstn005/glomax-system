import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Star,
  MessageSquare,
  Award,
  ThumbsUp,
  Search,
  X,
  ChevronDown,
  ChevronRight,
  Check,
  Clock,
  History,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  RefreshCw,
  HardHat,
  Sparkles,
  Users,
  ShieldCheck,
  Smile,
  Zap,
  Briefcase,
  BadgeCheck,
} from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import { getAdminTickets } from '../../../api/adminTickets';
import '../styles/admin-feedback.css';

const PAGE_STEP = 9;

const SORTS = [
  { key: 'NEWEST', label: 'Newest first', icon: Clock },
  { key: 'OLDEST', label: 'Oldest first', icon: History },
  { key: 'HIGHEST', label: 'Highest rating', icon: TrendingUp },
  { key: 'LOWEST', label: 'Lowest rating', icon: TrendingDown },
];

const STARS_DOWN = [5, 4, 3, 2, 1];

// A small icon for each highlight, picked from words in its name
function getHighlightIcon(label) {
  const text = (label || '').toLowerCase();
  if (text.includes('time') || text.includes('punctual')) return Clock;
  if (text.includes('fast') || text.includes('quick')) return Zap;
  if (text.includes('clean') || text.includes('neat')) return Sparkles;
  if (text.includes('quality') || text.includes('material')) return ShieldCheck;
  if (text.includes('friendly') || text.includes('polite')) return Smile;
  if (text.includes('professional') || text.includes('team') || text.includes('staff')) return Briefcase;
  return BadgeCheck;
}

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getTime(value) {
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

// good = 4-5 stars, mid = 3, low = 1-2
function getTone(rating) {
  if (rating >= 4) return 'good';
  if (rating === 3) return 'mid';
  return 'low';
}

function getScoreLabel(avg, total) {
  if (!total) return 'No ratings yet';
  if (avg >= 4.5) return 'Excellent';
  if (avg >= 4) return 'Very good';
  if (avg >= 3) return 'Good';
  if (avg >= 2) return 'Fair';
  return 'Needs work';
}

function StarRow({ value, size = 14 }) {
  return (
    <span className="admfb-stars" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => {
        const fill = Math.max(0, Math.min(1, value - (n - 1)));
        return (
          <span key={n} className="admfb-star" style={{ width: size, height: size }}>
            <Star size={size} className="admfb-star-empty" />
            <span className="admfb-star-fill" style={{ width: `${fill * 100}%` }}>
              <Star size={size} className="admfb-star-full" />
            </span>
          </span>
        );
      })}
    </span>
  );
}

function SortMenu({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const current = SORTS.find((s) => s.key === value) || SORTS[0];
  const CurrentIcon = current.icon;

  useEffect(() => {
    if (!open) return undefined;
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    function handleKey(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  return (
    <div className="admfb-sort" ref={ref}>
      <button
        type="button"
        className={`admfb-sort-button ${open ? 'open' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <CurrentIcon size={15} />
        <span>{current.label}</span>
        <ChevronDown size={15} className="admfb-sort-caret" />
      </button>

      {open && (
        <div className="admfb-sort-menu" role="listbox">
          <p className="admfb-sort-title">Sort reviews by</p>
          {SORTS.map((s) => {
            const Icon = s.icon;
            const active = s.key === value;
            return (
              <button
                key={s.key}
                type="button"
                role="option"
                aria-selected={active}
                className={`admfb-sort-option ${active ? 'active' : ''}`}
                onClick={() => {
                  onChange(s.key);
                  setOpen(false);
                }}
              >
                <span className="admfb-sort-icon">
                  <Icon size={14} />
                </span>
                <span className="admfb-sort-label">{s.label}</span>
                {active && <Check size={15} className="admfb-sort-check" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="admfb-skeleton-wrap" aria-busy="true">
      <div className="admfb-skeleton admfb-skeleton-hero" />
      <div className="admfb-panels">
        {[1, 2, 3].map((n) => (
          <div key={n} className="admfb-skeleton admfb-skeleton-panel" />
        ))}
      </div>
      <div className="admfb-skeleton admfb-skeleton-reviews" />
    </div>
  );
}

export default function AdminCustomerFeedbackPage() {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [ratingFilter, setRatingFilter] = useState(null); // null or 1-5
  const [installerFilter, setInstallerFilter] = useState(null);
  const [highlightFilter, setHighlightFilter] = useState(null);
  const [sort, setSort] = useState('NEWEST');
  const [visible, setVisible] = useState(PAGE_STEP);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAdminTickets();
      setTickets(Array.isArray(data) ? data.filter((t) => t.feedback) : []);
      setError('');
    } catch {
      setError('Could not load feedback. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setVisible(PAGE_STEP);
  }, [search, ratingFilter, installerFilter, highlightFilter, sort]);

  const reviews = useMemo(
    () =>
      tickets.map((t) => ({
        ...t,
        rating: Number(t.feedback.rating) || 0,
        highlights: t.feedback.highlights_display || [],
        customerName: t.full_name || t.customer_username || 'Customer',
      })),
    [tickets]
  );

  const stats = useMemo(() => {
    const total = reviews.length;
    const sum = reviews.reduce((s, r) => s + r.rating, 0);
    const avg = total ? sum / total : 0;
    const fiveStar = reviews.filter((r) => r.rating === 5).length;
    const happy = reviews.filter((r) => r.rating >= 4).length;
    const withComments = reviews.filter((r) => r.feedback.comments?.trim()).length;
    return {
      total,
      avg,
      fiveStar,
      happyPct: total ? Math.round((happy / total) * 100) : 0,
      withComments,
    };
  }, [reviews]);

  const distribution = useMemo(
    () =>
      STARS_DOWN.map((star) => {
        const count = reviews.filter((r) => r.rating === star).length;
        return { star, count, pct: stats.total ? Math.round((count / stats.total) * 100) : 0 };
      }),
    [reviews, stats.total]
  );

  const installerList = useMemo(() => {
    const map = {};
    reviews.forEach((r) => {
      const name = r.partner_installer_username;
      if (!name) return;
      if (!map[name]) map[name] = [];
      map[name].push(r.rating);
    });
    return Object.entries(map)
      .map(([name, ratings]) => ({
        name,
        avg: ratings.reduce((s, x) => s + x, 0) / ratings.length,
        count: ratings.length,
      }))
      .sort((a, b) => b.avg - a.avg || b.count - a.count);
  }, [reviews]);

  const topHighlights = useMemo(() => {
    const counts = {};
    reviews.forEach((r) => {
      r.highlights.forEach((h) => {
        counts[h] = (counts[h] || 0) + 1;
      });
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
  }, [reviews]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = reviews.filter((r) => {
      if (ratingFilter && r.rating !== ratingFilter) return false;
      if (installerFilter && r.partner_installer_username !== installerFilter) return false;
      if (highlightFilter && !r.highlights.includes(highlightFilter)) return false;
      if (term) {
        const haystack = [
          r.customerName,
          r.customer_username,
          r.ticket_number,
          r.partner_installer_username,
          r.feedback.comments,
          ...r.highlights,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });

    return list.sort((a, b) => {
      const da = getTime(a.feedback.submitted_at);
      const db = getTime(b.feedback.submitted_at);
      if (sort === 'OLDEST') return da - db;
      if (sort === 'HIGHEST') return b.rating - a.rating || db - da;
      if (sort === 'LOWEST') return a.rating - b.rating || db - da;
      return db - da;
    });
  }, [reviews, search, ratingFilter, installerFilter, highlightFilter, sort]);

  const shown = filtered.slice(0, visible);

  // The panels above are the filters. These chips show what is picked
  // and let you remove it without scrolling back up.
  const activeChips = [];
  if (ratingFilter) {
    activeChips.push({
      key: 'rating',
      label: `${ratingFilter} star${ratingFilter > 1 ? 's' : ''}`,
      clear: () => setRatingFilter(null),
    });
  }
  if (installerFilter) {
    activeChips.push({ key: 'installer', label: `Installer: ${installerFilter}`, clear: () => setInstallerFilter(null) });
  }
  if (highlightFilter) {
    activeChips.push({ key: 'highlight', label: highlightFilter, clear: () => setHighlightFilter(null) });
  }
  if (search.trim()) {
    activeChips.push({ key: 'search', label: `"${search.trim()}"`, clear: () => setSearch('') });
  }

  function clearAll() {
    setRatingFilter(null);
    setInstallerFilter(null);
    setHighlightFilter(null);
    setSearch('');
  }

  function openTicket(id) {
    navigate(`/admin/requests/${id}`);
  }

  return (
    <AdminLayout pageTitle="Customer Feedback" pageSubtitle="See how customers rated their finished solar installations">
      <div className="admfb-page">
        {loading ? (
          <LoadingSkeleton />
        ) : error ? (
          <>
            <section className="admfb-hero admfb-hero-simple">
              <div className="admfb-hero-glow" aria-hidden="true" />
              <div className="admfb-hero-score">
                <p className="admfb-hero-label">Customer Feedback</p>
                <p className="admfb-hero-sub">Ratings could not be loaded.</p>
              </div>
            </section>
            <div className="admfb-state-card">
              <span className="admfb-state-icon error">
                <AlertCircle size={26} />
              </span>
              <h3>Something went wrong</h3>
              <p>{error}</p>
              <button type="button" className="admfb-btn-primary" onClick={load}>
                <RefreshCw size={15} />
                Try again
              </button>
            </div>
          </>
        ) : (
          <>
            {/* ---------- Banner: overall score ---------- */}
            <section className="admfb-hero">
              <div className="admfb-hero-glow" aria-hidden="true" />

              <div className="admfb-hero-score">
                <p className="admfb-hero-label">Average Rating</p>
                <div className="admfb-score-main">
                  <span className="admfb-score-value">{stats.avg.toFixed(1)}</span>
                  <span className="admfb-score-out">/ 5</span>
                </div>
                <div className="admfb-score-row">
                  <StarRow value={stats.avg} size={18} />
                  <span className="admfb-score-label">{getScoreLabel(stats.avg, stats.total)}</span>
                </div>
              </div>

              <div className="admfb-hero-facts">
                <div className="admfb-fact">
                  <span className="admfb-fact-icon">
                    <MessageSquare size={17} />
                  </span>
                  <span className="admfb-fact-text">
                    <strong>{stats.total}</strong>
                    <span>Total reviews</span>
                    <small>{stats.withComments} with a comment</small>
                  </span>
                </div>
                <div className="admfb-fact">
                  <span className="admfb-fact-icon">
                    <Award size={17} />
                  </span>
                  <span className="admfb-fact-text">
                    <strong>{stats.fiveStar}</strong>
                    <span>5-star reviews</span>
                    <small>The best rating</small>
                  </span>
                </div>
                <div className="admfb-fact">
                  <span className="admfb-fact-icon">
                    <ThumbsUp size={17} />
                  </span>
                  <span className="admfb-fact-text">
                    <strong>{stats.happyPct}%</strong>
                    <span>Happy customers</span>
                    <small>Gave 4 or 5 stars</small>
                  </span>
                </div>
              </div>
            </section>

            {/* ---------- Panels (also the filters) ---------- */}
            <div className="admfb-panels">
              <section className="admfb-panel">
                <div className="admfb-panel-head">
                  <span className="admfb-panel-icon tone-gold">
                    <Star size={16} />
                  </span>
                  <div>
                    <h2>Rating Distribution</h2>
                    <p>Click a row to see those reviews</p>
                  </div>
                </div>

                <div className="admfb-dist-list">
                  {distribution.map((d) => (
                    <button
                      key={d.star}
                      type="button"
                      className={`admfb-dist-row ${ratingFilter === d.star ? 'active' : ''}`}
                      onClick={() => setRatingFilter((cur) => (cur === d.star ? null : d.star))}
                      disabled={d.count === 0}
                      aria-pressed={ratingFilter === d.star}
                    >
                      <span className="admfb-dist-label">
                        {d.star}
                        <Star size={13} className="admfb-dist-star" />
                      </span>
                      <span className="admfb-bar-track">
                        <span className={`admfb-bar-fill tone-${getTone(d.star)}`} style={{ width: `${d.pct}%` }} />
                      </span>
                      <span className="admfb-dist-count">{d.count}</span>
                      <span className="admfb-dist-pct">{d.pct}%</span>
                    </button>
                  ))}
                </div>
              </section>

              <section className="admfb-panel">
                <div className="admfb-panel-head">
                  <span className="admfb-panel-icon tone-blue">
                    <Users size={16} />
                  </span>
                  <div>
                    <h2>Installer Ratings</h2>
                    <p>Average rating per partner installer</p>
                  </div>
                </div>

                {installerList.length === 0 ? (
                  <p className="admfb-panel-empty">No rated installs yet.</p>
                ) : (
                  <div className="admfb-installer-list">
                    {installerList.map((w) => (
                      <button
                        key={w.name}
                        type="button"
                        className={`admfb-installer-row ${installerFilter === w.name ? 'active' : ''}`}
                        onClick={() => setInstallerFilter((cur) => (cur === w.name ? null : w.name))}
                        aria-pressed={installerFilter === w.name}
                      >
                        <span className="admfb-avatar small">{getInitials(w.name)}</span>
                        <span className="admfb-installer-info">
                          <span className="admfb-installer-name">{w.name}</span>
                          <StarRow value={w.avg} size={12} />
                        </span>
                        <span className="admfb-installer-score">
                          <strong>{w.avg.toFixed(1)}</strong>
                          <small>
                            {w.count} review{w.count > 1 ? 's' : ''}
                          </small>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </section>

              <section className="admfb-panel admfb-panel-highlights">
                <div className="admfb-panel-head">
                  <span className="admfb-panel-icon tone-green">
                    <Sparkles size={16} />
                  </span>
                  <div>
                    <h2>Top Highlights</h2>
                    <p>What customers liked the most</p>
                  </div>
                </div>

                {topHighlights.length === 0 ? (
                  <p className="admfb-panel-empty">No highlights picked yet.</p>
                ) : (
                  <>
                    <div className="admfb-highlight-list">
                      {topHighlights.map(([label, count], i) => {
                        // Share of all reviews that picked this highlight
                        const pct = stats.total ? Math.round((count / stats.total) * 100) : 0;
                        const active = highlightFilter === label;
                        const Icon = getHighlightIcon(label);
                        return (
                          <button
                            key={label}
                            type="button"
                            className={`admfb-highlight-chip ${i === 0 ? 'top' : ''} ${active ? 'active' : ''}`}
                            onClick={() => setHighlightFilter((cur) => (cur === label ? null : label))}
                            aria-pressed={active}
                            title={`${count} of ${stats.total} reviews (${pct}%)`}
                          >
                            <span className="admfb-highlight-row">
                              <span className="admfb-highlight-icon">
                                <Icon size={16} />
                              </span>
                              <span className="admfb-highlight-text">
                                <span className="admfb-highlight-label">{label}</span>
                                <span className="admfb-highlight-sub">
                                  {count} review{count === 1 ? '' : 's'} · {pct}%
                                </span>
                              </span>
                              {active ? (
                                <X size={16} className="admfb-highlight-x" />
                              ) : (
                                i === 0 && <span className="admfb-highlight-top">Top</span>
                              )}
                            </span>
                            <span className="admfb-highlight-bar" aria-hidden="true">
                              <span style={{ width: `${Math.max(pct, 4)}%` }} />
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <p className="admfb-highlight-note">
                      The bar shows how many reviews picked it. Click one to see those reviews.
                    </p>
                  </>
                )}
              </section>
            </div>

            {/* ---------- Reviews ---------- */}
            <section className="admfb-reviews">
              <div className="admfb-reviews-head">
                <div>
                  <h2>
                    <MessageSquare size={18} />
                    All Reviews
                  </h2>
                  <p>
                    Showing {shown.length} of {filtered.length}. Click a review to open the ticket.
                  </p>
                </div>

                <div className="admfb-reviews-tools">
                  <div className="admfb-search">
                    <Search size={16} />
                    <input
                      type="text"
                      placeholder="Search customer, ticket #, installer or comment"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                    {search && (
                      <button
                        type="button"
                        className="admfb-search-clear"
                        onClick={() => setSearch('')}
                        aria-label="Clear search"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                  <SortMenu value={sort} onChange={setSort} />
                </div>
              </div>

              {activeChips.length > 0 && (
                <div className="admfb-filtered">
                  <span className="admfb-filtered-label">Showing only:</span>
                  {activeChips.map((c) => (
                    <span key={c.key} className="admfb-filtered-chip">
                      {c.label}
                      <button type="button" onClick={c.clear} aria-label={`Remove ${c.label}`}>
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                  <button type="button" className="admfb-clear-link" onClick={clearAll}>
                    Clear all
                  </button>
                </div>
              )}

              {filtered.length === 0 ? (
                <div className="admfb-empty">
                  <span className="admfb-state-icon">
                    <MessageSquare size={24} />
                  </span>
                  {stats.total === 0 ? (
                    <>
                      <h3>No reviews yet</h3>
                      <p>Reviews will show up here once customers rate their finished installation.</p>
                    </>
                  ) : (
                    <>
                      <h3>No reviews match</h3>
                      <p>Try a different search or remove some filters.</p>
                      <button type="button" className="admfb-btn-secondary" onClick={clearAll}>
                        Clear filters
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <>
                  <div className="admfb-review-grid">
                    {shown.map((r) => {
                      const tone = getTone(r.rating);
                      const comment = r.feedback.comments?.trim();
                      return (
                        <article
                          key={r.id}
                          className={`admfb-review tone-${tone}`}
                          role="button"
                          tabIndex={0}
                          onClick={() => openTicket(r.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              openTicket(r.id);
                            }
                          }}
                        >
                          <div className="admfb-review-top">
                            <span className="admfb-avatar">{getInitials(r.customerName)}</span>
                            <div className="admfb-review-who">
                              <span className="admfb-review-name">{r.customerName}</span>
                              <span className="admfb-ticket-chip">{r.ticket_number}</span>
                            </div>
                            <span className={`admfb-rating-chip tone-${tone}`}>
                              <Star size={12} />
                              {r.rating.toFixed(1)}
                            </span>
                          </div>

                          <div className="admfb-review-meta">
                            <StarRow value={r.rating} size={15} />
                            <span className="admfb-review-date">{formatDate(r.feedback.submitted_at)}</span>
                          </div>

                          {r.highlights.length > 0 && (
                            <div className="admfb-tags">
                              {r.highlights.map((h) => (
                                <span key={h} className="admfb-tag">
                                  {h}
                                </span>
                              ))}
                            </div>
                          )}

                          {comment ? (
                            <p className="admfb-review-comment">&ldquo;{comment}&rdquo;</p>
                          ) : (
                            <p className="admfb-review-comment muted">No written comment.</p>
                          )}

                          <div className="admfb-review-foot">
                            <span className="admfb-review-installer">
                              <HardHat size={14} />
                              {r.partner_installer_username || 'No installer'}
                            </span>
                            <span className="admfb-review-link">
                              View ticket
                              <ChevronRight size={15} />
                            </span>
                          </div>
                        </article>
                      );
                    })}
                  </div>

                  {filtered.length > visible && (
                    <div className="admfb-more">
                      <button
                        type="button"
                        className="admfb-btn-secondary"
                        onClick={() => setVisible((v) => v + PAGE_STEP)}
                      >
                        Show more ({filtered.length - visible} left)
                      </button>
                    </div>
                  )}
                </>
              )}
            </section>
          </>
        )}
      </div>
    </AdminLayout>
  );
}