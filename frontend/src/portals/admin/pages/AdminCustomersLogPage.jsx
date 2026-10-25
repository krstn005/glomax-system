import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  X,
  Layers,
  CheckCircle2,
  Award,
  XCircle,
  Undo2,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  AlertTriangle,
  Inbox,
  HardHat,
  RefreshCw,
  MapPin,
  Package,
  Zap,
  Calendar,
  Clock,
  ExternalLink,
  FileText,
  ClipboardList,
} from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import FilterMenu from '../../../components/FilterMenu';
import { getAdminTicketsPage } from '../../../api/adminTickets';
import '../styles/admin-customers-log.css';

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 400;

// Filter options - shown in the Filter drop-down button
const FILTERS = [
  {
    key: 'ALL',
    label: 'All Records',
    statuses: ['APPROVED', 'COMPLETED', 'NC_CANNOT_PROCEED', 'NC_CAN_REAPPLY', 'WITHDRAWN'],
    icon: Layers,
    tone: 'navy',
  },
  { key: 'APPROVED', label: 'Approved', statuses: ['APPROVED'], icon: CheckCircle2, tone: 'green' },
  { key: 'COMPLETED', label: 'Completed', statuses: ['COMPLETED'], icon: Award, tone: 'gold' },
  { key: 'NOT_COMPATIBLE', label: 'Not Compatible', statuses: ['NC_CANNOT_PROCEED', 'NC_CAN_REAPPLY'], icon: XCircle, tone: 'red' },
  { key: 'WITHDRAWN', label: 'Withdrawn', statuses: ['WITHDRAWN'], icon: Undo2, tone: 'gray' },
];

const STATUS_BADGE = {
  APPROVED: { tone: 'green', icon: CheckCircle2 },
  COMPLETED: { tone: 'gold', icon: Award },
  NC_CANNOT_PROCEED: { tone: 'red', icon: XCircle },
  NC_CAN_REAPPLY: { tone: 'red', icon: XCircle },
  WITHDRAWN: { tone: 'gray', icon: Undo2 },
};

const HAS_FINAL_SHEET = ['APPROVED', 'COMPLETED'];

const SYSTEM_TYPE_LABEL = {
  ON_GRID: 'On-Grid',
  HYBRID: 'Hybrid',
};

function toDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDate(value) {
  const d = toDate(value);
  if (!d) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatPeso(value) {
  const n = Number(value);
  if (!value || Number.isNaN(n)) return null;
  return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function getClosedDate(t) {
  return t.completed_at || t.updated_at;
}

function daysBetween(start, end) {
  const a = toDate(start);
  const b = toDate(end);
  if (!a || !b) return null;
  return Math.max(0, Math.round((b - a) / 86400000));
}

// Groups the rows by the month they were closed
function groupByMonth(list) {
  const groups = [];
  list.forEach((t) => {
    const d = toDate(getClosedDate(t));
    const key = d ? `${d.getFullYear()}-${d.getMonth()}` : 'unknown';
    const label = d ? d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : 'No date';
    let group = groups.find((g) => g.key === key);
    if (!group) {
      group = { key, label, items: [] };
      groups.push(group);
    }
    group.items.push(t);
  });
  return groups;
}

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

function StatusBadge({ ticket }) {
  const badge = STATUS_BADGE[ticket.status] || { tone: 'gray', icon: Layers };
  const Icon = badge.icon;
  return (
    <span className={`admcl-status tone-${badge.tone}`}>
      <Icon size={12} />
      {ticket.status_display}
    </span>
  );
}

function PriceCell({ ticket }) {
  const price = formatPeso(ticket.final_sheet?.final_cost);
  if (price) return <span className="admcl-price">{price}</span>;
  if (HAS_FINAL_SHEET.includes(ticket.status)) {
    return (
      <span className="admcl-no-sheet" title="This ticket has no Final Sheet">
        <AlertTriangle size={12} />
        No final sheet
      </span>
    );
  }
  return <span className="admcl-muted">Not needed</span>;
}

function ListHead() {
  return (
    <div className="admcl-row admcl-head" role="row">
      <span>Ticket #</span>
      <span>Customer</span>
      <span className="admcl-hide-md">Package</span>
      <span className="admcl-hide-sm">Partner Installer</span>
      <span>Final Price</span>
      <span className="admcl-hide-sm">Date Closed</span>
      <span className="admcl-right">Status</span>
    </div>
  );
}

function RowSkeleton() {
  return (
    <div className="admcl-row admcl-row-skeleton">
      <span className="admcl-skel admcl-skel-sm" />
      <span className="admcl-skel-person">
        <span className="admcl-skel admcl-skel-avatar" />
        <span className="admcl-skel admcl-skel-md" />
      </span>
      <span className="admcl-hide-md">
        <span className="admcl-skel admcl-skel-md" />
      </span>
      <span className="admcl-hide-sm">
        <span className="admcl-skel admcl-skel-sm" />
      </span>
      <span>
        <span className="admcl-skel admcl-skel-sm" />
      </span>
      <span className="admcl-hide-sm">
        <span className="admcl-skel admcl-skel-sm" />
      </span>
      <span className="admcl-right">
        <span className="admcl-skel admcl-skel-pill" />
      </span>
    </div>
  );
}

function QuickView({ ticket, onClose, onOpen }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const name = ticket.full_name || ticket.customer_username;
  const badge = STATUS_BADGE[ticket.status] || { tone: 'gray' };
  const system = SYSTEM_TYPE_LABEL[ticket.system_type] || ticket.system_type || '—';
  const closed = getClosedDate(ticket);
  const days = daysBetween(ticket.created_at, closed);
  const terms = ticket.final_sheet?.payment_terms_summary;

  return (
    <div className="admcl-drawer-overlay" onMouseDown={onClose}>
      <aside
        className="admcl-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`Quick view of ${ticket.ticket_number}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className={`admcl-drawer-head tone-${badge.tone}`}>
          <div className="admcl-drawer-glow" aria-hidden="true" />
          <div className="admcl-drawer-top">
            <span className="admcl-drawer-ticket">{ticket.ticket_number}</span>
            <button type="button" className="admcl-drawer-close" onClick={onClose} aria-label="Close">
              <X size={18} />
            </button>
          </div>
          <div className="admcl-drawer-person">
            <span className="admcl-avatar large">{getInitials(name)}</span>
            <div>
              <h3>{name}</h3>
              {ticket.full_name && ticket.customer_username && <p>@{ticket.customer_username}</p>}
            </div>
          </div>
          <StatusBadge ticket={ticket} />
        </div>

        <div className="admcl-drawer-body">
          <div className="admcl-drawer-price">
            <span className="admcl-drawer-label">Final Price</span>
            <PriceCell ticket={ticket} />
            {terms && <span className="admcl-drawer-terms">{terms}</span>}
          </div>

          <div className="admcl-drawer-section">
            <p className="admcl-drawer-section-title">Details</p>
            <ul className="admcl-info-list">
              <li>
                <MapPin size={15} />
                <span className="admcl-info-label">Address</span>
                <span className="admcl-info-value">{ticket.property_address || '—'}</span>
              </li>
              <li>
                <Package size={15} />
                <span className="admcl-info-label">Package</span>
                <span className="admcl-info-value">{ticket.solar_package || '—'}</span>
              </li>
              <li>
                <Zap size={15} />
                <span className="admcl-info-label">System</span>
                <span className="admcl-info-value">{system}</span>
              </li>
              <li>
                <HardHat size={15} />
                <span className="admcl-info-label">Installer</span>
                <span className="admcl-info-value">{ticket.partner_installer_username || 'Not assigned'}</span>
              </li>
            </ul>
          </div>

          <div className="admcl-drawer-section">
            <p className="admcl-drawer-section-title">Timeline</p>
            <div className="admcl-timeline">
              <div className="admcl-timeline-item">
                <span className="admcl-timeline-dot" />
                <div>
                  <span className="admcl-timeline-title">
                    <FileText size={13} />
                    Request submitted
                  </span>
                  <span className="admcl-timeline-date">{formatDate(ticket.created_at)}</span>
                </div>
              </div>
              <div className="admcl-timeline-item">
                <span className={`admcl-timeline-dot tone-${badge.tone}`} />
                <div>
                  <span className="admcl-timeline-title">
                    <Calendar size={13} />
                    Closed as {ticket.status_display}
                  </span>
                  <span className="admcl-timeline-date">{formatDate(closed)}</span>
                </div>
              </div>
            </div>
            {days !== null && (
              <p className="admcl-duration">
                <Clock size={14} />
                <span>
                  Took <strong>{days === 0 ? 'less than a day' : `${days} day${days === 1 ? '' : 's'}`}</strong> from
                  request to close
                </span>
              </p>
            )}
          </div>
        </div>

        <div className="admcl-drawer-foot">
          <button type="button" className="admcl-btn-secondary" onClick={onClose}>
            Close
          </button>
          <button type="button" className="admcl-btn-primary" onClick={onOpen}>
            Open full ticket
            <ExternalLink size={15} />
          </button>
        </div>
      </aside>
    </div>
  );
}

export default function AdminCustomersLogPage() {
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
  const [selected, setSelected] = useState(null);

  const currentFilter = FILTERS.find((f) => f.key === activeFilter) || FILTERS[0];

  // Wait a moment after typing before searching
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchTerm(searchInput.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const data = await getAdminTicketsPage(page, currentFilter.statuses.join(','), searchTerm || null);
        if (cancelled) return;
        const sorted = [...data.results].sort(
          (a, b) => (toDate(getClosedDate(b)) || 0) - (toDate(getClosedDate(a)) || 0)
        );
        setTickets(sorted);
        setCount(data.count);
        setHasNext(Boolean(data.next));
        setHasPrevious(Boolean(data.previous));
        setError('');
      } catch {
        if (!cancelled) setError('Could not load customer records. Please try again.');
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

  // Counts load when the page opens (and on Refresh)
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
        // Counts are a nice-to-have; the Filter list just shows "—".
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

  function refresh() {
    setError('');
    setReloadKey((k) => k + 1);
  }

  function goToPage(p) {
    setPage(p);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const total = counts.ALL;
  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const hasActiveFilters = activeFilter !== 'ALL' || Boolean(searchTerm);
  const groups = groupByMonth(tickets);
  const successCount = (counts.APPROVED || 0) + (counts.COMPLETED || 0);
  const successPct = total ? Math.round((successCount / total) * 100) : 0;

  return (
    <AdminLayout pageTitle="All Customers Log" pageSubtitle="A full record of every closed customer request">
      <div className="admcl-page">
        {/* ---------- Banner: totals ---------- */}
        <section className="admcl-hero">
          <div className="admcl-hero-glow" aria-hidden="true" />

          <div className="admcl-hero-main">
            <span className="admcl-hero-icon">
              <ClipboardList size={24} />
            </span>
            <div className="admcl-hero-text">
              <p className="admcl-hero-label">Closed Records</p>
              <p className="admcl-hero-value">{total !== undefined ? total : '—'}</p>
              <p className="admcl-hero-note">
                {total ? (
                  <>
                    <strong>{successPct}%</strong> went through (approved or completed)
                  </>
                ) : (
                  'No closed requests yet'
                )}
              </p>
            </div>
            <button type="button" className="admcl-hero-btn" onClick={refresh} disabled={loading}>
              <RefreshCw size={15} className={loading ? 'spin' : ''} />
              <span>Refresh</span>
            </button>
          </div>
        </section>

        {/* ---------- Records ---------- */}
        <section className="admcl-card">
          <div className="admcl-card-head">
            <div className="admcl-card-title">
              <h2>
                <ClipboardList size={18} />
                Customer Records
              </h2>
              <p>Click a row for a quick view. Open the full ticket from there.</p>
            </div>

            <div className="admcl-tools">
              <div className="admcl-search">
                <Search size={17} className="admcl-search-icon" />
                <input
                  type="text"
                  placeholder="Search customer, ticket # or address"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                />
                {searchInput && (
                  <button
                    type="button"
                    className="admcl-search-clear"
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
                ariaLabel="Filter records"
              />
            </div>
          </div>

          {error ? (
            <div className="admcl-empty">
              <span className="admcl-empty-badge red">
                <AlertCircle size={26} />
              </span>
              <p className="admcl-empty-title">Something went wrong</p>
              <p className="admcl-empty-hint">{error}</p>
              <button type="button" className="admcl-btn-primary" onClick={refresh}>
                <RefreshCw size={15} />
                Try again
              </button>
            </div>
          ) : loading ? (
            <div className="admcl-list" role="table">
              <ListHead />
              {Array.from({ length: 5 }).map((_, i) => (
                <RowSkeleton key={i} />
              ))}
            </div>
          ) : tickets.length === 0 ? (
            <div className="admcl-empty">
              <span className="admcl-empty-badge">
                <Inbox size={26} />
              </span>
              <p className="admcl-empty-title">
                {hasActiveFilters ? 'No records match your search or filter' : 'No customer records yet'}
              </p>
              <p className="admcl-empty-hint">
                {hasActiveFilters
                  ? 'Try a different name or ticket number, or try another filter.'
                  : 'Records show up here once a request is approved, completed, found not compatible, or withdrawn.'}
              </p>
              {hasActiveFilters && (
                <button type="button" className="admcl-btn-secondary" onClick={clearAll}>
                  Show all records
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="admcl-list" role="table">
                <ListHead />
                {groups.map((g) => (
                  <div key={g.key} className="admcl-group" role="rowgroup">
                    <div className="admcl-group-row">
                      <span className="admcl-group-label">
                        <Calendar size={13} />
                        {g.label}
                      </span>
                      <span className="admcl-group-count">
                        {g.items.length} record{g.items.length === 1 ? '' : 's'}
                      </span>
                    </div>

                    {g.items.map((t) => {
                      const name = t.full_name || t.customer_username;
                      const badge = STATUS_BADGE[t.status] || { tone: 'gray' };
                      const system = SYSTEM_TYPE_LABEL[t.system_type] || t.system_type;
                      const isSelected = selected?.id === t.id;

                      return (
                        <div
                          key={t.id}
                          className={`admcl-row admcl-item tone-${badge.tone} ${isSelected ? 'selected' : ''}`}
                          onClick={() => setSelected(t)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setSelected(t);
                            }
                          }}
                        >
                          <span className="admcl-ticket">{t.ticket_number}</span>

                          <span className="admcl-person">
                            <span className="admcl-avatar">{getInitials(name)}</span>
                            <span className="admcl-person-text">
                              <span className="admcl-person-name">{name}</span>
                              <span className="admcl-person-sub">
                                {t.full_name && t.customer_username && <span>@{t.customer_username}</span>}
                                {/* Package and date show here on smaller screens */}
                                {t.solar_package && <span className="admcl-inline-package">{t.solar_package}</span>}
                                <span className="admcl-inline-date">
                                  <Calendar size={11} />
                                  {formatDate(getClosedDate(t))}
                                </span>
                              </span>
                            </span>
                          </span>

                          <span className="admcl-hide-md">
                            <span className="admcl-package">
                              <span className="admcl-package-name">{t.solar_package || '—'}</span>
                              {system && <span className="admcl-package-sub">{system}</span>}
                            </span>
                          </span>

                          <span className="admcl-hide-sm">
                            {t.partner_installer_username ? (
                              <span className="admcl-installer">
                                <span className="admcl-installer-icon">
                                  <HardHat size={14} />
                                </span>
                                <span className="admcl-installer-name">{t.partner_installer_username}</span>
                              </span>
                            ) : (
                              <span className="admcl-unassigned">Not assigned</span>
                            )}
                          </span>

                          <span>
                            <PriceCell ticket={t} />
                          </span>

                          <span className="admcl-hide-sm admcl-date">{formatDate(getClosedDate(t))}</span>

                          <span className="admcl-right">
                            <StatusBadge ticket={t} />
                            <ChevronRight size={17} className="admcl-row-arrow" />
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>

              {/* Page buttons only show when there is more than one page */}
              {totalPages > 1 && (
                <div className="admcl-pagination">
                  <div className="admcl-pagination-controls">
                    <button
                      type="button"
                      className="admcl-page-btn"
                      disabled={!hasPrevious}
                      onClick={() => goToPage(page - 1)}
                      aria-label="Previous page"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    {getPageNumbers(page, totalPages).map((p, i) =>
                      p === '...' ? (
                        <span key={`gap-${i}`} className="admcl-page-gap">…</span>
                      ) : (
                        <button
                          key={p}
                          type="button"
                          className={`admcl-page-num ${p === page ? 'active' : ''}`}
                          onClick={() => goToPage(p)}
                        >
                          {p}
                        </button>
                      )
                    )}
                    <button
                      type="button"
                      className="admcl-page-btn"
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

      {selected && (
        <QuickView
          ticket={selected}
          onClose={() => setSelected(null)}
          onOpen={() => navigate(`/admin/requests/${selected.id}`)}
        />
      )}
    </AdminLayout>
  );
}