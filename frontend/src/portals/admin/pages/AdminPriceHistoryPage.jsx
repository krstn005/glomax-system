import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Tag,
  Lock,
  Layers,
  Zap,
  BatteryCharging,
  ArrowRight,
  PencilLine,
  AlertCircle,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  Minus,
  Sparkles,
  RefreshCw,
  Package,
  Wallet,
  CalendarClock,
  Inbox,
} from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import FilterMenu from '../../../components/FilterMenu';
import { getAdminPriceHistory, addPriceEntry } from '../../../api/adminPricing';
import { getPaymentTerms } from '../../../api/staffQuotations';
import { formatCurrency } from '../../../utils/currency';
import '../styles/admin-pricing.css';

const PAYMENT_TERMS_PATH = '/admin/payment-terms-history';
const PAGE_SIZE = 20;
const BASE_KWS = [3, 6, 8, 10];

const GROUPS = [
  {
    type: 'ON_GRID',
    title: 'On-Grid PV System',
    cls: 'ongrid',
    tag: 'Ongrid',
    icon: Zap,
    note: 'Connected to the power grid',
  },
  {
    type: 'HYBRID',
    title: 'Hybrid PV System',
    cls: 'hybrid',
    tag: 'Hybrid',
    icon: BatteryCharging,
    note: 'Grid power with battery backup',
  },
];

// Filter options for the Price History list
const FILTERS = [
  { key: 'ALL', label: 'All Entries', icon: Layers, tone: 'navy' },
  { key: 'ON_GRID', label: 'On-Grid', icon: Zap, tone: 'blue' },
  { key: 'HYBRID', label: 'Hybrid', icon: BatteryCharging, tone: 'gold' },
];

const SEGMENT_COLORS = ['#facc15', '#60a5fa', '#34d399', '#f472b6', '#a78bfa'];

const EMPTY_FORM = { package_name: '', system_type: 'ON_GRID', rated_capacity_kw: '', price: '' };

const FIELD_LABELS = {
  package_name: 'Package name',
  system_type: 'System type',
  rated_capacity_kw: 'Rated capacity',
  price: 'Price',
};

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Shorter price for the tiles: drops ".00" when the price is a whole number
function formatPrice(value) {
  const text = formatCurrency(value);
  return typeof text === 'string' ? text.replace(/\.00$/, '') : text;
}

function suggestName(kw, systemType) {
  if (!kw) return '';
  return `${Number(kw)}KW ${systemType === 'HYBRID' ? 'Hybrid' : 'Ongrid'}`;
}

function keyOf(type, kw) {
  return `${type}-${Number(kw)}`;
}

function parseSegment(segment) {
  const match = segment.match(/^(\d+(?:\.\d+)?)\s*%\s*(.*)$/);
  if (match) return { percent: Number(match[1]), label: match[2] };
  return { percent: null, label: segment };
}

function getErrorMessage(err, fallback) {
  const data = err?.response?.data;
  if (!data || typeof data === 'string') return fallback;
  if (data.detail) return String(data.detail);
  const [field, value] = Object.entries(data)[0] || [];
  if (!field) return fallback;
  const msg = Array.isArray(value) ? value[0] : value;
  if (typeof msg !== 'string') return fallback;
  return FIELD_LABELS[field] ? `${FIELD_LABELS[field]}: ${msg}` : msg;
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

function Skeleton() {
  return (
    <>
      <span className="admpr-skel admpr-skel-hero" />
      <div className="admpr-panels">
        {[1, 2].map((n) => (
          <div key={n} className="admpr-panel">
            <span className="admpr-skel admpr-skel-w-md" />
            <div className="admpr-tiles">
              {[1, 2, 3, 4].map((i) => (
                <span key={i} className="admpr-skel admpr-skel-tile" />
              ))}
            </div>
          </div>
        ))}
      </div>
      <span className="admpr-skel admpr-skel-terms" />
    </>
  );
}

function AddPriceModal({ initial, activePrices, onClose, onSaved }) {
  const [form, setForm] = useState(initial);
  const [nameTouched, setNameTouched] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape' && !saving) onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  function update(field, value) {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (!nameTouched && (field === 'rated_capacity_kw' || field === 'system_type')) {
        next.package_name = suggestName(next.rated_capacity_kw, next.system_type);
      }
      return next;
    });
  }

  const current = activePrices.find(
    (p) => Number(p.rated_capacity_kw) === Number(form.rated_capacity_kw) && p.system_type === form.system_type,
  );
  const newPrice = Number(form.price);
  const hasNewPrice = form.price !== '' && newPrice > 0;
  const diff = current && hasNewPrice ? newPrice - Number(current.price) : null;
  const diffPct = diff !== null && Number(current.price) > 0 ? (diff / Number(current.price)) * 100 : null;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!(Number(form.rated_capacity_kw) > 0)) {
      setError('Rated capacity: Please enter a number bigger than 0.');
      return;
    }
    if (!(newPrice > 0)) {
      setError('Price: Please enter a price bigger than 0.');
      return;
    }

    setSaving(true);
    try {
      const payload = { ...form, package_name: form.package_name.trim() };
      await addPriceEntry(payload);
      onSaved(payload);
    } catch (err) {
      setError(getErrorMessage(err, 'Could not add the price entry. Please try again.'));
      setSaving(false);
    }
  }

  return (
    <div className="admpr-overlay" onMouseDown={() => !saving && onClose()}>
      <div className="admpr-modal" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
        <div className="admpr-modal-head">
          <span className="admpr-modal-icon">
            <Tag size={20} />
          </span>
          <div className="admpr-modal-titles">
            <h3>Add New Price</h3>
            <p>This becomes the active price for the package right away.</p>
          </div>
          <button type="button" className="admpr-modal-close" onClick={onClose} disabled={saving} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="admpr-form">
          <div className="admpr-type-switch" role="radiogroup" aria-label="System type">
            {[
              { value: 'ON_GRID', label: 'On-Grid' },
              { value: 'HYBRID', label: 'Hybrid' },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={form.system_type === opt.value}
                className={`admpr-type-option ${opt.value === 'HYBRID' ? 'hybrid' : 'ongrid'} ${
                  form.system_type === opt.value ? 'active' : ''
                }`}
                onClick={() => update('system_type', opt.value)}
              >
                <span className="admpr-dot" />
                {opt.label}
              </button>
            ))}
          </div>

          <div className="admpr-form-grid">
            <label className="admpr-field">
              <span>Rated Capacity</span>
              <div className="admpr-input-wrap">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.rated_capacity_kw}
                  onChange={(e) => update('rated_capacity_kw', e.target.value)}
                  placeholder="e.g. 6"
                  autoFocus={!form.rated_capacity_kw}
                  className="has-suffix"
                  required
                />
                <span className="admpr-suffix">KW</span>
              </div>
            </label>

            <label className="admpr-field">
              <span>Package Name</span>
              <input
                value={form.package_name}
                onChange={(e) => {
                  setNameTouched(true);
                  setForm((prev) => ({ ...prev, package_name: e.target.value }));
                }}
                placeholder="e.g. 6KW Hybrid"
                required
              />
            </label>

            <label className="admpr-field admpr-field-full">
              <span>New Price</span>
              <div className="admpr-input-wrap">
                <span className="admpr-prefix">₱</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.price}
                  onChange={(e) => update('price', e.target.value)}
                  placeholder="e.g. 250000"
                  autoFocus={Boolean(form.rated_capacity_kw)}
                  className="has-prefix"
                  required
                />
              </div>
            </label>
          </div>

          {form.rated_capacity_kw && (
            <div className="admpr-compare">
              <div>
                <span className="admpr-compare-label">Current price</span>
                <span className="admpr-compare-value">{current ? formatCurrency(current.price) : 'None yet'}</span>
              </div>
              <div>
                <span className="admpr-compare-label">New price</span>
                <span className="admpr-compare-value strong">{hasNewPrice ? formatCurrency(newPrice) : '—'}</span>
              </div>
              {diff !== null && (
                <span className={`admpr-change ${diff > 0 ? 'up' : diff < 0 ? 'down' : 'same'} push`}>
                  {diff > 0 ? <TrendingUp size={13} /> : diff < 0 ? <TrendingDown size={13} /> : <Minus size={13} />}
                  {diff === 0
                    ? 'Same price'
                    : `${diff > 0 ? '+' : '−'}${formatCurrency(Math.abs(diff))}${
                        diffPct !== null ? ` (${Math.abs(diffPct).toFixed(1)}%)` : ''
                      }`}
                </span>
              )}
            </div>
          )}

          {error && (
            <p className="admpr-error">
              <AlertCircle size={15} />
              {error}
            </p>
          )}

          <div className="admpr-modal-actions">
            <button type="button" className="admpr-btn-secondary" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="admpr-btn-primary" disabled={saving}>
              {saving ? 'Adding...' : 'Add Price'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PaymentTermsCard({ terms, error, onRetry }) {
  if (error) {
    return (
      <div className="admpr-table-card">
        <div className="admpr-empty small">
          <span className="admpr-empty-icon red">
            <AlertCircle size={22} />
          </span>
          <p className="admpr-empty-title">{error}</p>
          <button type="button" className="admpr-btn-secondary" onClick={onRetry}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  const segments = terms?.description
    ? terms.description
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map(parseSegment)
    : [];

  if (segments.length === 0) {
    return (
      <div className="admpr-table-card">
        <div className="admpr-empty small">
          <span className="admpr-empty-icon">
            <Inbox size={22} />
          </span>
          <p className="admpr-empty-title">No payment terms on record</p>
          <p className="admpr-empty-hint">
            Add them in{' '}
            <Link to={PAYMENT_TERMS_PATH} className="admpr-inline-link">
              Payment Terms History
            </Link>
            .
          </p>
        </div>
      </div>
    );
  }

  const percentTotal = segments.reduce((sum, s) => sum + (s.percent || 0), 0);
  const allPercent = segments.every((s) => s.percent !== null);

  return (
    <div className="admpr-terms">
      <div className="admpr-terms-top">
        <p className="admpr-terms-title">How customers pay</p>
        <span className="admpr-terms-since">Since {formatDate(terms.date_added)}</span>
      </div>

      {allPercent && (
        <div className="admpr-terms-bar">
          {segments.map((s, i) => (
            <span
              key={i}
              style={{
                width: `${(s.percent / Math.max(100, percentTotal)) * 100}%`,
                background: SEGMENT_COLORS[i % SEGMENT_COLORS.length],
              }}
            />
          ))}
        </div>
      )}

      <div className="admpr-terms-list">
        {segments.map((s, i) => (
          <div key={i} className="admpr-terms-item">
            <span className="admpr-terms-swatch" style={{ background: SEGMENT_COLORS[i % SEGMENT_COLORS.length] }} />
            <span className="admpr-terms-percent">{s.percent !== null ? `${s.percent}%` : '•'}</span>
            <span className="admpr-terms-label">{s.label || 'of the total price'}</span>
          </div>
        ))}
      </div>

      {allPercent && percentTotal !== 100 && (
        <p className="admpr-terms-warn">
          <AlertTriangle size={14} />
          These terms add up to {percentTotal}%, not 100%. You may want to update them in Payment Terms History.
        </p>
      )}
    </div>
  );
}

export default function AdminPriceHistoryPage() {
  const [prices, setPrices] = useState([]);
  const [terms, setTerms] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [termsError, setTermsError] = useState('');
  const [tab, setTab] = useState('ALL');
  const [page, setPage] = useState(1);
  const [modalInitial, setModalInitial] = useState(null);
  const [toast, setToast] = useState('');

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError('');
    setTermsError('');

    const [priceResult, termsResult] = await Promise.allSettled([getAdminPriceHistory(), getPaymentTerms()]);

    if (priceResult.status === 'fulfilled') {
      setPrices(Array.isArray(priceResult.value) ? priceResult.value : []);
    } else {
      setError('Could not load the prices. Please try again.');
    }

    if (termsResult.status === 'fulfilled') {
      const list = [...(termsResult.value || [])].sort((a, b) => new Date(b.date_added) - new Date(a.date_added));
      setTerms(list.find((t) => t.is_active !== false) || list[0] || null);
    } else {
      setTermsError('Could not load the payment terms.');
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(''), 4500);
    return () => clearTimeout(timer);
  }, [toast]);

  const activePrices = useMemo(() => prices.filter((p) => p.is_active), [prices]);

  const activeByKey = useMemo(() => {
    const map = {};
    activePrices.forEach((p) => {
      map[keyOf(p.system_type, p.rated_capacity_kw)] = p;
    });
    return map;
  }, [activePrices]);

  // Package sizes to show per system type (base sizes + any extra active ones)
  function kwsFor(type) {
    const extra = activePrices.filter((p) => p.system_type === type).map((p) => Number(p.rated_capacity_kw));
    return [...new Set([...BASE_KWS, ...extra])].sort((a, b) => a - b);
  }

  const totalPackages = GROUPS.reduce((sum, g) => sum + kwsFor(g.type).length, 0);
  const pricedPackages = GROUPS.reduce(
    (sum, g) => sum + kwsFor(g.type).filter((kw) => activeByKey[keyOf(g.type, kw)]).length,
    0,
  );
  const missingCount = totalPackages - pricedPackages;

  const activeValues = activePrices.map((p) => Number(p.price)).filter((n) => n > 0);
  const lastUpdated = prices.reduce((latest, p) => {
    const d = new Date(p.date_added);
    return Number.isNaN(d.getTime()) ? latest : !latest || d > latest ? d : latest;
  }, null);

  // How much each entry changed compared with the package's previous entry
  const changes = useMemo(() => {
    const oldestFirst = [...prices].sort((a, b) => {
      const diff = new Date(a.date_added) - new Date(b.date_added);
      return diff !== 0 ? diff : a.id - b.id;
    });
    const last = {};
    const result = {};
    oldestFirst.forEach((p) => {
      const k = keyOf(p.system_type, p.rated_capacity_kw);
      const prev = last[k];
      result[p.id] = prev ? Number(p.price) - Number(prev.price) : null;
      last[k] = p;
    });
    return result;
  }, [prices]);

  const sortedPrices = useMemo(
    () =>
      [...prices].sort((a, b) => {
        const diff = new Date(b.date_added) - new Date(a.date_added);
        return diff !== 0 ? diff : b.id - a.id;
      }),
    [prices],
  );

  const counts = {
    ALL: prices.length,
    ON_GRID: prices.filter((p) => p.system_type === 'ON_GRID').length,
    HYBRID: prices.filter((p) => p.system_type === 'HYBRID').length,
  };

  const filteredPrices = tab === 'ALL' ? sortedPrices : sortedPrices.filter((p) => p.system_type === tab);
  const totalPages = Math.max(1, Math.ceil(filteredPrices.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * PAGE_SIZE;
  const pageItems = filteredPrices.slice(startIndex, startIndex + PAGE_SIZE);
  const activeFilterLabel = FILTERS.find((f) => f.key === tab)?.label;

  function changeTab(key) {
    setTab(key);
    setPage(1);
  }

  function openAdd(type, kw) {
    if (type && kw) {
      setModalInitial({
        ...EMPTY_FORM,
        system_type: type,
        rated_capacity_kw: String(kw),
        package_name: suggestName(kw, type),
      });
    } else {
      setModalInitial({ ...EMPTY_FORM });
    }
  }

  const closeModal = useCallback(() => setModalInitial(null), []);

  function handleSaved(payload) {
    setModalInitial(null);
    setToast(`New price for ${payload.package_name} is now active.`);
    setTab('ALL');
    setPage(1);
    load({ silent: true });
  }

  return (
    <AdminLayout
      pageTitle="Prices"
      pageSubtitle="Current prices, payment terms, and the full history of every price change"
    >
      <div className="admpr-page">
        {loading ? (
          <Skeleton />
        ) : error ? (
          <div className="admpr-table-card">
            <div className="admpr-empty">
              <span className="admpr-empty-icon red">
                <AlertCircle size={26} />
              </span>
              <p className="admpr-empty-title">Something went wrong</p>
              <p className="admpr-empty-hint">{error}</p>
              <button type="button" className="admpr-btn-primary" onClick={() => load()}>
                <RefreshCw size={15} />
                Try again
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Banner: what this page is + quick facts */}
            <section className="admpr-hero">
              <div className="admpr-hero-glow" aria-hidden="true" />
              <div className="admpr-hero-main">
                <span className="admpr-hero-icon">
                  <Tag size={24} />
                </span>
                <div className="admpr-hero-text">
                  <h1>Package Prices</h1>
                  <p>
                    <Lock size={13} />
                    Prices can't be edited or deleted. Add a new price to replace one, and the newest entry becomes the
                    active price.
                  </p>
                </div>
                <button type="button" className="admpr-add-btn" onClick={() => openAdd()}>
                  <Plus size={17} />
                  Add New Price
                </button>
              </div>

              <div className="admpr-hero-facts">
                <div className="admpr-fact">
                  <span className="admpr-fact-icon">
                    <Package size={16} />
                  </span>
                  <div>
                    <span className="admpr-fact-value">
                      {pricedPackages} of {totalPackages}
                    </span>
                    <span className="admpr-fact-label">Packages priced</span>
                  </div>
                </div>
                <div className="admpr-fact">
                  <span className="admpr-fact-icon">
                    <Wallet size={16} />
                  </span>
                  <div>
                    <span className="admpr-fact-value">
                      {activeValues.length === 0
                        ? '—'
                        : activeValues.length === 1
                          ? formatPrice(activeValues[0])
                          : `${formatPrice(Math.min(...activeValues))} – ${formatPrice(Math.max(...activeValues))}`}
                    </span>
                    <span className="admpr-fact-label">Price range</span>
                  </div>
                </div>
                <div className="admpr-fact">
                  <span className="admpr-fact-icon">
                    <CalendarClock size={16} />
                  </span>
                  <div>
                    <span className="admpr-fact-value">{lastUpdated ? formatDate(lastUpdated) : '—'}</span>
                    <span className="admpr-fact-label">Last price update</span>
                  </div>
                </div>
              </div>
            </section>

            {toast && (
              <div className="admpr-toast">
                <CheckCircle2 size={18} />
                <span>{toast}</span>
                <button type="button" onClick={() => setToast('')} aria-label="Dismiss">
                  <X size={15} />
                </button>
              </div>
            )}

            {missingCount > 0 && (
              <div className="admpr-warning">
                <AlertTriangle size={17} />
                <span>
                  <strong>
                    {missingCount} package{missingCount === 1 ? '' : 's'} {missingCount === 1 ? 'has' : 'have'} no
                    active price.
                  </strong>{' '}
                  They won't have a price to quote until you set one. Click a "Not set" package below.
                </span>
              </div>
            )}

            {/* Current prices */}
            <div className="admpr-section-head">
              <div>
                <h2 className="admpr-section-title">Current Active Prices</h2>
                <p className="admpr-section-sub">Click a package to give it a new price.</p>
              </div>
            </div>
            <div className="admpr-panels">
              {GROUPS.map((g) => {
                const kws = kwsFor(g.type);
                const setCount = kws.filter((kw) => activeByKey[keyOf(g.type, kw)]).length;
                const GroupIcon = g.icon;
                return (
                  <section key={g.type} className={`admpr-panel ${g.cls}`}>
                    <div className="admpr-panel-head">
                      <span className={`admpr-panel-icon ${g.cls}`}>
                        <GroupIcon size={18} />
                      </span>
                      <div className="admpr-panel-titles">
                        <h3>{g.title}</h3>
                        <p>{g.note}</p>
                      </div>
                      <span className={`admpr-panel-count ${setCount === kws.length ? 'full' : ''}`}>
                        {setCount === kws.length ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
                        {setCount} of {kws.length} set
                      </span>
                    </div>

                    <div className="admpr-tiles">
                      {kws.map((kw) => {
                        const match = activeByKey[keyOf(g.type, kw)];
                        return (
                          <button
                            key={kw}
                            type="button"
                            className={`admpr-tile ${g.cls} ${match ? '' : 'missing'}`}
                            onClick={() => openAdd(g.type, kw)}
                            title={`${match ? 'Update' : 'Set'} the price for ${kw}KW ${g.tag}`}
                          >
                            <span className="admpr-tile-top">
                              <span className={`admpr-tile-kw ${g.cls}`}>{kw} KW</span>
                              <span className="admpr-tile-edit" aria-hidden="true">
                                {match ? <PencilLine size={14} /> : <Plus size={14} />}
                              </span>
                            </span>
                            {match ? (
                              <span className="admpr-tile-price">{formatPrice(match.price)}</span>
                            ) : (
                              <span className="admpr-tile-missing">Not set</span>
                            )}
                            <span className="admpr-tile-since">
                              {match ? `Since ${formatDate(match.date_added)}` : 'Click to set a price'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>

            {/* Payment terms */}
            <section className="admpr-group">
              <div className="admpr-section-head">
                <div>
                  <h2 className="admpr-section-title">Active Payment Terms</h2>
                  <p className="admpr-section-sub">How customers split the payment for their system.</p>
                </div>
                <Link to={PAYMENT_TERMS_PATH} className="admpr-manage-link">
                  Manage
                  <ArrowRight size={15} />
                </Link>
              </div>
              <PaymentTermsCard terms={terms} error={termsError} onRetry={() => load({ silent: true })} />
            </section>

            {/* Full history */}
            <section className="admpr-table-card">
              <div className="admpr-table-head">
                <div>
                  <h2 className="admpr-section-title">Price History</h2>
                  <p className="admpr-section-sub">Every price ever added, newest first.</p>
                </div>
                {prices.length > 0 && (
                  <FilterMenu
                    options={FILTERS}
                    activeKey={tab}
                    counts={counts}
                    onPick={changeTab}
                    ariaLabel="Filter price history"
                  />
                )}
              </div>

              <div className="admpr-table-body">
                {prices.length === 0 ? (
                  <div className="admpr-empty">
                    <span className="admpr-empty-icon">
                      <Tag size={26} />
                    </span>
                    <p className="admpr-empty-title">No price entries yet</p>
                    <p className="admpr-empty-hint">Add your first price so quotations have something to use.</p>
                    <button type="button" className="admpr-btn-primary" onClick={() => openAdd()}>
                      <Plus size={15} />
                      Add New Price
                    </button>
                  </div>
                ) : filteredPrices.length === 0 ? (
                  <div className="admpr-empty">
                    <span className="admpr-empty-icon">
                      <Tag size={26} />
                    </span>
                    <p className="admpr-empty-title">No {activeFilterLabel} price entries</p>
                    <p className="admpr-empty-hint">Try another filter.</p>
                    <button type="button" className="admpr-btn-secondary" onClick={() => changeTab('ALL')}>
                      Show all entries
                    </button>
                  </div>
                ) : (
                  <>
                    <table className="admpr-table">
                      <thead>
                        <tr>
                          <th>Package</th>
                          <th>Price</th>
                          <th className="admpr-col-hide-sm">Change</th>
                          <th className="admpr-col-hide-sm">Date Added</th>
                          <th className="admpr-th-right">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pageItems.map((p) => {
                          const cls = p.system_type === 'HYBRID' ? 'hybrid' : 'ongrid';
                          const diff = changes[p.id];
                          return (
                            <tr key={p.id} className={p.is_active ? 'is-active' : ''}>
                              <td>
                                <div className="admpr-pkg">
                                  <span className={`admpr-pkg-badge ${cls}`}>{Number(p.rated_capacity_kw)}</span>
                                  <span className="admpr-pkg-text">
                                    <span className="admpr-pkg-name">{p.package_name}</span>
                                    <span className="admpr-pkg-sub">
                                      {Number(p.rated_capacity_kw)}KW · {p.system_type_display}
                                    </span>
                                  </span>
                                </div>
                              </td>
                              <td className="admpr-td-price">{formatCurrency(p.price)}</td>
                              <td className="admpr-col-hide-sm">
                                {diff === null ? (
                                  <span className="admpr-change first">
                                    <Sparkles size={12} />
                                    First price
                                  </span>
                                ) : (
                                  <span className={`admpr-change ${diff > 0 ? 'up' : diff < 0 ? 'down' : 'same'}`}>
                                    {diff > 0 ? (
                                      <TrendingUp size={12} />
                                    ) : diff < 0 ? (
                                      <TrendingDown size={12} />
                                    ) : (
                                      <Minus size={12} />
                                    )}
                                    {diff === 0
                                      ? 'No change'
                                      : `${diff > 0 ? '+' : '−'}${formatCurrency(Math.abs(diff))}`}
                                  </span>
                                )}
                              </td>
                              <td className="admpr-col-hide-sm admpr-td-date">{formatDate(p.date_added)}</td>
                              <td className="admpr-td-right">
                                <span className={`admpr-status ${p.is_active ? 'active' : 'replaced'}`}>
                                  <span className="admpr-status-dot" />
                                  {p.is_active ? 'Active' : 'Replaced'}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    {/* Page buttons only show when there is more than one page */}
                    {totalPages > 1 && (
                      <div className="admpr-pagination">
                        <div className="admpr-pagination-controls">
                          <button
                            type="button"
                            className="admpr-page-btn"
                            onClick={() => setPage(safePage - 1)}
                            disabled={safePage === 1}
                            aria-label="Previous page"
                          >
                            <ChevronLeft size={16} />
                          </button>
                          {getPageNumbers(safePage, totalPages).map((n, i) =>
                            n === '...' ? (
                              <span key={`gap-${i}`} className="admpr-page-gap">
                                …
                              </span>
                            ) : (
                              <button
                                key={n}
                                type="button"
                                className={`admpr-page-num ${n === safePage ? 'active' : ''}`}
                                onClick={() => setPage(n)}
                              >
                                {n}
                              </button>
                            ),
                          )}
                          <button
                            type="button"
                            className="admpr-page-btn"
                            onClick={() => setPage(safePage + 1)}
                            disabled={safePage === totalPages}
                            aria-label="Next page"
                          >
                            <ChevronRight size={16} />
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </section>
          </>
        )}
      </div>

      {modalInitial && (
        <AddPriceModal initial={modalInitial} activePrices={activePrices} onClose={closeModal} onSaved={handleSaved} />
      )}
    </AdminLayout>
  );
}