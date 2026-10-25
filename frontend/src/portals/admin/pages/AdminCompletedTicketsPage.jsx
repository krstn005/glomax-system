import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  X,
  Layers,
  CheckCircle2,
  Award,
  MapPin,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  AlertTriangle,
  Inbox,
  RefreshCw,
  CheckCircle,
  CalendarCheck,
} from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import FilterMenu from '../../../components/FilterMenu';
import { getAdminTicketsPage } from '../../../api/adminTickets';
import '../styles/admin-completed-tickets.css';

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 400;

// Filter options - shown in the Filter drop-down button
const FILTERS = [
  { key: 'ALL', label: 'All Closed', statuses: ['APPROVED', 'COMPLETED'], icon: Layers, tone: 'navy' },
  { key: 'APPROVED', label: 'Approved', statuses: ['APPROVED'], icon: CheckCircle2, tone: 'green' },
  { key: 'COMPLETED', label: 'Completed', statuses: ['COMPLETED'], icon: Award, tone: 'gold' },
];

const STATUS_BADGE = {
  APPROVED: { tone: 'green', icon: CheckCircle2 },
  COMPLETED: { tone: 'gold', icon: Award },
};

const SYSTEM_TYPE_LABEL = {
  ON_GRID: 'On-Grid',
  HYBRID: 'Hybrid',
};

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatPeso(value) {
  const n = Number(value);
  if (!value || Number.isNaN(n)) return null;
  return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function getInitials(name) {
  const parts = (name || '?').trim().split(/\s+/);
  const first = parts[0]?.[0] || '?';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : parts[0]?.[1] || '';
  return (first + last).toUpperCase();
}

// Page numbers with "..." when there are many pages
function getPageNumbers(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set([1, total, current, current - 1, current + 1]);
  const list = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const result = [];
  list.forEach((p, i) => {
    if (i > 0 && p - list[i - 1] > 1) result.push('...');
    result.push(p);
  });
  return result;
}

function ListHead() {
  return (
    <div className="admct-row admct-head" role="row">
      <span>Ticket #</span>
      <span>Customer</span>
      <span className="admct-hide-md">Property Address</span>
      <span className="admct-hide-sm">System</span>
      <span>Final Price</span>
      <span className="admct-hide-sm">Date Closed</span>
      <span className="admct-right">Status</span>
    </div>
  );
}

function RowSkeleton() {
  return (
    <div className="admct-row admct-row-skeleton">
      <span className="admct-skel admct-skel-sm" />
      <span className="admct-skel-customer">
        <span className="admct-skel admct-skel-avatar" />
        <span className="admct-skel-stack">
          <span className="admct-skel admct-skel-md" />
          <span className="admct-skel admct-skel-xs" />
        </span>
      </span>
      <span className="admct-hide-md">
        <span className="admct-skel admct-skel-md" />
      </span>
      <span className="admct-hide-sm">
        <span className="admct-skel admct-skel-xs" />
      </span>
      <span>
        <span className="admct-skel admct-skel-sm" />
      </span>
      <span className="admct-hide-sm">
        <span className="admct-skel admct-skel-sm" />
      </span>
      <span className="admct-right">
        <span className="admct-skel admct-skel-pill" />
      </span>
    </div>
  );
}

function TicketRow({ ticket: t, onOpen }) {
  const name = t.full_name || t.customer_username;
  const badge = STATUS_BADGE[t.status] || STATUS_BADGE.APPROVED;
  const BadgeIcon = badge.icon;
  const price = formatPeso(t.final_sheet?.final_cost);
  const system = SYSTEM_TYPE_LABEL[t.system_type] || t.system_type || '—';
  const closed = formatDate(t.completed_at || t.updated_at);

  return (
    <div
      className={`admct-row admct-item outcome-${badge.tone}`}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(t.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(t.id);
        }
      }}
    >
      <span className="admct-ticket">{t.ticket_number}</span>

      <span className="admct-customer">
        <span className="admct-avatar">{getInitials(name)}</span>
        <span className="admct-customer-text">
          <span className="admct-customer-name">{name}</span>
          <span className="admct-customer-sub">
            {t.solar_package && <span className="admct-package">{t.solar_package}</span>}
            {/* Date shows here on smaller screens */}
            <span className="admct-date-inline">
              <CalendarCheck size={12} />
              {closed}
            </span>
          </span>
        </span>
      </span>

      <span className="admct-hide-md">
        {t.property_address ? (
          <span className="admct-address" title={t.property_address}>
            <MapPin size={14} />
            <span>{t.property_address}</span>
          </span>
        ) : (
          <span className="admct-muted">No address</span>
        )}
      </span>

      <span className="admct-hide-sm">
        <span className="admct-system">{system}</span>
      </span>

      <span>
        {price ? (
          <span className="admct-price">{price}</span>
        ) : (
          <span className="admct-no-sheet" title="This ticket has no Final Sheet">
            <AlertTriangle size={12} />
            No final sheet
          </span>
        )}
      </span>

      <span className="admct-hide-sm">
        <span className="admct-date">{closed}</span>
      </span>

      <span className="admct-right">
        <span className={`admct-status tone-${badge.tone}`}>
          <BadgeIcon size={13} />
          {t.status_display}
        </span>
        <ChevronRight size={17} className="admct-row-arrow" />
      </span>
    </div>
  );
}

export default function AdminCompletedTicketsPage() {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState([]);
  const [count, setCount] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrevious, setHasPrevious] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeFilter, setActiveFilter] = useState('ALL');
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [counts, setCounts] = useState({});
  const [reloadKey, setReloadKey] = useState(0);

  const currentFilter = FILTERS.find((f) => f.key === activeFilter) || FILTERS[0];

  // Wait a moment after typing before searching
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchTerm(searchInput.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Load the current page of tickets
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const data = await getAdminTicketsPage(page, currentFilter.statuses.join(','), searchTerm || null);
        if (cancelled) return;
        const sorted = [...data.results].sort(
          (a, b) => new Date(b.completed_at || b.updated_at) - new Date(a.completed_at || a.updated_at)
        );
        setTickets(sorted);
        setCount(data.count);
        setHasNext(Boolean(data.next));
        setHasPrevious(Boolean(data.previous));
        setError('');
      } catch {
        if (!cancelled) setError('Could not load completed tickets. Please try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, activeFilter, searchTerm, reloadKey]);

  // Counts for the Filter list - when the page opens and on Refresh
  useEffect(() => {
    let cancelled = false;

    async function loadCounts() {
      try {
        const results = await Promise.all(
          FILTERS.map(async (f) => {
            const data = await getAdminTicketsPage(1, f.statuses.join(','));
            return [f.key, data.count];
          })
        );
        if (!cancelled) setCounts(Object.fromEntries(results));
      } catch {
        // Counts are a nice-to-have; the list just shows "—" if this fails.
      }
    }

    loadCounts();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  function changeFilter(key) {
    setActiveFilter(key);
    setPage(1);
  }

  function clearAll() {
    setSearchInput('');
    changeFilter('ALL');
  }

  function openTicket(id) {
    navigate(`/admin/requests/${id}`);
  }

  function refresh() {
    setError('');
    setReloadKey((k) => k + 1);
  }

  function goToPage(p) {
    setPage(p);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const hasActiveFilters = activeFilter !== 'ALL' || Boolean(searchTerm);
  const totalCount = counts.ALL;
  const waitingCount = counts.APPROVED;

  return (
    <AdminLayout pageTitle="Completed Tickets" pageSubtitle="Approved and finished solar installation projects">
      <div className="admct-page">
        {/* ---------- Banner ---------- */}
        <section className="admct-hero">
          <div className="admct-hero-glow" aria-hidden="true" />
          <div className="admct-hero-icon">
            <CheckCircle size={26} />
          </div>
          <div className="admct-hero-text">
            <h1>Approved Projects</h1>
            <p>
              {totalCount === undefined
                ? 'Every ticket you approved, from waiting for install to finished.'
                : `${totalCount} approved ticket${totalCount === 1 ? '' : 's'}${
                    waitingCount ? `, ${waitingCount} still waiting for installation` : ''
                  }.`}
            </p>
          </div>
          <div className="admct-hero-actions">
            <button type="button" className="admct-hero-btn glass" onClick={refresh} disabled={loading}>
              <RefreshCw size={16} className={loading ? 'spin' : ''} />
              Refresh
            </button>
          </div>
        </section>

        {/* ---------- Ticket list ---------- */}
        <section className="admct-card">
          <div className="admct-card-head">
            <div className="admct-card-title">
              <h2>
                <CheckCircle size={18} />
                Ticket List
              </h2>
              <p>Click any row to see the full ticket, quotations and Final Sheet.</p>
            </div>

            <div className="admct-tools">
              <div className="admct-search">
                <Search size={17} className="admct-search-icon" />
                <input
                  type="text"
                  placeholder="Search name, ticket # or address"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                />
                {searchInput && (
                  <button
                    type="button"
                    className="admct-search-clear"
                    onClick={() => setSearchInput('')}
                    aria-label="Clear search"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              <FilterMenu
                options={FILTERS}
                activeKey={activeFilter}
                counts={counts}
                onPick={changeFilter}
                ariaLabel="Filter by status"
              />
            </div>
          </div>

          {error ? (
            <div className="admct-empty">
              <span className="admct-empty-badge red">
                <AlertCircle size={26} />
              </span>
              <p className="admct-empty-title">Something went wrong</p>
              <p className="admct-empty-hint">{error}</p>
              <button type="button" className="admct-btn-primary" onClick={refresh}>
                <RefreshCw size={15} />
                Try again
              </button>
            </div>
          ) : loading ? (
            <div className="admct-list" role="table">
              <ListHead />
              {Array.from({ length: 5 }).map((_, i) => (
                <RowSkeleton key={i} />
              ))}
            </div>
          ) : tickets.length === 0 ? (
            <div className="admct-empty">
              <span className="admct-empty-badge">
                <Inbox size={26} />
              </span>
              <p className="admct-empty-title">
                {hasActiveFilters ? 'No tickets match your search or filter' : 'No completed tickets yet'}
              </p>
              <p className="admct-empty-hint">
                {hasActiveFilters
                  ? 'Try a different name, ticket number or address, or try another filter.'
                  : 'Tickets show up here once you approve them.'}
              </p>
              {hasActiveFilters && (
                <button type="button" className="admct-btn-secondary" onClick={clearAll}>
                  Show all tickets
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="admct-list" role="table">
                <ListHead />
                {tickets.map((t) => (
                  <TicketRow key={t.id} ticket={t} onOpen={openTicket} />
                ))}
              </div>

              {/* Page buttons only show when there's more than one page */}
              {totalPages > 1 && (
                <div className="admct-pagination">
                  <div className="admct-pagination-controls">
                    <button
                      type="button"
                      className="admct-page-btn"
                      disabled={!hasPrevious}
                      onClick={() => goToPage(page - 1)}
                      aria-label="Previous page"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    {getPageNumbers(page, totalPages).map((p, i) =>
                      p === '...' ? (
                        <span key={`gap-${i}`} className="admct-page-gap">…</span>
                      ) : (
                        <button
                          key={p}
                          type="button"
                          className={`admct-page-num ${p === page ? 'active' : ''}`}
                          onClick={() => goToPage(p)}
                        >
                          {p}
                        </button>
                      )
                    )}
                    <button
                      type="button"
                      className="admct-page-btn"
                      disabled={!hasNext}
                      onClick={() => goToPage(page + 1)}
                      aria-label="Next page"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </AdminLayout>
  );
}