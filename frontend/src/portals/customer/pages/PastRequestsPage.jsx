import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Search,
  X,
  History,
  AlertCircle,
  Plus,
  Download,
  User,
  Phone,
  MapPin,
  CalendarDays,
  Package,
  Zap,
  HardHat,
  FileText,
  SearchX,
  SlidersHorizontal,
  ChevronDown,
  Eye,
  Check,
  Layers,
  Award,
  CheckCircle2,
  XCircle,
  MinusCircle,
  RotateCcw,
} from 'lucide-react';
import { getMyTickets, downloadFinalSheetPDF } from '../../../api/tickets';
import { formatCurrency } from '../../../utils/currency';
import CustomerLayout from '../components/CustomerLayout';
import '../styles/past-requests.css';

const ACTIVE_STATUSES = ['REQUEST_SUBMITTED', 'PI_ASSIGNED', 'ASSESSMENT_SUBMITTED', 'STAFF_REVIEW', 'ADMIN_REVIEW'];
const NOT_COMPATIBLE = ['NC_CANNOT_PROCEED', 'NC_CAN_REAPPLY'];
const NO_PRICE_STATUSES = ['WITHDRAWN', ...NOT_COMPATIBLE];

// These can be reapplied using the same ticket (same reference number)
const REAPPLY_STATUSES = ['WITHDRAWN', 'NC_CAN_REAPPLY'];

function canReapply(ticket) {
  return typeof ticket.can_reapply === 'boolean' ? ticket.can_reapply : REAPPLY_STATUSES.includes(ticket.status);
}

// Choices in the Filter drop-down
const FILTER_OPTIONS = [
  { key: 'ALL', label: 'All Requests', icon: Layers, tone: 'navy', match: () => true },
  { key: 'COMPLETED', label: 'Completed', icon: Award, tone: 'navy', match: (s) => s === 'COMPLETED' },
  { key: 'APPROVED', label: 'Approved', icon: CheckCircle2, tone: 'green', match: (s) => s === 'APPROVED' },
  { key: 'NOT_COMPATIBLE', label: 'Not Compatible', icon: XCircle, tone: 'red', match: (s) => NOT_COMPATIBLE.includes(s) },
  { key: 'WITHDRAWN', label: 'Withdrawn', icon: MinusCircle, tone: 'gray', match: (s) => s === 'WITHDRAWN' },
];

// Same colours as the Dashboard and the other portals
const STATUS_TONE = {
  APPROVED: 'green',
  COMPLETED: 'done',
  WITHDRAWN: 'gray',
  NC_CANNOT_PROCEED: 'red',
  NC_CAN_REAPPLY: 'red',
};

function toneOf(status) {
  return STATUS_TONE[status] || 'blue';
}

function formatDate(dateStr, month = 'short') {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month, day: 'numeric' });
}

function systemLabel(systemType) {
  return systemType === 'HYBRID' ? 'Hybrid' : 'On-Grid';
}

// Newest Updated Quotation first, then the Initial one
function getLatestQuote(quotations = []) {
  const updated = quotations
    .filter((q) => q.quotation_type === 'UPDATED')
    .sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at));
  if (updated.length > 0) return updated[0];
  return quotations.find((q) => q.quotation_type === 'INITIAL') || null;
}

// Withdrawn and Not Compatible requests have no real price
function getPrice(ticket) {
  if (NO_PRICE_STATUSES.includes(ticket.status)) return null;
  return ticket.final_sheet?.final_cost || getLatestQuote(ticket.quotations || [])?.estimated_cost || null;
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
    <div className="pr-filter" ref={wrapRef}>
      <button
        type="button"
        className={`pr-filter-btn ${open ? 'open' : ''} ${isFiltered ? 'filtered' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Filter by status"
      >
        {isFiltered ? <CurrentIcon size={16} /> : <SlidersHorizontal size={16} />}
        <span className="pr-filter-text">{isFiltered ? current.label : 'Filter'}</span>
        <ChevronDown size={16} className="pr-filter-chevron" />
      </button>

      {isFiltered && (
        <button type="button" className="pr-filter-clear" onClick={() => onChange('ALL')} aria-label="Clear filter">
          <X size={14} />
        </button>
      )}

      {open && (
        <div className="pr-filter-menu" role="listbox" aria-label="Filter by status">
          {options.map((o) => {
            const Icon = o.icon;
            const isSelected = o.key === value;
            return (
              <button
                key={o.key}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={`pr-filter-option tone-${o.tone} ${isSelected ? 'selected' : ''}`}
                onClick={() => pick(o.key)}
              >
                <span className="pr-filter-option-icon">
                  <Icon size={15} />
                </span>
                <span className="pr-filter-option-label">{o.label}</span>
                <span className="pr-filter-option-count">{counts[o.key]}</span>
                <span className="pr-filter-check">{isSelected && <Check size={15} />}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PastSkeleton() {
  return (
    <div className="pr-card">
      <div className="pr-card-head">
        <span className="pr-skel pr-skel-search" />
      </div>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="pr-row pr-row-skeleton">
          <span className="pr-skel pr-skel-w-sm" />
          <span className="pr-skel pr-skel-w-md" />
          <span className="pr-skel pr-skel-w-lg hide-md" />
          <span className="pr-skel pr-skel-w-md hide-sm" />
          <span className="pr-skel pr-skel-w-sm" />
          <span className="pr-skel pr-skel-pill" />
          <span />
        </div>
      ))}
    </div>
  );
}

function DetailTile({ icon: Icon, label, value, wide = false }) {
  return (
    <div className={`pr-tile ${wide ? 'pr-tile-wide' : ''}`}>
      <span className="pr-tile-icon">
        <Icon size={16} />
      </span>
      <div className="pr-tile-text">
        <p className="pr-tile-label">{label}</p>
        <p className="pr-tile-value">{value}</p>
      </div>
    </div>
  );
}

function DetailsModal({ ticket, onClose, onReapply, hasActiveRequest }) {
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const price = getPrice(ticket);
  const hasFinalSheet = ['APPROVED', 'COMPLETED'].includes(ticket.status);
  const isNotCompatible = NOT_COMPATIBLE.includes(ticket.status);
  const reapplyable = canReapply(ticket);
  const earlierTries = ticket.attempts?.length || 0;

  // Close with the Esc key
  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  async function handleDownload() {
    setDownloading(true);
    setDownloadError('');
    try {
      await downloadFinalSheetPDF(ticket.id, ticket.ticket_number);
    } catch {
      setDownloadError('Could not download the Final Sheet. Please try again.');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="pr-modal-overlay" onClick={onClose}>
      <div className="pr-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="pr-modal-header">
          <div className="pr-modal-glow" aria-hidden="true" />
          <span className="pr-modal-header-icon">
            <FileText size={18} />
          </span>
          <div className="pr-modal-header-text">
            <div className="pr-modal-title-row">
              <h3>{ticket.ticket_number}</h3>
              <span className={`pr-status tone-${toneOf(ticket.status)}`}>{ticket.status_display}</span>
              {ticket.attempt_number > 1 && <span className="pr-try-chip">Try {ticket.attempt_number}</span>}
            </div>
            <p>
              Submitted {formatDate(ticket.created_at, 'long')}
              {earlierTries > 0 && ` · ${earlierTries} earlier ${earlierTries === 1 ? 'try' : 'tries'}`}
            </p>
          </div>
          <button type="button" className="pr-modal-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="pr-modal-body">
          {isNotCompatible && (
            <div className="pr-alert pr-alert-red">
              <span className="pr-alert-icon">
                <AlertCircle size={18} />
              </span>
              <div className="pr-alert-text">
                <p className="pr-alert-title">This property was not compatible</p>
                {ticket.admin_revision_notes && <p>Reason: {ticket.admin_revision_notes}</p>}
                {ticket.status === 'NC_CAN_REAPPLY' && <p>You can fix the issue and reapply using this same ticket.</p>}
              </div>
            </div>
          )}

          {ticket.status === 'WITHDRAWN' && (
            <div className="pr-alert pr-alert-gray">
              <span className="pr-alert-icon">
                <AlertCircle size={18} />
              </span>
              <div className="pr-alert-text">
                <p className="pr-alert-title">This request was withdrawn</p>
                <p>No site visit or final price was made for it. You can reapply using this same ticket.</p>
              </div>
            </div>
          )}

          {price && (
            <div className="pr-price-box">
              <span>{hasFinalSheet ? 'Final Price' : 'Estimated Price'}</span>
              <strong>{formatCurrency(price)}</strong>
            </div>
          )}

          <p className="pr-section-label">Request Details</p>
          <div className="pr-tile-grid">
            <DetailTile icon={Package} label="Package" value={ticket.solar_package || '—'} />
            <DetailTile icon={Zap} label="System Type" value={systemLabel(ticket.system_type)} />
            <DetailTile icon={HardHat} label="Partner Installer" value={ticket.partner_installer_username || 'Not assigned'} />
            <DetailTile
              icon={CalendarDays}
              label={ticket.status === 'COMPLETED' ? 'Completed On' : 'Visit Date'}
              value={formatDate(ticket.status === 'COMPLETED' ? ticket.completed_at : ticket.visit_date, 'long')}
            />
          </div>

          <p className="pr-section-label">Customer Information</p>
          <div className="pr-tile-grid">
            <DetailTile icon={User} label="Full Name" value={ticket.full_name || ticket.customer_username || '—'} />
            <DetailTile icon={Phone} label="Contact Number" value={ticket.contact_number || '—'} />
            <DetailTile icon={MapPin} label="Address" value={ticket.property_address || '—'} wide />
          </div>

          {reapplyable && hasActiveRequest && (
            <div className="pr-alert pr-alert-gold pr-alert-bottom">
              <span className="pr-alert-icon">
                <AlertCircle size={18} />
              </span>
              <div className="pr-alert-text">
                <p className="pr-alert-title">You can't reapply yet</p>
                <p>You can reapply once your current request is finished or withdrawn.</p>
              </div>
            </div>
          )}

          {downloadError && (
            <div className="pr-alert pr-alert-red pr-alert-bottom">
              <span className="pr-alert-icon">
                <AlertCircle size={18} />
              </span>
              <div className="pr-alert-text">
                <p className="pr-alert-title">Download failed</p>
                <p>{downloadError}</p>
              </div>
            </div>
          )}
        </div>

        <div className="pr-modal-footer">
          <button type="button" className="pr-btn-secondary" onClick={onClose}>
            Close
          </button>
          {reapplyable && !hasActiveRequest && (
            <button type="button" className="pr-btn-gold" onClick={() => onReapply(ticket)}>
              <RotateCcw size={16} />
              Reapply
            </button>
          )}
          {hasFinalSheet && (
            <button type="button" className="pr-btn-gold" onClick={handleDownload} disabled={downloading}>
              <Download size={16} />
              {downloading ? 'Preparing...' : 'Download Final Sheet'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PastRequestsPage() {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  async function load() {
    try {
      setLoading(true);
      const data = await getMyTickets();
      setTickets(data);
      setError('');
    } catch {
      setError('Could not load your requests. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const pastTickets = tickets
    .filter((t) => !ACTIVE_STATUSES.includes(t.status))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const counts = Object.fromEntries(
    FILTER_OPTIONS.map((o) => [o.key, pastTickets.filter((t) => o.match(t.status)).length])
  );

  const currentFilter = FILTER_OPTIONS.find((o) => o.key === statusFilter) || FILTER_OPTIONS[0];
  const search = searchText.trim().toLowerCase();

  const filteredTickets = pastTickets.filter((t) => {
    const matchesStatus = currentFilter.match(t.status);
    const matchesSearch =
      search === '' ||
      t.ticket_number?.toLowerCase().includes(search) ||
      t.property_address?.toLowerCase().includes(search);
    return matchesStatus && matchesSearch;
  });

  const hasActiveRequest = tickets.some((t) => ACTIVE_STATUSES.includes(t.status));

  function handleReapply(ticket) {
    navigate(`/new-request?reapply=${ticket.id}`);
  }

  function clearFilters() {
    setSearchText('');
    setStatusFilter('ALL');
  }

  let heroText = 'Your finished, withdrawn and not compatible requests.';
  if (!loading && !error) {
    heroText =
      pastTickets.length === 0
        ? 'Finished, withdrawn and not compatible requests will show up here.'
        : `${pastTickets.length} past request${pastTickets.length === 1 ? '' : 's'}. Click any one to see its details.`;
  }

  return (
    <CustomerLayout pageTitle="Past Requests" pageSubtitle="All your finished, withdrawn, and not compatible requests">
      <div className="pr-page">
        {/* ---------- Banner ---------- */}
        <section className="pr-hero">
          <div className="pr-hero-glow" aria-hidden="true" />
          <div className="pr-hero-icon">
            <History size={26} />
          </div>
          <div className="pr-hero-text">
            <h1>Request History</h1>
            <p>{heroText}</p>
          </div>
          <div className="pr-hero-actions">
            <Link to="/new-request" className="pr-hero-btn gold">
              <Plus size={17} />
              New Request
            </Link>
          </div>
        </section>

        {loading && <PastSkeleton />}

        {!loading && error && (
          <div className="pr-card">
            <div className="pr-empty">
              <span className="pr-empty-badge red">
                <AlertCircle size={26} />
              </span>
              <p className="pr-empty-title">Something went wrong</p>
              <p className="pr-empty-hint">{error}</p>
              <button type="button" className="pr-btn-primary" onClick={load}>
                Try again
              </button>
            </div>
          </div>
        )}

        {!loading && !error && pastTickets.length === 0 && (
          <div className="pr-card">
            <div className="pr-empty">
              <span className="pr-empty-badge">
                <History size={26} />
              </span>
              <p className="pr-empty-title">No past requests yet</p>
              <p className="pr-empty-hint">
                Requests show up here once they're completed, withdrawn, or marked not compatible.
              </p>
              <Link to="/request-status" className="pr-btn-primary">
                View Request Status
              </Link>
            </div>
          </div>
        )}

        {!loading && !error && pastTickets.length > 0 && (
          <section className="pr-card">
            <div className="pr-card-head">
              <div className="pr-tools">
                <div className="pr-search">
                  <Search size={17} className="pr-search-icon" />
                  <input
                    type="text"
                    placeholder="Search ref # or address"
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    aria-label="Search past requests"
                  />
                  {searchText && (
                    <button
                      type="button"
                      className="pr-search-clear"
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
              </div>
            </div>

            {filteredTickets.length === 0 ? (
              <div className="pr-empty">
                <span className="pr-empty-badge">
                  <SearchX size={26} />
                </span>
                <p className="pr-empty-title">No requests match</p>
                <p className="pr-empty-hint">Try a different search or status filter.</p>
                <button type="button" className="pr-btn-secondary" onClick={clearFilters}>
                  Show all requests
                </button>
              </div>
            ) : (
              <div className="pr-list" role="table" aria-label="Past requests">
                <div className="pr-row pr-row-head" role="row">
                  <span role="columnheader">Ref #</span>
                  <span role="columnheader">Submitted</span>
                  <span role="columnheader" className="hide-md">
                    Address
                  </span>
                  <span role="columnheader" className="hide-sm">
                    Package
                  </span>
                  <span role="columnheader">Price</span>
                  <span role="columnheader">Status</span>
                  <span aria-hidden="true" />
                </div>

                {filteredTickets.map((t) => {
                  const price = getPrice(t);
                  return (
                    <div
                      key={t.id}
                      className="pr-row pr-item"
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedTicket(t)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedTicket(t);
                        }
                      }}
                    >
                      <span className="pr-ref">{t.ticket_number}</span>
                      <span className="pr-date">{formatDate(t.created_at)}</span>
                      <span className="hide-md pr-address" title={t.property_address}>
                        {t.property_address || '—'}
                      </span>
                      <span className="hide-sm pr-package">
                        <span className="pr-package-name">{t.solar_package || '—'}</span>
                        <span className={`pr-system-tag ${t.system_type === 'HYBRID' ? 'hybrid' : 'ongrid'}`}>
                          {systemLabel(t.system_type)}
                        </span>
                      </span>
                      <span className={price ? 'pr-price' : 'pr-price muted'}>
                        {price ? formatCurrency(price) : '—'}
                      </span>
                      <span className="pr-status-cell">
                        <span className={`pr-status tone-${toneOf(t.status)}`}>{t.status_display}</span>
                        {canReapply(t) && !hasActiveRequest && (
                          <span className="pr-reapply-tag">
                            <RotateCcw size={11} />
                            Can reapply
                          </span>
                        )}
                      </span>
                      <span className="pr-view" aria-hidden="true">
                        <Eye size={15} />
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </div>

      {selectedTicket && (
        <DetailsModal
          ticket={selectedTicket}
          onClose={() => setSelectedTicket(null)}
          onReapply={handleReapply}
          hasActiveRequest={hasActiveRequest}
        />
      )}
    </CustomerLayout>
  );
}