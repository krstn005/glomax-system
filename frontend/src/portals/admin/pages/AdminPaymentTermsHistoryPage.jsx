import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Plus,
  X,
  Trash2,
  Receipt,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Inbox,
  CalendarCheck,
  History,
  Clock,
  Lock,
} from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import { getAdminPaymentTerms, addPaymentTerm } from '../../../api/adminPricing';
import '../styles/admin-payment-terms.css';

const PAGE_SIZE = 20;

const TEMPLATES = [
  {
    label: '30 / 70',
    rows: [
      { percent: '30', label: 'Down Payment' },
      { percent: '70', label: 'Upon Installation' },
    ],
  },
  {
    label: '50 / 50',
    rows: [
      { percent: '50', label: 'Down Payment' },
      { percent: '50', label: 'Upon Installation' },
    ],
  },
  {
    label: 'Full payment',
    rows: [{ percent: '100', label: 'Full Payment Upon Installation' }],
  },
];

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// "30% Down Payment, 70% Upon Installation" ->
// [{ percent: '30%', value: 30, text: 'Down Payment' }, ...]
function splitTerms(description) {
  return (description || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((part) => {
      const match = part.match(/^(\d+(?:\.\d+)?)\s*%\s*(.*)$/);
      if (match) return { percent: `${Number(match[1])}%`, value: Number(match[1]), text: match[2] };
      return { percent: null, value: 0, text: part };
    });
}

function totalOf(parts) {
  return parts.reduce((sum, p) => sum + (p.value || 0), 0);
}

function isHundred(total) {
  return Math.abs(total - 100) < 0.001;
}

// How long a version was (or has been) in use
function usedFor(from, to) {
  if (!from) return '';
  const end = to ? new Date(to) : new Date();
  const days = Math.max(0, Math.floor((end - new Date(from)) / 86400000));
  if (days === 0) return to ? 'Used for less than a day' : 'Added today';
  const label = days === 1 ? '1 day' : `${days} days`;
  return to ? `Used for ${label}` : `In use for ${label}`;
}

function getErrorMessage(err, fallback) {
  const data = err?.response?.data;
  if (!data || typeof data === 'string') return fallback;
  if (data.detail) return String(data.detail);
  const first = Object.values(data)[0];
  const msg = Array.isArray(first) ? first[0] : first;
  return typeof msg === 'string' ? msg : fallback;
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

// Coloured bar that shows how the total is split (no numbers on it -
// the percentages are already shown next to it).
// Only drawn when the parts add up to 100%.
function SplitBar({ parts, small }) {
  const withValue = parts.filter((part) => part.value > 0);
  if (withValue.length === 0 || !isHundred(totalOf(withValue))) return null;
  return (
    <div className={`admpt-split ${small ? 'small' : ''}`} aria-hidden="true">
      {withValue.map((part, i) => (
        <span key={i} className={`admpt-split-part part-${i % 3}`} style={{ flexGrow: part.value }} />
      ))}
    </div>
  );
}

// One chip per payment: "30%  Down Payment"
function TermChips({ parts }) {
  return (
    <div className="admpt-chips">
      {parts.map((part, i) => (
        <span key={i} className="admpt-chip">
          {part.percent && <span className={`admpt-chip-percent part-${i % 3}`}>{part.percent}</span>}
          <span className="admpt-chip-text">{part.text || 'Of the total price'}</span>
        </span>
      ))}
    </div>
  );
}

function ItemSkeleton() {
  return (
    <li className="admpt-item admpt-item-skeleton">
      <span className="admpt-skel admpt-skel-badge" />
      <div className="admpt-item-card">
        <span className="admpt-skel admpt-skel-w-md" />
        <span className="admpt-skel admpt-skel-w-lg" />
      </div>
    </li>
  );
}

function AddTermsModal({ onClose, onSaved }) {
  const [rows, setRows] = useState([
    { percent: '', label: '' },
    { percent: '', label: '' },
  ]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape' && !saving) onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  function updateRow(index, field, value) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, { percent: '', label: '' }]);
  }

  function removeRow(index) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  function useTemplate(t) {
    setRows(t.rows.map((r) => ({ ...r })));
    setError('');
  }

  const total = rows.reduce((sum, r) => sum + (Number(r.percent) || 0), 0);
  const filled = rows.filter((r) => r.percent !== '' || r.label.trim());
  const preview = filled.map((r) => `${r.percent || '?'}% ${r.label.trim()}`.trim()).join(', ');
  const totalOk = isHundred(total);
  const previewParts = splitTerms(preview);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (filled.length === 0) {
      setError('Please add at least one payment term.');
      return;
    }
    for (const r of filled) {
      if (!(Number(r.percent) > 0)) {
        setError('Each term needs a percentage bigger than 0.');
        return;
      }
      if (!r.label.trim()) {
        setError('Each term needs a short description, like "Down Payment".');
        return;
      }
    }
    if (!totalOk) {
      setError(`The percentages add up to ${total}%. They need to add up to exactly 100%.`);
      return;
    }

    const description = filled.map((r) => `${Number(r.percent)}% ${r.label.trim()}`).join(', ');

    setSaving(true);
    try {
      await addPaymentTerm({ description });
      onSaved(description);
    } catch (err) {
      setError(getErrorMessage(err, 'Could not save the payment terms. Please try again.'));
      setSaving(false);
    }
  }

  return (
    <div className="admpt-overlay" onMouseDown={() => !saving && onClose()}>
      <div className="admpt-modal" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
        <div className="admpt-modal-head">
          <span className="admpt-modal-icon">
            <Receipt size={20} />
          </span>
          <div className="admpt-modal-titles">
            <h3>Add Payment Terms</h3>
            <p>This replaces the current terms right away.</p>
          </div>
          <button type="button" className="admpt-modal-close" onClick={onClose} disabled={saving} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="admpt-form">
          <div className="admpt-templates">
            <span className="admpt-templates-label">Quick fill:</span>
            {TEMPLATES.map((t) => (
              <button key={t.label} type="button" className="admpt-template-btn" onClick={() => useTemplate(t)}>
                {t.label}
              </button>
            ))}
          </div>

          <div className="admpt-rows">
            <div className="admpt-form-row admpt-form-row-head">
              <span>Percent</span>
              <span>What it's for</span>
              <span />
            </div>
            {rows.map((r, i) => (
              <div key={i} className="admpt-form-row">
                <div className="admpt-input-wrap">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={r.percent}
                    onChange={(e) => updateRow(i, 'percent', e.target.value)}
                    placeholder="30"
                    aria-label={`Percent for term ${i + 1}`}
                  />
                  <span className="admpt-suffix">%</span>
                </div>
                <input
                  type="text"
                  value={r.label}
                  onChange={(e) => updateRow(i, 'label', e.target.value.replace(/,/g, ''))}
                  placeholder={i === 0 ? 'e.g. Down Payment' : 'e.g. Upon Installation'}
                  aria-label={`Description for term ${i + 1}`}
                />
                <button
                  type="button"
                  className="admpt-row-remove"
                  onClick={() => removeRow(i)}
                  disabled={rows.length === 1}
                  aria-label={`Remove term ${i + 1}`}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
            <button type="button" className="admpt-add-row" onClick={addRow}>
              <Plus size={14} />
              Add another term
            </button>
          </div>

          <div className={`admpt-total ${totalOk ? 'ok' : total > 100 ? 'over' : 'under'}`}>
            <span>Total</span>
            <strong>{Number(total.toFixed(2))}%</strong>
            <span className="admpt-total-note">
              {totalOk ? (
                <>
                  <CheckCircle2 size={14} /> Adds up to 100%
                </>
              ) : total > 100 ? (
                `${Number((total - 100).toFixed(2))}% too much`
              ) : (
                `${Number((100 - total).toFixed(2))}% left`
              )}
            </span>
          </div>

          {preview && (
            <div className="admpt-preview">
              <span className="admpt-preview-label">Will be saved as</span>
              <span className="admpt-preview-text">{preview}</span>
              <SplitBar parts={previewParts} small />
            </div>
          )}

          {error && (
            <p className="admpt-error">
              <AlertCircle size={15} />
              {error}
            </p>
          )}

          <div className="admpt-modal-actions">
            <button type="button" className="admpt-btn-secondary" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="admpt-btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save Payment Terms'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function AdminPaymentTermsHistoryPage() {
  const [terms, setTerms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [toast, setToast] = useState('');
  const [page, setPage] = useState(1);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const data = await getAdminPaymentTerms();
      setTerms(Array.isArray(data) ? data : []);
    } catch {
      setError('Could not load Payment Terms History. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(''), 4500);
    return () => clearTimeout(timer);
  }, [toast]);

  // Newest first - the newest entry is the one in use
  const sorted = useMemo(
    () =>
      [...terms].sort((a, b) => {
        const diff = new Date(b.date_added) - new Date(a.date_added);
        return diff !== 0 ? diff : b.id - a.id;
      }),
    [terms],
  );

  const current = sorted[0] || null;
  const currentParts = current ? splitTerms(current.description) : [];
  const currentAllPercent = currentParts.length > 0 && currentParts.every((p) => p.percent !== null);
  const currentTotal = totalOf(currentParts);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * PAGE_SIZE;
  const pageItems = sorted.slice(startIndex, startIndex + PAGE_SIZE);

  const closeModal = useCallback(() => setShowModal(false), []);

  function handleSaved(description) {
    setShowModal(false);
    setToast(`New payment terms saved: ${description}`);
    setPage(1);
    load({ silent: true });
  }

  function goToPage(p) {
    setPage(p);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  let heroText;
  if (loading) heroText = 'Loading every payment terms entry...';
  else if (error) heroText = 'Payment Terms History could not be loaded right now.';
  else if (!current) heroText = 'No payment terms yet. Add how customers should pay.';
  else
    heroText = `Version ${sorted.length} is in use since ${formatDate(current.date_added)} · ${sorted.length} version${
      sorted.length === 1 ? '' : 's'
    } in total.`;

  return (
    <AdminLayout
      pageTitle="Payment Terms History"
      pageSubtitle="How customers pay, and every change made to the payment terms"
    >
      <div className="admpt-page">
        {/* ---------- Banner ---------- */}
        <section className="admpt-hero">
          <div className="admpt-hero-glow" aria-hidden="true" />
          <div className="admpt-hero-icon">
            <Receipt size={26} />
          </div>
          <div className="admpt-hero-text">
            <h1>Payment Terms</h1>
            <p>{heroText}</p>
            <p className="admpt-hero-rule">
              <Lock size={13} />
              Payment terms can't be edited or deleted. To change them, add new terms. The newest entry is used for
              quotations.
            </p>
          </div>
          <div className="admpt-hero-actions">
            <button
              type="button"
              className="admpt-hero-btn gold"
              onClick={() => setShowModal(true)}
              disabled={loading || Boolean(error)}
            >
              <Plus size={16} />
              Add Payment Terms
            </button>
            <button
              type="button"
              className="admpt-hero-btn glass"
              onClick={() => load({ silent: true })}
              disabled={loading || refreshing}
            >
              <RefreshCw size={16} className={refreshing ? 'spin' : ''} />
              Refresh
            </button>
          </div>
        </section>

        {toast && (
          <div className="admpt-toast" role="status">
            <CheckCircle2 size={18} />
            <span>{toast}</span>
            <button type="button" onClick={() => setToast('')} aria-label="Dismiss">
              <X size={15} />
            </button>
          </div>
        )}

        {error ? (
          <div className="admpt-card">
            <div className="admpt-empty-state">
              <span className="admpt-empty-badge admpt-empty-badge-red">
                <AlertCircle size={26} />
              </span>
              <p className="admpt-empty-title">Something went wrong</p>
              <p className="admpt-empty-hint">{error}</p>
              <button type="button" className="admpt-btn-primary" onClick={() => load()}>
                <RefreshCw size={15} />
                Try again
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* ---------- Current payment terms ---------- */}
            <section className="admpt-card admpt-current">
              <div className="admpt-card-head">
                <span className="admpt-card-icon tone-green">
                  <CalendarCheck size={18} />
                </span>
                <div className="admpt-card-head-text">
                  <h2>Current Payment Terms</h2>
                  <p>Used on every new quotation</p>
                </div>
                {!loading && current && (
                  <span className="admpt-status current">
                    <span className="admpt-status-dot" />
                    Version {sorted.length}
                  </span>
                )}
              </div>

              {loading ? (
                <div className="admpt-current-body">
                  <span className="admpt-skel admpt-skel-bar" />
                  <span className="admpt-skel admpt-skel-w-lg" />
                </div>
              ) : !current ? (
                <div className="admpt-empty-state small">
                  <span className="admpt-empty-badge">
                    <Receipt size={24} />
                  </span>
                  <p className="admpt-empty-title">No payment terms yet</p>
                  <p className="admpt-empty-hint">
                    Add how customers should pay, for example 30% down and 70% upon installation.
                  </p>
                  <button type="button" className="admpt-btn-primary" onClick={() => setShowModal(true)}>
                    <Plus size={15} />
                    Add Payment Terms
                  </button>
                </div>
              ) : (
                <div className="admpt-current-body">
                  <SplitBar parts={currentParts} />
                  {currentParts.length > 0 && (
                    <div className="admpt-steps">
                      {currentParts.map((part, i) => (
                        <div key={i} className="admpt-step">
                          <span className={`admpt-step-percent part-${i % 3}`}>{part.percent || '—'}</span>
                          <div className="admpt-step-text">
                            <span className="admpt-step-label">Payment {i + 1}</span>
                            <span className="admpt-step-value">{part.text || 'Of the total price'}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {currentAllPercent && !isHundred(currentTotal) && (
                    <p className="admpt-warn">
                      <AlertTriangle size={15} />
                      <span>
                        These terms add up to <strong>{currentTotal}%</strong>, not 100%. Click{' '}
                        <strong>Add Payment Terms</strong> to fix them.
                      </span>
                    </p>
                  )}

                  <div className="admpt-current-foot">
                    <span>
                      <CalendarCheck size={14} />
                      Effective since <strong>{formatDate(current.date_added)}</strong>
                    </span>
                    <span>
                      <Clock size={14} />
                      {usedFor(current.date_added, null)}
                    </span>
                  </div>
                </div>
              )}
            </section>

            {/* ---------- Full history ---------- */}
            <section className="admpt-card admpt-list-card">
              <div className="admpt-list-head">
                <span className="admpt-card-icon tone-navy">
                  <History size={18} />
                </span>
                <div className="admpt-card-head-text">
                  <h2>Full History</h2>
                  <p>Newest first. Older versions are kept for your records.</p>
                </div>
                {!loading && sorted.length > 0 && (
                  <span className="admpt-count">
                    {sorted.length} version{sorted.length === 1 ? '' : 's'}
                  </span>
                )}
              </div>

              {!loading && sorted.length === 0 ? (
                <div className="admpt-empty-state">
                  <span className="admpt-empty-badge">
                    <Inbox size={26} />
                  </span>
                  <p className="admpt-empty-title">No history yet</p>
                  <p className="admpt-empty-hint">Every change you make will be listed here.</p>
                </div>
              ) : (
                <>
                  <ol className="admpt-timeline">
                    {loading
                      ? Array.from({ length: 3 }).map((_, i) => <ItemSkeleton key={i} />)
                      : pageItems.map((entry, i) => {
                          const overallIndex = startIndex + i;
                          const versionNumber = sorted.length - overallIndex;
                          const isCurrent = overallIndex === 0;
                          const isFirst = overallIndex === sorted.length - 1;
                          const newer = overallIndex > 0 ? sorted[overallIndex - 1] : null;
                          const parts = splitTerms(entry.description);
                          const allPercent = parts.length > 0 && parts.every((p) => p.percent !== null);
                          const total = totalOf(parts);

                          return (
                            <li key={entry.id} className={`admpt-item ${isCurrent ? 'current' : ''}`}>
                              <span className={`admpt-version-badge ${isCurrent ? 'current' : ''}`}>
                                {versionNumber}
                              </span>

                              <div className="admpt-item-card">
                                <div className="admpt-item-top">
                                  <div className="admpt-item-title">
                                    <strong>Version {versionNumber}</strong>
                                    {isFirst && <span className="admpt-first-tag">First entry</span>}
                                  </div>
                                  <span className={`admpt-status ${isCurrent ? 'current' : 'replaced'}`}>
                                    <span className="admpt-status-dot" />
                                    {isCurrent ? 'Current' : 'Replaced'}
                                  </span>
                                </div>

                                {parts.length > 0 ? (
                                  <TermChips parts={parts} />
                                ) : (
                                  <span className="admpt-terms-text">{entry.description || '—'}</span>
                                )}

                                <SplitBar parts={parts} small />

                                <div className="admpt-item-foot">
                                  <span>
                                    <CalendarCheck size={13} />
                                    Effective since <strong>{formatDate(entry.date_added)}</strong>
                                  </span>
                                  <span>
                                    <Clock size={13} />
                                    {usedFor(entry.date_added, newer?.date_added)}
                                  </span>
                                  {allPercent && !isHundred(total) && (
                                    <span className="admpt-total-warn" title="These terms do not add up to 100%">
                                      <AlertTriangle size={11} />
                                      Adds up to {total}%
                                    </span>
                                  )}
                                </div>
                              </div>
                            </li>
                          );
                        })}
                  </ol>

                  {/* Page buttons only show when there is more than one page */}
                  {!loading && totalPages > 1 && (
                    <div className="admpt-pagination">
                      <div className="admpt-pagination-controls">
                        <button
                          type="button"
                          className="admpt-page-btn"
                          disabled={safePage === 1}
                          onClick={() => goToPage(safePage - 1)}
                          aria-label="Previous page"
                        >
                          <ChevronLeft size={16} />
                        </button>
                        {getPageNumbers(safePage, totalPages).map((p, i) =>
                          p === '...' ? (
                            <span key={`gap-${i}`} className="admpt-page-gap">
                              …
                            </span>
                          ) : (
                            <button
                              key={p}
                              type="button"
                              className={`admpt-page-num ${p === safePage ? 'active' : ''}`}
                              onClick={() => goToPage(p)}
                            >
                              {p}
                            </button>
                          ),
                        )}
                        <button
                          type="button"
                          className="admpt-page-btn"
                          disabled={safePage === totalPages}
                          onClick={() => goToPage(safePage + 1)}
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
          </>
        )}
      </div>

      {showModal && <AddTermsModal onClose={closeModal} onSaved={handleSaved} />}
    </AdminLayout>
  );
}