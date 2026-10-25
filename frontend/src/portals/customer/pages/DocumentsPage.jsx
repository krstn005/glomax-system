import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FileText,
  Award,
  Download,
  Lock,
  AlertCircle,
  FolderOpen,
  Clock,
  Check,
  MapPin,
  Info,
  Sun,
  Search,
  SearchX,
  X,
  SlidersHorizontal,
  ChevronDown,
  Layers,
} from 'lucide-react';
import { getMyTickets, downloadFinalSheetPDF, downloadCompletionCertificatePDF } from '../../../api/tickets';
import CustomerLayout from '../components/CustomerLayout';
import '../styles/documents.css';

// Choices in the Filter drop-down
const FILTER_OPTIONS = [
  { key: 'ALL', label: 'All Documents', icon: Layers, tone: 'navy', match: () => true },
  { key: 'COMPLETED', label: 'Certificate Ready', icon: Award, tone: 'gold', match: (s) => s === 'COMPLETED' },
  { key: 'APPROVED', label: 'Waiting for Install', icon: Clock, tone: 'blue', match: (s) => s === 'APPROVED' },
];

function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
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
    <div className="doc-filter" ref={wrapRef}>
      <button
        type="button"
        className={`doc-filter-btn ${open ? 'open' : ''} ${isFiltered ? 'filtered' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Filter documents"
      >
        {isFiltered ? <CurrentIcon size={16} /> : <SlidersHorizontal size={16} />}
        <span className="doc-filter-text">{isFiltered ? current.label : 'Filter'}</span>
        <ChevronDown size={16} className="doc-filter-chevron" />
      </button>

      {isFiltered && (
        <button type="button" className="doc-filter-clear" onClick={() => onChange('ALL')} aria-label="Clear filter">
          <X size={14} />
        </button>
      )}

      {open && (
        <div className="doc-filter-menu" role="listbox" aria-label="Filter documents">
          {options.map((o) => {
            const Icon = o.icon;
            const isSelected = o.key === value;
            return (
              <button
                key={o.key}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={`doc-filter-option tone-${o.tone} ${isSelected ? 'selected' : ''}`}
                onClick={() => pick(o.key)}
              >
                <span className="doc-filter-option-icon">
                  <Icon size={15} />
                </span>
                <span className="doc-filter-option-label">{o.label}</span>
                <span className="doc-filter-option-count">{counts[o.key]}</span>
                <span className="doc-filter-check">{isSelected && <Check size={15} />}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// One downloadable file. Shows "Preparing..." while working, then
// "Downloaded" with a check for a few seconds so the customer knows it worked.
function FileTile({ icon: Icon, tone, title, subtitle, onDownload }) {
  const [state, setState] = useState('idle'); // idle | busy | done
  const [error, setError] = useState('');

  async function handleClick() {
    setState('busy');
    setError('');
    try {
      await onDownload();
      setState('done');
      setTimeout(() => setState('idle'), 2500);
    } catch {
      setState('idle');
      setError(`Could not download the ${title}. Please try again.`);
    }
  }

  return (
    <div className="doc-file-wrap">
      <div className={`doc-file tone-${tone}`}>
        <span className="doc-file-icon">
          <Icon size={20} />
        </span>
        <div className="doc-file-text">
          <p className="doc-file-title">
            {title}
            <span className="doc-pdf-chip">PDF</span>
          </p>
          <p className="doc-file-sub">{subtitle}</p>
        </div>
        <button
          type="button"
          className={`doc-download-btn ${state === 'done' ? 'done' : ''}`}
          onClick={handleClick}
          disabled={state === 'busy'}
        >
          {state === 'done' ? <Check size={15} /> : <Download size={15} />}
          {state === 'busy' ? 'Preparing...' : state === 'done' ? 'Downloaded' : 'Download'}
        </button>
      </div>

      {error && (
        <div className="doc-alert doc-alert-red doc-alert-small">
          <span className="doc-alert-icon">
            <AlertCircle size={15} />
          </span>
          <div className="doc-alert-text">
            <p className="doc-alert-title">Download failed</p>
            <p>{error}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// Shown in place of the certificate before the installation is done
function LockedTile({ title, subtitle }) {
  return (
    <div className="doc-file-wrap">
      <div className="doc-file doc-file-locked">
        <span className="doc-file-icon">
          <Lock size={18} />
        </span>
        <div className="doc-file-text">
          <p className="doc-file-title">{title}</p>
          <p className="doc-file-sub">{subtitle}</p>
        </div>
        <span className="doc-locked-tag">Not yet available</span>
      </div>
    </div>
  );
}

function DocumentCard({ ticket }) {
  const isCompleted = ticket.status === 'COMPLETED';

  return (
    <div className={`doc-card ${isCompleted ? 'completed' : ''}`}>
      <div className="doc-card-head">
        <span className="doc-card-icon">
          <Sun size={20} />
        </span>
        <div className="doc-card-title">
          <p className="doc-card-ticket">{ticket.ticket_number}</p>
          <div className="doc-card-meta">
            <span className="doc-card-package">{ticket.solar_package}</span>
            <span className={`doc-system-tag ${ticket.system_type === 'HYBRID' ? 'hybrid' : 'ongrid'}`}>
              {systemLabel(ticket.system_type)}
            </span>
          </div>
        </div>
        <span className={`doc-status ${isCompleted ? 'completed' : 'approved'}`}>{ticket.status_display}</span>
      </div>

      {ticket.property_address && (
        <p className="doc-card-address">
          <MapPin size={14} />
          {ticket.property_address}
        </p>
      )}

      <div className="doc-files">
        <FileTile
          icon={FileText}
          tone="navy"
          title="Final Sheet"
          subtitle={`Approved on ${formatDate(ticket.final_sheet?.approved_at || ticket.updated_at)}`}
          onDownload={() => downloadFinalSheetPDF(ticket.id, ticket.ticket_number)}
        />

        {isCompleted ? (
          <FileTile
            icon={Award}
            tone="gold"
            title="Completion Certificate"
            subtitle={`Completed on ${formatDate(ticket.completed_at)}`}
            onDownload={() => downloadCompletionCertificatePDF(ticket.id, ticket.ticket_number)}
          />
        ) : (
          <LockedTile title="Completion Certificate" subtitle="Available once your installation is complete" />
        )}
      </div>
    </div>
  );
}

function DocumentsSkeleton() {
  return (
    <>
      <div className="doc-toolbar">
        <span className="doc-skel doc-skel-search" />
      </div>
      <div className="doc-grid">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="doc-card">
            <span className="doc-skel doc-skel-title" />
            <span className="doc-skel doc-skel-line" />
            <span className="doc-skel doc-skel-tile" />
            <span className="doc-skel doc-skel-tile" />
          </div>
        ))}
      </div>
    </>
  );
}

export default function DocumentsPage() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  async function load() {
    try {
      setLoading(true);
      const data = await getMyTickets();
      setTickets(data);
      setError('');
    } catch {
      setError('Could not load your documents. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // Only tickets with a real Final Sheet (Approved or Completed) have
  // any documents to show here. Newest approval first.
  const documentTickets = tickets
    .filter((t) => t.status === 'APPROVED' || t.status === 'COMPLETED')
    .sort(
      (a, b) =>
        new Date(b.final_sheet?.approved_at || b.created_at) - new Date(a.final_sheet?.approved_at || a.created_at),
    );

  const counts = Object.fromEntries(
    FILTER_OPTIONS.map((o) => [o.key, documentTickets.filter((t) => o.match(t.status)).length]),
  );

  const currentFilter = FILTER_OPTIONS.find((o) => o.key === statusFilter) || FILTER_OPTIONS[0];
  const search = searchText.trim().toLowerCase();

  const filteredTickets = documentTickets.filter((t) => {
    const matchesStatus = currentFilter.match(t.status);
    const matchesSearch =
      search === '' ||
      t.ticket_number?.toLowerCase().includes(search) ||
      t.property_address?.toLowerCase().includes(search) ||
      t.solar_package?.toLowerCase().includes(search);
    return matchesStatus && matchesSearch;
  });

  function clearFilters() {
    setSearchText('');
    setStatusFilter('ALL');
  }

  return (
    <CustomerLayout pageTitle="My Documents" pageSubtitle="Download your Final Sheets and Completion Certificates">
      <div className="doc-page">
        <section className="doc-hero">
          <div className="doc-hero-glow" aria-hidden="true" />
          <div className="doc-hero-icon">
            <FolderOpen size={26} />
          </div>
          <div className="doc-hero-text">
            <h1>Your Documents</h1>
            <p>Final Sheets and Completion Certificates for your approved requests, ready to download as PDF.</p>
          </div>
        </section>

        {loading && <DocumentsSkeleton />}

        {!loading && error && (
          <div className="doc-panel">
            <div className="doc-empty-state">
              <span className="doc-empty-badge red">
                <AlertCircle size={28} />
              </span>
              <p className="doc-empty-title">Something went wrong</p>
              <p className="doc-empty-hint">{error}</p>
              <button type="button" className="doc-btn-primary" onClick={load}>
                Try again
              </button>
            </div>
          </div>
        )}

        {!loading && !error && documentTickets.length === 0 && (
          <div className="doc-panel">
            <div className="doc-empty-state">
              <span className="doc-empty-badge">
                <FolderOpen size={28} />
              </span>
              <p className="doc-empty-title">No documents yet</p>
              <p className="doc-empty-hint">
                Your Final Sheet will show up here once a request is approved. Your Completion Certificate comes after
                the installation is done.
              </p>
              <Link to="/request-status" className="doc-btn-primary">
                View Request Status
              </Link>
            </div>
          </div>
        )}

        {!loading && !error && documentTickets.length > 0 && (
          <>
            <section className="doc-toolbar">
              <div className="doc-search">
                <Search size={17} className="doc-search-icon" />
                <input
                  type="text"
                  placeholder="Search ref #, address or package"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  aria-label="Search documents"
                />
                {searchText && (
                  <button
                    type="button"
                    className="doc-search-clear"
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

            {filteredTickets.length === 0 ? (
              <div className="doc-panel">
                <div className="doc-empty-state">
                  <span className="doc-empty-badge">
                    <SearchX size={28} />
                  </span>
                  <p className="doc-empty-title">No documents match</p>
                  <p className="doc-empty-hint">Try a different search or filter.</p>
                  <button type="button" className="doc-btn-secondary" onClick={clearFilters}>
                    Show all documents
                  </button>
                </div>
              </div>
            ) : (
              <div className="doc-grid">
                {filteredTickets.map((t) => (
                  <DocumentCard key={t.id} ticket={t} />
                ))}
              </div>
            )}

            <div className="doc-alert doc-alert-gold">
              <span className="doc-alert-icon">
                <Info size={18} />
              </span>
              <div className="doc-alert-text">
                <p className="doc-alert-title">Keep a copy</p>
                <p>
                  All documents download as PDF files. Keep a copy for your records, since you may need them for
                  warranty or future service.
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </CustomerLayout>
  );
}