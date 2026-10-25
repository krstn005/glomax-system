import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Download,
  FileText,
  CheckCircle2,
  Wallet,
  Star,
  BarChart3,
  PieChart,
  Package,
  HardHat,
  AlertCircle,
  RefreshCw,
  Inbox,
  X,
  Info,
} from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import { getAdminTickets, exportReportsPdf } from '../../../api/adminTickets';
import { getWorkers } from '../../../api/accounts';
import { formatCurrency } from '../../../utils/currency';
import '../styles/admin-reports.css';

const PERIODS = [
  { key: 'ALL', label: 'All time', short: 'All' },
  { key: 'YEAR', label: 'This year', short: 'Year' },
  { key: 'MONTH', label: 'This month', short: 'Month' },
  { key: 'LAST_30', label: 'Last 30 days', short: '30 days' },
];

// Colours use the system palette only
const STATUS_GROUPS = [
  { label: 'New Requests', statuses: ['REQUEST_SUBMITTED'], tone: 'gold' },
  {
    label: 'Under Assessment',
    statuses: ['PI_ASSIGNED', 'ASSESSMENT_SUBMITTED', 'STAFF_REVIEW', 'ADMIN_REVIEW'],
    tone: 'blue',
  },
  { label: 'Approved', statuses: ['APPROVED'], tone: 'green' },
  { label: 'Completed', statuses: ['COMPLETED'], tone: 'navy' },
  { label: 'Not Compatible', statuses: ['NC_CANNOT_PROCEED', 'NC_CAN_REAPPLY'], tone: 'red' },
  { label: 'Withdrawn', statuses: ['WITHDRAWN'], tone: 'gray' },
];

// Tickets a worker is still working on
const WORKER_ACTIVE = ['PI_ASSIGNED', 'ASSESSMENT_SUBMITTED', 'STAFF_REVIEW', 'ADMIN_REVIEW', 'APPROVED'];

function toDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function inPeriod(ticket, period) {
  if (period === 'ALL') return true;
  const d = toDate(ticket.created_at);
  if (!d) return false;
  const now = new Date();
  if (period === 'YEAR') return d.getFullYear() === now.getFullYear();
  if (period === 'MONTH') return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  if (period === 'LAST_30') return now - d <= 30 * 86400000;
  return true;
}

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function StarRow({ value, size = 14 }) {
  return (
    <span className="admrp-stars" aria-label={`${value.toFixed(1)} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => {
        const fill = Math.max(0, Math.min(1, value - (n - 1)));
        return (
          <span key={n} className="admrp-star" style={{ width: size, height: size }}>
            <Star size={size} className="admrp-star-empty" />
            <span className="admrp-star-fill" style={{ width: `${fill * 100}%` }}>
              <Star size={size} className="admrp-star-full" />
            </span>
          </span>
        );
      })}
    </span>
  );
}

function PanelHead({ icon: Icon, tone, title, subtitle, children }) {
  return (
    <div className="admrp-panel-head">
      <span className={`admrp-panel-icon tone-${tone}`}>
        <Icon size={18} />
      </span>
      <div className="admrp-panel-text">
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
      {children}
    </div>
  );
}

function Skeleton() {
  return (
    <>
      <div className="admrp-stats">
        {[1, 2, 3, 4].map((n) => (
          <span key={n} className="admrp-skel admrp-skel-stat" />
        ))}
      </div>
      <div className="admrp-grid">
        <span className="admrp-skel admrp-skel-panel" />
        <span className="admrp-skel admrp-skel-panel" />
      </div>
    </>
  );
}

export default function AdminReportsPage() {
  const [tickets, setTickets] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exportError, setExportError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [period, setPeriod] = useState('ALL');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [ticketData, workerData] = await Promise.all([getAdminTickets(), getWorkers()]);
      setTickets(Array.isArray(ticketData) ? ticketData : []);
      setWorkers(Array.isArray(workerData) ? workerData : []);
    } catch {
      setError('Could not load report data. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => tickets.filter((t) => inPeriod(t, period)), [tickets, period]);

  const stats = useMemo(() => {
    const total = filtered.length;
    const completed = filtered.filter((t) => t.status === 'COMPLETED');
    const approved = filtered.filter((t) => t.status === 'APPROVED');
    const earned = completed.reduce((sum, t) => sum + Number(t.final_sheet?.final_cost || 0), 0);
    const waiting = approved.reduce((sum, t) => sum + Number(t.final_sheet?.final_cost || 0), 0);
    const rated = filtered.filter((t) => t.feedback && Number(t.feedback.rating) > 0);
    const avgRating = rated.length
      ? rated.reduce((sum, t) => sum + Number(t.feedback.rating), 0) / rated.length
      : 0;
    return {
      total,
      completed: completed.length,
      completionRate: total ? Math.round((completed.length / total) * 100) : 0,
      earned,
      waiting,
      avgRating,
      ratedCount: rated.length,
    };
  }, [filtered]);

  const breakdown = useMemo(
    () =>
      STATUS_GROUPS.map((g) => {
        const count = filtered.filter((t) => g.statuses.includes(t.status)).length;
        return { ...g, count, pct: filtered.length ? Math.round((count / filtered.length) * 100) : 0 };
      }),
    [filtered]
  );

  // Always the last 6 months, so the chart has something to compare
  const months = useMemo(() => {
    const now = new Date();
    const list = [];
    for (let i = 5; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      list.push({
        key: `${d.getFullYear()}-${d.getMonth()}`,
        label: d.toLocaleDateString('en-US', { month: 'short' }),
        year: d.getFullYear(),
        month: d.getMonth(),
        requests: 0,
        completed: 0,
      });
    }
    tickets.forEach((t) => {
      const created = toDate(t.created_at);
      if (created) {
        const m = list.find((x) => x.year === created.getFullYear() && x.month === created.getMonth());
        if (m) m.requests += 1;
      }
      if (t.status === 'COMPLETED') {
        const done = toDate(t.completed_at || t.updated_at);
        if (done) {
          const m = list.find((x) => x.year === done.getFullYear() && x.month === done.getMonth());
          if (m) m.completed += 1;
        }
      }
    });
    return list;
  }, [tickets]);
  const monthMax = Math.max(1, ...months.map((m) => Math.max(m.requests, m.completed)));
  // Round the top line up to a nice number for the guide lines
  const chartTop = monthMax <= 4 ? 4 : Math.ceil(monthMax / 4) * 4;
  const chartHasData = months.some((m) => m.requests || m.completed);

  const packages = useMemo(() => {
    const counts = {};
    filtered.forEach((t) => {
      const name = (t.solar_package || '').trim();
      if (!name) return;
      counts[name] = (counts[name] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [filtered]);
  const packageMax = Math.max(1, ...packages.map((p) => p.count));

  const workerRows = useMemo(
    () =>
      workers
        .map((w) => {
          const mine = filtered.filter((t) => t.partner_installer_username === w.username);
          const rated = mine.filter((t) => t.feedback && Number(t.feedback.rating) > 0);
          return {
            ...w,
            assigned: mine.length,
            active: mine.filter((t) => WORKER_ACTIVE.includes(t.status)).length,
            completed: mine.filter((t) => t.status === 'COMPLETED').length,
            avgRating: rated.length ? rated.reduce((s, t) => s + Number(t.feedback.rating), 0) / rated.length : 0,
            ratedCount: rated.length,
          };
        })
        .sort((a, b) => b.completed - a.completed || b.assigned - a.assigned),
    [workers, filtered]
  );

  async function handleExport() {
    setExporting(true);
    setExportError('');
    try {
      await exportReportsPdf();
    } catch {
      setExportError('Could not export the PDF. Please try again.');
    } finally {
      setExporting(false);
    }
  }

  const periodLabel = PERIODS.find((p) => p.key === period)?.label;

  return (
    <AdminLayout pageTitle="Reports & Analytics" pageSubtitle="How the business is doing: requests, installs, revenue, and ratings">
      <div className="admrp-page">
        {/* ---------- Banner ---------- */}
        <section className="admrp-hero">
          <div className="admrp-hero-glow" aria-hidden="true" />
          <div className="admrp-hero-icon">
            <BarChart3 size={26} />
          </div>
          <div className="admrp-hero-text">
            <h1>Business Overview</h1>
            <p>Requests, installs, revenue and ratings for {periodLabel.toLowerCase()}.</p>
          </div>
          <div className="admrp-hero-actions">
            <div className="admrp-periods" role="tablist" aria-label="Time period">
              {PERIODS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  role="tab"
                  aria-selected={period === p.key}
                  className={`admrp-period ${period === p.key ? 'active' : ''}`}
                  onClick={() => setPeriod(p.key)}
                >
                  <span className="admrp-period-long">{p.label}</span>
                  <span className="admrp-period-short">{p.short}</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              className="admrp-hero-btn gold"
              onClick={handleExport}
              disabled={exporting || loading}
            >
              <Download size={16} />
              {exporting ? 'Exporting...' : 'Export PDF'}
            </button>
          </div>
        </section>

        {exportError && (
          <div className="admrp-alert" role="alert">
            <AlertCircle size={17} />
            <span>{exportError}</span>
            <button type="button" onClick={() => setExportError('')} aria-label="Dismiss">
              <X size={15} />
            </button>
          </div>
        )}

        {loading ? (
          <Skeleton />
        ) : error ? (
          <div className="admrp-card">
            <div className="admrp-empty">
              <span className="admrp-empty-icon red">
                <AlertCircle size={26} />
              </span>
              <p className="admrp-empty-title">Something went wrong</p>
              <p className="admrp-empty-hint">{error}</p>
              <button type="button" className="admrp-btn-primary" onClick={load}>
                <RefreshCw size={15} />
                Try again
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* ---------- Number cards ---------- */}
            <div className="admrp-stats">
              <div className="admrp-stat tone-navy">
                <span className="admrp-stat-top">
                  <span className="admrp-stat-icon">
                    <FileText size={18} />
                  </span>
                  <span className="admrp-stat-value">{stats.total}</span>
                </span>
                <span className="admrp-stat-label">Total Requests</span>
                <span className="admrp-stat-hint">Sent by customers</span>
              </div>

              <div className="admrp-stat tone-green">
                <span className="admrp-stat-top">
                  <span className="admrp-stat-icon">
                    <CheckCircle2 size={18} />
                  </span>
                  <span className="admrp-stat-value">{stats.completed}</span>
                </span>
                <span className="admrp-stat-label">Completed Installs</span>
                <span className="admrp-stat-hint">{stats.completionRate}% of all requests</span>
              </div>

              <div className="admrp-stat admrp-stat-money">
                <span className="admrp-stat-top">
                  <span className="admrp-stat-icon">
                    <Wallet size={18} />
                  </span>
                </span>
                <span className="admrp-stat-money-value">{formatCurrency(stats.earned)}</span>
                <span className="admrp-stat-label">Revenue</span>
                <span className="admrp-stat-hint">
                  {stats.waiting > 0
                    ? `+${formatCurrency(stats.waiting)} waiting (approved)`
                    : 'From completed installations'}
                </span>
              </div>

              <div className="admrp-stat tone-gold">
                <span className="admrp-stat-top">
                  <span className="admrp-stat-icon">
                    <Star size={18} />
                  </span>
                  <span className="admrp-stat-value">
                    {stats.avgRating.toFixed(1)}
                    <small>/5</small>
                  </span>
                </span>
                <span className="admrp-stat-label">Average Rating</span>
                <span className="admrp-stat-hint admrp-stat-stars">
                  <StarRow value={stats.avgRating} size={12} />
                  {stats.ratedCount} review{stats.ratedCount === 1 ? '' : 's'}
                </span>
              </div>
            </div>

            {/* ---------- Chart and status ---------- */}
            <div className="admrp-grid">
              <section className="admrp-card admrp-panel">
                <PanelHead
                  icon={BarChart3}
                  tone="navy"
                  title="Last 6 Months"
                  subtitle="New requests and finished installs each month"
                >
                  <div className="admrp-legend">
                    <span>
                      <i className="admrp-legend-dot requests" /> Requests
                    </span>
                    <span>
                      <i className="admrp-legend-dot completed" /> Completed
                    </span>
                  </div>
                </PanelHead>

                {!chartHasData ? (
                  <p className="admrp-panel-empty">No requests in the last 6 months.</p>
                ) : (
                  <div className="admrp-chart">
                    <div className="admrp-chart-lines" aria-hidden="true">
                      {[4, 3, 2, 1, 0].map((n) => (
                        <span key={n} className="admrp-chart-line">
                          <em>{Math.round((chartTop / 4) * n)}</em>
                        </span>
                      ))}
                    </div>
                    <div className="admrp-chart-cols">
                      {months.map((m) => (
                        <div key={m.key} className="admrp-chart-col">
                          <div className="admrp-chart-bars">
                            <div className="admrp-chart-bar-wrap">
                              <span
                                className="admrp-chart-bar requests"
                                style={{ height: `${(m.requests / chartTop) * 100}%` }}
                                title={`${m.requests} request${m.requests === 1 ? '' : 's'}`}
                              >
                                {m.requests > 0 && <span className="admrp-chart-value">{m.requests}</span>}
                              </span>
                            </div>
                            <div className="admrp-chart-bar-wrap">
                              <span
                                className="admrp-chart-bar completed"
                                style={{ height: `${(m.completed / chartTop) * 100}%` }}
                                title={`${m.completed} completed`}
                              >
                                {m.completed > 0 && <span className="admrp-chart-value">{m.completed}</span>}
                              </span>
                            </div>
                          </div>
                          <span className="admrp-chart-label">{m.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>

              <section className="admrp-card admrp-panel">
                <PanelHead
                  icon={PieChart}
                  tone="blue"
                  title="Request Status"
                  subtitle="Where every request is right now"
                />

                {filtered.length === 0 ? (
                  <p className="admrp-panel-empty">No requests in this period.</p>
                ) : (
                  <div className="admrp-status-list">
                    {breakdown.map((b) => (
                      <div key={b.label} className={`admrp-status-row tone-${b.tone} ${b.count ? '' : 'empty'}`}>
                        <div className="admrp-status-top">
                          <span className="admrp-status-dot" />
                          <span className="admrp-status-label">{b.label}</span>
                          <span className="admrp-status-count">{b.count}</span>
                          <span className="admrp-status-pct">{b.pct}%</span>
                        </div>
                        <span className="admrp-status-track">
                          <span style={{ width: `${b.pct}%` }} />
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>

            {/* ---------- Packages and installers ---------- */}
            <div className="admrp-grid admrp-grid-flip">
              <section className="admrp-card admrp-panel">
                <PanelHead icon={Package} tone="gold" title="Popular Packages" subtitle="What customers ask for most" />

                {packages.length === 0 ? (
                  <p className="admrp-panel-empty">No package data in this period.</p>
                ) : (
                  <div className="admrp-pkg-list">
                    {packages.map((p, i) => (
                      <div key={p.name} className={`admrp-pkg-row ${i === 0 ? 'top' : ''}`}>
                        <span className="admrp-pkg-rank">{i + 1}</span>
                        <div className="admrp-pkg-main">
                          <div className="admrp-pkg-top">
                            <span className="admrp-pkg-name">{p.name}</span>
                            <span className="admrp-pkg-count">
                              {p.count} request{p.count === 1 ? '' : 's'}
                            </span>
                          </div>
                          <span className="admrp-pkg-track">
                            <span style={{ width: `${(p.count / packageMax) * 100}%` }} />
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="admrp-card admrp-panel admrp-panel-flush">
                <div className="admrp-panel-pad">
                  <PanelHead
                    icon={HardHat}
                    tone="green"
                    title="Installer Performance"
                    subtitle="Jobs and ratings per partner installer"
                  />
                </div>

                {workerRows.length === 0 ? (
                  <div className="admrp-empty small">
                    <span className="admrp-empty-icon">
                      <Inbox size={22} />
                    </span>
                    <p className="admrp-empty-title">No installers yet</p>
                    <p className="admrp-empty-hint">Add workers in the Workers page to see their numbers here.</p>
                  </div>
                ) : (
                  <div className="admrp-table" role="table" aria-label="Installer performance">
                    <div className="admrp-row admrp-row-head" role="row">
                      <span role="columnheader">Installer</span>
                      <span role="columnheader" className="admrp-center hide-sm">
                        Assigned
                      </span>
                      <span role="columnheader" className="admrp-center">
                        Active
                      </span>
                      <span role="columnheader" className="admrp-center">
                        Done
                      </span>
                      <span role="columnheader" className="hide-md">
                        Rating
                      </span>
                      <span role="columnheader" className="hide-sm">
                        Status
                      </span>
                    </div>

                    {workerRows.map((w) => {
                      const name = w.full_name || w.username;
                      return (
                        <div key={w.id} className={`admrp-row ${w.is_active ? '' : 'is-inactive'}`} role="row">
                          <span role="cell" className="admrp-person">
                            <span className="admrp-avatar">{getInitials(name)}</span>
                            <span className="admrp-person-text">
                              <span className="admrp-person-name">{name}</span>
                              <span className="admrp-person-sub">
                                @{w.username}
                                <span className="show-sm"> · {w.is_active ? 'Active' : 'Inactive'}</span>
                              </span>
                              {w.ratedCount > 0 && (
                                <span className="admrp-person-rating show-md">
                                  <Star size={11} />
                                  {w.avgRating.toFixed(1)}
                                </span>
                              )}
                            </span>
                          </span>
                          <span role="cell" className="admrp-center hide-sm">
                            <span className="admrp-num">{w.assigned}</span>
                          </span>
                          <span role="cell" className="admrp-center">
                            <span className={`admrp-num ${w.active ? 'blue' : 'zero'}`}>{w.active}</span>
                          </span>
                          <span role="cell" className="admrp-center">
                            <span className={`admrp-num ${w.completed ? 'navy' : 'zero'}`}>{w.completed}</span>
                          </span>
                          <span role="cell" className="hide-md">
                            {w.ratedCount ? (
                              <span className="admrp-rating">
                                <strong>{w.avgRating.toFixed(1)}</strong>
                                <StarRow value={w.avgRating} size={12} />
                              </span>
                            ) : (
                              <span className="admrp-muted">No ratings</span>
                            )}
                          </span>
                          <span role="cell" className="hide-sm">
                            <span className={`admrp-status ${w.is_active ? 'active' : 'inactive'}`}>
                              <span className="admrp-status-pill-dot" />
                              {w.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>

            <p className="admrp-footnote">
              <Info size={14} />
              The time filter changes the numbers on this page. The &quot;Last 6 Months&quot; chart and the PDF export
              always use all data.
            </p>
          </>
        )}
      </div>
    </AdminLayout>
  );
}