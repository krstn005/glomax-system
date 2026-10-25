import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  X,
  History,
  Layers,
  CheckCircle2,
  Award,
  XCircle,
  MinusCircle,
  MapPin,
  AlertCircle,
  RefreshCw,
  ChevronRight,
  Hammer,
} from 'lucide-react';
import PILayout from '../components/PILayout';
import FilterMenu from '../../../components/FilterMenu';
import { getInstallerTickets } from '../../../api/piTickets';
import '../styles/pi-ticket-history.css';

// Ticket History shows tickets that have reached a final outcome.
// Active ones live on Incoming Tickets instead.
const FINAL_STATUSES = ['APPROVED', 'COMPLETED', 'NC_CANNOT_PROCEED', 'NC_CAN_REAPPLY', 'WITHDRAWN'];

// Filter options - shown in the Filter drop-down button
const FILTERS = [
  { key: 'ALL', label: 'All Closed', statuses: FINAL_STATUSES, icon: Layers, tone: 'navy' },
  { key: 'APPROVED', label: 'Approved', statuses: ['APPROVED'], icon: CheckCircle2, tone: 'green' },
  { key: 'COMPLETED', label: 'Completed', statuses: ['COMPLETED'], icon: Award, tone: 'gold' },
  { key: 'NOT_COMPATIBLE', label: 'Not Compatible', statuses: ['NC_CANNOT_PROCEED', 'NC_CAN_REAPPLY'], icon: XCircle, tone: 'red' },
  { key: 'WITHDRAWN', label: 'Withdrawn', statuses: ['WITHDRAWN'], icon: MinusCircle, tone: 'gray' },
];

// Badge look for each ticket status
const STATUS_BADGE = {
  APPROVED: { tone: 'green', icon: CheckCircle2 },
  COMPLETED: { tone: 'gold', icon: Award },
  NC_CANNOT_PROCEED: { tone: 'red', icon: XCircle },
  NC_CAN_REAPPLY: { tone: 'red', icon: XCircle },
  WITHDRAWN: { tone: 'gray', icon: MinusCircle },
};

// Reads "YYYY-MM-DD" as a local date. new Date("2026-09-15") would be
// read as UTC, which can show the wrong day in the Philippines.
function parseLocalDate(value) {
  if (!value) return null;
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatVisitDate(value) {
  const date = parseLocalDate(value);
  if (!date) return null;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// For full timestamps like completed_at / updated_at
function formatTimestamp(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function closedDate(ticket) {
  return ticket.completed_at || ticket.updated_at;
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
    <div className="pith-row pith-row-skeleton">
      <span className="pith-skel pith-skel-w-sm" />
      <span className="pith-skel-customer">
        <span className="pith-skel pith-skel-avatar" />
        <span className="pith-skel pith-skel-w-md" />
      </span>
      <span className="pith-hide-md">
        <span className="pith-skel pith-skel-w-lg" />
      </span>
      <span className="pith-hide-sm">
        <span className="pith-skel pith-skel-w-sm" />
      </span>
      <span>
        <span className="pith-skel pith-skel-pill" />
      </span>
      <span />
    </div>
  );
}

export default function PITicketHistoryPage() {
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
        if (!cancelled) setError('Could not load your ticket history. Please try again.');
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

  const closedTickets = tickets.filter((t) => FINAL_STATUSES.includes(t.status));

  // Counts for the Filter list
  const counts = {};
  FILTERS.forEach((f) => {
    counts[f.key] = closedTickets.filter((t) => f.statuses.includes(t.status)).length;
  });

  const currentFilter = FILTERS.find((f) => f.key === activeFilter) || FILTERS[0];
  const rawTerm = searchTerm.trim().toLowerCase();
  const hasActiveFilters = activeFilter !== 'ALL' || Boolean(rawTerm);

  // Filter, search, then newest closed first
  const shownTickets = closedTickets
    .filter((t) => currentFilter.statuses.includes(t.status))
    .filter((t) => {
      if (!rawTerm) return true;
      return (
        (t.ticket_number || '').toLowerCase().includes(rawTerm) ||
        (t.full_name || t.customer_username || '').toLowerCase().includes(rawTerm) ||
        (t.property_address || '').toLowerCase().includes(rawTerm)
      );
    })
    .sort((a, b) => new Date(closedDate(b)) - new Date(closedDate(a)));

  function clearAll() {
    setSearchTerm('');
    setActiveFilter('ALL');
  }

  // Pick a choice from the Filter button
  function pickFilter(key) {
    setActiveFilter(key);
  }

  const successCount = counts.APPROVED + counts.COMPLETED;
  let heroText;
  if (loading) heroText = 'Loading your ticket history...';
  else if (error) heroText = 'Your ticket history could not be loaded right now.';
  else if (closedTickets.length === 0) heroText = 'Tickets will show up here once they reach a final outcome.';
  else
    heroText = `${closedTickets.length} closed ticket${closedTickets.length === 1 ? '' : 's'} · ${successCount} approved or completed.`;

  return (
    <PILayout pageTitle="Ticket History" pageSubtitle="Tickets that have reached a final outcome">
      <div className="pith-page">
        {/* ---------- Banner ---------- */}
        <section className="pith-hero">
          <div className="pith-hero-glow" aria-hidden="true" />
          <div className="pith-hero-icon">
            <History size={26} />
          </div>
          <div className="pith-hero-text">
            <h1>Ticket History</h1>
            <p>{heroText}</p>
          </div>
          <div className="pith-hero-actions">
            <button type="button" className="pith-hero-btn glass" onClick={refresh} disabled={refreshing || loading}>
              <RefreshCw size={16} className={refreshing ? 'spin' : ''} />
              Refresh
            </button>
          </div>
        </section>

        {/* ---------- Ticket list ---------- */}
        <section className="pith-card">
          <div className="pith-card-head">
            <div className="pith-card-title">
              <h2>
                <History size={18} />
                Ticket List
              </h2>
              <p>Newest first. Click a row to see the assessment and photos.</p>
            </div>
            <div className="pith-tools">
              <div className="pith-search">
                <Search size={16} className="pith-search-icon" />
                <input
                  type="text"
                  placeholder="Search name, ticket # or address"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                {searchTerm && (
                  <button type="button" className="pith-search-clear" onClick={() => setSearchTerm('')} aria-label="Clear search">
                    <X size={14} />
                  </button>
                )}
              </div>

              <FilterMenu
                options={FILTERS}
                activeKey={activeFilter}
                counts={loading || error ? {} : counts}
                onPick={pickFilter}
                ariaLabel="Filter by outcome"
              />
            </div>
          </div>

          {error ? (
            <div className="pith-empty-state">
              <span className="pith-empty-badge pith-empty-badge-red">
                <AlertCircle size={26} />
              </span>
              <p className="pith-empty-title">Something went wrong</p>
              <p className="pith-empty-hint">{error}</p>
              <button type="button" className="pith-btn-primary" onClick={refresh}>
                <RefreshCw size={15} />
                Try again
              </button>
            </div>
          ) : !loading && shownTickets.length === 0 ? (
            <div className="pith-empty-state">
              <span className="pith-empty-badge">
                <History size={26} />
              </span>
              <p className="pith-empty-title">{hasActiveFilters ? 'No matching tickets' : 'No closed tickets yet'}</p>
              <p className="pith-empty-hint">
                {hasActiveFilters
                  ? 'Try a different name, ticket number or address, or try another filter.'
                  : 'Tickets will show up here once they reach a final outcome.'}
              </p>
              {hasActiveFilters && (
                <button type="button" className="pith-btn-secondary" onClick={clearAll}>
                  Show all tickets
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="pith-list" role="table">
                <div className="pith-row pith-head" role="row">
                  <span role="columnheader">Ticket #</span>
                  <span role="columnheader">Customer</span>
                  <span role="columnheader" className="pith-hide-md">Property Address</span>
                  <span role="columnheader" className="pith-hide-sm">Date Closed</span>
                  <span role="columnheader">Outcome</span>
                  <span aria-hidden="true" />
                </div>

                {loading
                  ? Array.from({ length: 5 }).map((_, i) => <RowSkeleton key={i} />)
                  : shownTickets.map((t) => {
                      const badge = STATUS_BADGE[t.status] || STATUS_BADGE.APPROVED;
                      const name = t.full_name || t.customer_username;
                      const visited = formatVisitDate(t.visit_date);

                      return (
                        <div
                          className={`pith-row pith-item tone-${badge.tone}`}
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
                          <span className="pith-ticket" role="cell">
                            {t.ticket_number}
                          </span>
                          <span className="pith-customer" role="cell">
                            <span className="pith-avatar">{getInitials(name)}</span>
                            <span className="pith-customer-text">
                              <span className="pith-customer-name">{name}</span>
                              <span className="pith-customer-sub">
                                {t.solar_package && <span className="pith-package">{t.solar_package}</span>}
                                <span className="pith-inline-date">Closed {formatTimestamp(closedDate(t))}</span>
                              </span>
                              {t.property_address && (
                                <span className="pith-inline-address">
                                  <MapPin size={12} />
                                  <span>{t.property_address}</span>
                                </span>
                              )}
                            </span>
                          </span>
                          <span className="pith-hide-md" role="cell">
                            {t.property_address ? (
                              <span className="pith-address" title={t.property_address}>
                                <MapPin size={14} />
                                <span>{t.property_address}</span>
                              </span>
                            ) : (
                              <span className="pith-muted">No address</span>
                            )}
                          </span>
                          <span className="pith-hide-sm" role="cell">
                            <span className="pith-date">
                              <span className="pith-date-main">{formatTimestamp(closedDate(t))}</span>
                              <span className="pith-date-sub">{visited ? `Visited ${visited}` : 'No visit date'}</span>
                            </span>
                          </span>
                          <span role="cell">
                            <span className="pith-outcome">
                              <span className={`pith-status tone-${badge.tone}`}>
                                <span className="pith-status-dot" />
                                {t.status_display}
                              </span>
                              {t.status === 'APPROVED' && (
                                <span className="pith-needs">
                                  <Hammer size={11} />
                                  Needs completion
                                </span>
                              )}
                            </span>
                          </span>
                          <span className="pith-arrow" aria-hidden="true">
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
