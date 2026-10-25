import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  X,
  Inbox,
  Layers,
  ClipboardList,
  Hourglass,
  MapPin,
  AlertCircle,
  RefreshCw,
  ChevronRight,
  Clock,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';
import PILayout from '../components/PILayout';
import FilterMenu from '../../../components/FilterMenu';
import { getInstallerTickets } from '../../../api/piTickets';
import '../styles/pi-incoming-tickets.css';

const NEEDS_VISIT_STATUSES = ['PI_ASSIGNED'];
const UNDER_REVIEW_STATUSES = ['ASSESSMENT_SUBMITTED', 'STAFF_REVIEW', 'ADMIN_REVIEW'];
const ACTIVE_STATUSES = [...NEEDS_VISIT_STATUSES, ...UNDER_REVIEW_STATUSES];

// Filter options - shown in the Filter drop-down button
const FILTERS = [
  { key: 'ALL', label: 'All Active', statuses: ACTIVE_STATUSES, icon: Layers, tone: 'navy' },
  { key: 'NEEDS_VISIT', label: 'Needs Site Visit', statuses: NEEDS_VISIT_STATUSES, icon: ClipboardList, tone: 'gold' },
  { key: 'UNDER_REVIEW', label: 'Under Review', statuses: UNDER_REVIEW_STATUSES, icon: Hourglass, tone: 'blue' },
];

// Badge look for each ticket status
const STATUS_BADGE = {
  PI_ASSIGNED: { tone: 'amber', icon: ClipboardList },
  ASSESSMENT_SUBMITTED: { tone: 'blue', icon: Hourglass },
  STAFF_REVIEW: { tone: 'blue', icon: Hourglass },
  ADMIN_REVIEW: { tone: 'blue', icon: Hourglass },
};

// Reads "YYYY-MM-DD" as a local date. new Date("2026-09-17") would be
// read as UTC, which can show the wrong day in the Philippines.
function parseLocalDate(value) {
  if (!value) return null;
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatDate(value) {
  const date = parseLocalDate(value);
  if (!date) return '—';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Days from today: 0 = today, 1 = tomorrow, -2 = two days ago
function daysFromToday(value) {
  const date = parseLocalDate(value);
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((date - today) / 86400000);
}

// Helper line under the visit date, plus how it should look
function visitHint(ticket) {
  const diff = daysFromToday(ticket.visit_date);
  if (diff === null) return null;
  const needsVisit = ticket.status === 'PI_ASSIGNED';
  if (diff === 0) return { text: needsVisit ? 'Visit today' : 'Today', tone: needsVisit ? 'soon' : '' };
  if (diff === 1) return { text: 'Tomorrow', tone: needsVisit ? 'soon' : '' };
  if (diff > 1) return { text: `In ${diff} days`, tone: '' };
  const ago = diff === -1 ? 'Yesterday' : `${Math.abs(diff)} days ago`;
  return needsVisit ? { text: `Overdue · ${ago}`, tone: 'late' } : { text: ago, tone: '' };
}

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : parts[0]?.[1] || '';
  return (first + last).toUpperCase();
}

function RowSkeleton() {
  return (
    <div className="piit-row piit-row-skeleton">
      <span className="piit-skel piit-skel-w-sm" />
      <span className="piit-skel-customer">
        <span className="piit-skel piit-skel-avatar" />
        <span className="piit-skel piit-skel-w-md" />
      </span>
      <span className="piit-hide-md">
        <span className="piit-skel piit-skel-w-lg" />
      </span>
      <span className="piit-hide-sm">
        <span className="piit-skel piit-skel-w-sm" />
      </span>
      <span>
        <span className="piit-skel piit-skel-pill" />
      </span>
      <span />
    </div>
  );
}

export default function PIIncomingTicketsPage() {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState('ALL');
  const [reloadKey, setReloadKey] = useState(0);

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

  function refresh() {
    setRefreshing(true);
    setError('');
    setReloadKey((k) => k + 1);
  }

  function openTicket(id) {
    navigate(`/partner-installer/incoming-tickets/${id}`);
  }

  const activeTickets = tickets.filter((t) => ACTIVE_STATUSES.includes(t.status));

  // Counts for the Filter list
  const counts = {};
  FILTERS.forEach((f) => {
    counts[f.key] = activeTickets.filter((t) => f.statuses.includes(t.status)).length;
  });
  const overdueCount = activeTickets.filter(
    (t) => t.status === 'PI_ASSIGNED' && t.visit_date && daysFromToday(t.visit_date) < 0
  ).length;

  const currentFilter = FILTERS.find((f) => f.key === activeFilter) || FILTERS[0];
  const rawTerm = searchTerm.trim().toLowerCase();
  const hasActiveFilters = activeFilter !== 'ALL' || Boolean(rawTerm);

  // Filter, search, then sort by visit date (soonest first, no date last)
  const shownTickets = activeTickets
    .filter((t) => currentFilter.statuses.includes(t.status))
    .filter((t) => {
      if (!rawTerm) return true;
      return (
        (t.ticket_number || '').toLowerCase().includes(rawTerm) ||
        (t.full_name || t.customer_username || '').toLowerCase().includes(rawTerm) ||
        (t.property_address || '').toLowerCase().includes(rawTerm)
      );
    })
    .sort((a, b) => {
      if (!a.visit_date && !b.visit_date) return new Date(b.updated_at) - new Date(a.updated_at);
      if (!a.visit_date) return 1;
      if (!b.visit_date) return -1;
      return a.visit_date.localeCompare(b.visit_date);
    });

  function clearAll() {
    setSearchTerm('');
    setActiveFilter('ALL');
  }

  // One overdue ticket: open it. More: show the tickets that need a visit
  // (the list puts the oldest visit date first, so overdue ones are on top)
  function openOverdue() {
    const late = activeTickets.filter(
      (t) => t.status === 'PI_ASSIGNED' && t.visit_date && daysFromToday(t.visit_date) < 0
    );
    if (late.length === 1) openTicket(late[0].id);
    else {
      setSearchTerm('');
      setActiveFilter('NEEDS_VISIT');
    }
  }

  // Pick a choice from the Filter button
  function pickFilter(key) {
    setActiveFilter(key);
  }

  let heroText;
  if (loading) heroText = 'Loading your tickets...';
  else if (error) heroText = 'Your tickets could not be loaded right now.';
  else if (counts.NEEDS_VISIT > 0)
    heroText = `${counts.NEEDS_VISIT} ticket${counts.NEEDS_VISIT === 1 ? '' : 's'} waiting for your site visit.`;
  else if (activeTickets.length > 0) heroText = 'All your visits are done. These tickets are being reviewed.';
  else heroText = "You're all caught up. New assignments will show up here.";

  return (
    <PILayout pageTitle="Incoming Tickets" pageSubtitle="Tickets assigned to you that still need action">
      <div className="piit-page">
        {/* ---------- Banner ---------- */}
        <section className="piit-hero">
          <div className="piit-hero-glow" aria-hidden="true" />
          <div className="piit-hero-icon">
            <Inbox size={26} />
          </div>
          <div className="piit-hero-text">
            <h1>Incoming Tickets</h1>
            <p>{heroText}</p>
          </div>
          <div className="piit-hero-actions">
            <button type="button" className="piit-hero-btn glass" onClick={refresh} disabled={refreshing || loading}>
              <RefreshCw size={16} className={refreshing ? 'spin' : ''} />
              Refresh
            </button>
          </div>
        </section>

        {/* ---------- Overdue (same red box as the Dashboard) ---------- */}
        {!loading && !error && overdueCount > 0 && (
          <div className="piit-alert">
            <span className="piit-alert-icon">
              <AlertTriangle size={20} />
            </span>
            <div className="piit-alert-text">
              <p className="piit-alert-title">
                {overdueCount} assessment{overdueCount === 1 ? '' : 's'} overdue
              </p>
              <p className="piit-alert-sub">The visit date has passed. Open the ticket and send the roof assessment.</p>
            </div>
            <button type="button" className="piit-alert-btn" onClick={openOverdue}>
              {overdueCount === 1 ? 'Open ticket' : 'Show them'}
              <ArrowRight size={15} />
            </button>
          </div>
        )}

        {/* ---------- Ticket list ---------- */}
        <section className="piit-card">
          <div className="piit-card-head">
            <div className="piit-card-title">
              <h2>
                <Inbox size={18} />
                Ticket List
              </h2>
              <p>Soonest visit first. Click a row to open the Assessment Sheet.</p>
            </div>
            <div className="piit-tools">
              <div className="piit-search">
                <Search size={16} className="piit-search-icon" />
                <input
                  type="text"
                  placeholder="Search name, ticket # or address"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                {searchTerm && (
                  <button type="button" className="piit-search-clear" onClick={() => setSearchTerm('')} aria-label="Clear search">
                    <X size={14} />
                  </button>
                )}
              </div>

              <FilterMenu
                options={FILTERS}
                activeKey={activeFilter}
                counts={loading || error ? {} : counts}
                onPick={pickFilter}
                alertKey="NEEDS_VISIT"
                ariaLabel="Filter tickets"
              />
            </div>
          </div>

          {error ? (
            <div className="piit-empty-state">
              <span className="piit-empty-badge piit-empty-badge-red">
                <AlertCircle size={26} />
              </span>
              <p className="piit-empty-title">Something went wrong</p>
              <p className="piit-empty-hint">{error}</p>
              <button type="button" className="piit-btn-primary" onClick={refresh}>
                <RefreshCw size={15} />
                Try again
              </button>
            </div>
          ) : !loading && shownTickets.length === 0 ? (
            <div className="piit-empty-state">
              <span className="piit-empty-badge">
                <Inbox size={26} />
              </span>
              <p className="piit-empty-title">{hasActiveFilters ? 'No matching tickets' : 'No incoming tickets'}</p>
              <p className="piit-empty-hint">
                {hasActiveFilters
                  ? 'Try a different name, ticket number or address, or try another filter.'
                  : "You're all caught up. New assignments will show up here."}
              </p>
              {hasActiveFilters && (
                <button type="button" className="piit-btn-secondary" onClick={clearAll}>
                  Show all tickets
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="piit-list" role="table">
                <div className="piit-row piit-head" role="row">
                  <span role="columnheader">Ticket #</span>
                  <span role="columnheader">Customer</span>
                  <span role="columnheader" className="piit-hide-md">Property Address</span>
                  <span role="columnheader" className="piit-hide-sm">Visit Date</span>
                  <span role="columnheader">Status</span>
                  <span aria-hidden="true" />
                </div>

                {loading
                  ? Array.from({ length: 5 }).map((_, i) => <RowSkeleton key={i} />)
                  : shownTickets.map((t) => {
                      const badge = STATUS_BADGE[t.status] || STATUS_BADGE.ASSESSMENT_SUBMITTED;
                      const name = t.full_name || t.customer_username;
                      const hint = visitHint(t);
                      const isLate = hint?.tone === 'late';

                      return (
                        <div
                          className={`piit-row piit-item ${isLate ? 'is-late' : ''} ${
                            t.status === 'PI_ASSIGNED' && !isLate ? 'is-action' : ''
                          }`}
                          key={t.id}
                          role="row"
                          tabIndex={0}
                          onClick={() => openTicket(t.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              openTicket(t.id);
                            }
                          }}
                        >
                          <span className="piit-ticket" role="cell">
                            {t.ticket_number}
                          </span>
                          <span className="piit-customer" role="cell">
                            <span className="piit-avatar">{getInitials(name)}</span>
                            <span className="piit-customer-text">
                              <span className="piit-customer-name">{name}</span>
                              <span className="piit-customer-sub">
                                {t.solar_package && <span className="piit-package">{t.solar_package}</span>}
                                <span className={`piit-inline-date ${isLate ? 'late' : ''}`}>
                                  {t.visit_date ? formatDate(t.visit_date) : 'No visit date'}
                                </span>
                              </span>
                              {t.property_address && (
                                <span className="piit-inline-address">
                                  <MapPin size={12} />
                                  <span>{t.property_address}</span>
                                </span>
                              )}
                            </span>
                          </span>
                          <span className="piit-hide-md" role="cell">
                            {t.property_address ? (
                              <span className="piit-address" title={t.property_address}>
                                <MapPin size={14} />
                                <span>{t.property_address}</span>
                              </span>
                            ) : (
                              <span className="piit-muted">No address</span>
                            )}
                          </span>
                          <span className="piit-hide-sm" role="cell">
                            {t.visit_date ? (
                              <span className="piit-date">
                                <span className="piit-date-main">{formatDate(t.visit_date)}</span>
                                {hint &&
                                  (hint.tone ? (
                                    <span className={`piit-date-flag ${hint.tone}`}>
                                      {isLate && <Clock size={11} />}
                                      {hint.text}
                                    </span>
                                  ) : (
                                    <span className="piit-date-sub">{hint.text}</span>
                                  ))}
                              </span>
                            ) : (
                              <span className="piit-muted">Not set</span>
                            )}
                          </span>
                          <span role="cell">
                            <span className={`piit-status tone-${badge.tone}`}>
                              <span className="piit-status-dot" />
                              {t.status_display}
                            </span>
                          </span>
                          <span className="piit-arrow" aria-hidden="true">
                            <ChevronRight size={18} />
                          </span>
                        </div>
                      );
                    })}
              </div>
            </>
          )}
        </section>
      </div>
    </PILayout>
  );
}
