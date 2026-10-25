import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Inbox,
  ShieldCheck,
  CheckCircle2,
  Award,
  XCircle,
  MinusCircle,
  Layers,
  Clock,
  UserCheck,
  ClipboardList,
  MapPin,
  X,
  AlertCircle,
  ArrowRight,
  ChevronRight,
  RefreshCw,
  HardHat,
  Sun,
  Sunrise,
  Moon,
  LayoutDashboard,
} from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import { getAdminTickets } from '../../../api/adminTickets';
import '../styles/admin-dashboard.css';

const POLL_INTERVAL_MS = 15000;
// The table only shows the 5 newest requests. "View all requests" opens the full list.
const ROWS_SHOWN = 5;

// Tickets that are still moving through the process
const OPEN_STATUSES = ['REQUEST_SUBMITTED', 'PI_ASSIGNED', 'ASSESSMENT_SUBMITTED', 'STAFF_REVIEW', 'ADMIN_REVIEW'];

// The 4 cards are also the filter for the table below them
const STAT_CARDS = [
  { key: 'APPROVAL', label: 'Awaiting Your Approval', note: 'Sent to Admin by Staff', statuses: ['ADMIN_REVIEW'], icon: ShieldCheck, tone: 'gold' },
  { key: 'OPEN', label: 'Open Requests', note: 'Still in progress', statuses: OPEN_STATUSES, icon: Inbox, tone: 'blue' },
  { key: 'APPROVED', label: 'Approved', note: 'Waiting for installation', statuses: ['APPROVED'], icon: CheckCircle2, tone: 'green' },
  { key: 'COMPLETED', label: 'Completed', note: 'All time', statuses: ['COMPLETED'], icon: Award, tone: 'navy' },
];

// Badge look for each ticket status
const STATUS_BADGE = {
  REQUEST_SUBMITTED: { tone: 'navy', icon: Clock },
  PI_ASSIGNED: { tone: 'blue', icon: UserCheck },
  ASSESSMENT_SUBMITTED: { tone: 'blue', icon: ClipboardList },
  STAFF_REVIEW: { tone: 'blue', icon: ClipboardList },
  ADMIN_REVIEW: { tone: 'gold', icon: ShieldCheck },
  APPROVED: { tone: 'green', icon: CheckCircle2 },
  COMPLETED: { tone: 'navy', icon: Award, solid: true },
  NC_CANNOT_PROCEED: { tone: 'red', icon: XCircle },
  NC_CAN_REAPPLY: { tone: 'red', icon: XCircle },
  WITHDRAWN: { tone: 'gray', icon: MinusCircle },
};

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// "Today", "Yesterday", "3 days ago"
function daysAgo(value) {
  if (!value) return '';
  const then = new Date(value);
  then.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((today - then) / 86400000);
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return `${diff} days ago`;
}

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : parts[0]?.[1] || '';
  return (first + last).toUpperCase();
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return { text: 'Good morning', icon: Sunrise };
  if (hour < 18) return { text: 'Good afternoon', icon: Sun };
  return { text: 'Good evening', icon: Moon };
}

function DashboardSkeleton() {
  return (
    <div className="admd-page" aria-busy="true">
      <div className="admd-skel admd-skel-hero" />
      <div className="admd-stats">
        {STAT_CARDS.map((c) => (
          <div key={c.key} className="admd-skel admd-skel-stat" />
        ))}
      </div>
      <div className="admd-skel admd-skel-list" />
    </div>
  );
}

export default function AdminDashboardPage() {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [activeFilter, setActiveFilter] = useState('ALL');

  const username = localStorage.getItem('username') || 'Admin';

  // Loads the tickets, then checks again every 15 seconds for new ones
  useEffect(() => {
    let cancelled = false;

    async function load(isInitial) {
      try {
        const data = await getAdminTickets();
        if (cancelled) return;
        setTickets(data);
        setError('');
      } catch {
        if (isInitial && !cancelled) setError('Could not load requests. Please try again.');
      } finally {
        if (!cancelled) {
          if (isInitial) setLoading(false);
          setRefreshing(false);
        }
      }
    }

    load(true);
    const interval = setInterval(() => load(false), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [reloadKey]);

  function refresh() {
    setRefreshing(true);
    setReloadKey((k) => k + 1);
  }

  function retry() {
    setLoading(true);
    setError('');
    setReloadKey((k) => k + 1);
  }

  // Click a card to filter the table. Click it again to show everything.
  function toggleFilter(key) {
    setActiveFilter((current) => (current === key ? 'ALL' : key));
  }

  function openTicket(id) {
    navigate(`/admin/requests/${id}`);
  }

  const counts = {};
  STAT_CARDS.forEach((c) => {
    counts[c.key] = tickets.filter((t) => c.statuses.includes(t.status)).length;
  });

  const currentCard = STAT_CARDS.find((c) => c.key === activeFilter);
  const filtered = currentCard ? tickets.filter((t) => currentCard.statuses.includes(t.status)) : tickets;
  const shown = [...filtered]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, ROWS_SHOWN);

  const approvalCount = counts.APPROVAL || 0;
  const openCount = counts.OPEN || 0;

  const greeting = getGreeting();
  const GreetingIcon = greeting.icon;
  const todayLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

  // One clear message for the banner (your name is already in the page header)
  let heroTitle;
  let heroText;
  const heroUrgent = approvalCount > 0;
  if (approvalCount > 0) {
    heroTitle = `${approvalCount} ticket${approvalCount === 1 ? ' is' : 's are'} waiting for your approval`;
    heroText = 'Staff checked these assessments and sent them to you for the final decision.';
  } else if (openCount > 0) {
    heroTitle = `${openCount} open request${openCount === 1 ? '' : 's'} in progress`;
    heroText = 'Nothing needs your approval right now. Staff and the installers are on it.';
  } else {
    heroTitle = "You're all caught up";
    heroText = 'New customer requests will show up here.';
  }

  if (loading) {
    return (
      <AdminLayout pageTitle={`Welcome back, ${username}`} pageSubtitle="Here's what's happening with Glomax Solar today">
        <DashboardSkeleton />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout pageTitle={`Welcome back, ${username}`} pageSubtitle="Here's what's happening with Glomax Solar today">
      <div className="admd-page">
        {/* ---------- Banner ---------- */}
        <section className={`admd-hero ${heroUrgent && !error ? 'urgent' : ''}`}>
          <div className="admd-hero-glow" aria-hidden="true" />
          <div className="admd-hero-icon">
            {heroUrgent ? <ShieldCheck size={26} /> : <LayoutDashboard size={26} />}
          </div>
          <div className="admd-hero-text">
            <span className="admd-hero-kicker">
              <GreetingIcon size={13} />
              {greeting.text} · {todayLabel}
            </span>
            <h1>{error ? 'Requests could not be loaded' : heroTitle}</h1>
            <p>{error ? 'Please try again in a moment.' : heroText}</p>
          </div>
          <div className="admd-hero-actions">
            {heroUrgent && !error && activeFilter !== 'APPROVAL' && (
              <button type="button" className="admd-hero-btn gold" onClick={() => setActiveFilter('APPROVAL')}>
                Review now
                <ArrowRight size={16} />
              </button>
            )}
            <button type="button" className="admd-hero-btn glass" onClick={refresh} disabled={refreshing}>
              <RefreshCw size={16} className={refreshing ? 'spin' : ''} />
              Refresh
            </button>
          </div>
        </section>

        {error ? (
          <div className="admd-card">
            <div className="admd-empty-state">
              <span className="admd-empty-badge admd-empty-badge-red">
                <AlertCircle size={26} />
              </span>
              <p className="admd-empty-title">Something went wrong</p>
              <p className="admd-empty-hint">{error}</p>
              <button type="button" className="admd-btn-primary" onClick={retry}>
                <RefreshCw size={15} />
                Try again
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* ---------- Stat cards (also the filter) ---------- */}
            <div className="admd-stats" role="tablist" aria-label="Filter requests">
              {STAT_CARDS.map((card) => {
                const Icon = card.icon;
                const active = activeFilter === card.key;
                const urgent = card.key === 'APPROVAL' && approvalCount > 0;
                return (
                  <button
                    type="button"
                    key={card.key}
                    role="tab"
                    aria-selected={active}
                    className={`admd-stat tone-${card.tone} ${active ? 'active' : ''} ${urgent ? 'urgent' : ''}`}
                    onClick={() => toggleFilter(card.key)}
                    title={active ? 'Show all requests' : `Show only: ${card.label}`}
                  >
                    <span className="admd-stat-top">
                      <span className="admd-stat-icon">
                        <Icon size={18} />
                      </span>
                      <span className="admd-stat-value">{counts[card.key]}</span>
                    </span>
                    <span className="admd-stat-label">{card.label}</span>
                    <span className="admd-stat-hint">{card.note}</span>
                  </button>
                );
              })}
            </div>

            {/* ---------- Requests table ---------- */}
            <section className="admd-card admd-list-card">
              <div className="admd-card-head">
                <div className="admd-card-head-text">
                  <h2>
                    <Inbox size={18} />
                    {currentCard ? currentCard.label : 'Latest Requests'}
                  </h2>
                  <p>
                    {currentCard
                      ? 'The 5 newest requests in this group. Click a row to open it.'
                      : 'The 5 newest customer requests. Click a row to open it.'}
                  </p>
                </div>
                {currentCard && (
                  <button type="button" className="admd-clear-filter" onClick={() => setActiveFilter('ALL')}>
                    <Layers size={14} />
                    Show all
                    <X size={13} />
                  </button>
                )}
              </div>

              {shown.length === 0 ? (
                <div className="admd-empty-state">
                  <span className="admd-empty-badge">
                    <Inbox size={26} />
                  </span>
                  <p className="admd-empty-title">
                    {currentCard ? `Nothing in ${currentCard.label}` : 'No requests yet'}
                  </p>
                  <p className="admd-empty-hint">
                    {currentCard
                      ? 'Pick another card above, or show all requests.'
                      : 'New customer requests will show up here.'}
                  </p>
                  {currentCard && (
                    <button type="button" className="admd-btn-secondary" onClick={() => setActiveFilter('ALL')}>
                      Show all requests
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <div className="admd-list" role="table">
                    <div className="admd-row admd-head" role="row">
                      <span role="columnheader">Ticket #</span>
                      <span role="columnheader">Customer</span>
                      <span role="columnheader" className="admd-hide-md">Property Address</span>
                      <span role="columnheader" className="admd-hide-md">Partner Installer</span>
                      <span role="columnheader" className="admd-hide-sm">Submitted</span>
                      <span role="columnheader">Status</span>
                      <span aria-hidden="true" />
                    </div>

                    {shown.map((t) => {
                      const badge = STATUS_BADGE[t.status] || STATUS_BADGE.PI_ASSIGNED;
                      const BadgeIcon = badge.icon;
                      const name = t.full_name || t.customer_username;
                      const installer = t.partner_installer_username;
                      const needsYou = t.status === 'ADMIN_REVIEW';

                      return (
                        <div
                          key={t.id}
                          className={`admd-row admd-item ${needsYou ? 'is-action' : ''}`}
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
                          <span className="admd-ticket" role="cell">
                            {t.ticket_number}
                          </span>

                          <span className="admd-customer" role="cell">
                            <span className="admd-avatar">{getInitials(name)}</span>
                            <span className="admd-customer-text">
                              <span className="admd-customer-name">{name}</span>
                              <span className="admd-customer-sub">
                                {t.solar_package && <span className="admd-package">{t.solar_package}</span>}
                                {/* Installer under the name - only on smaller screens */}
                                <span className={`admd-inline-installer ${installer ? '' : 'none'}`}>
                                  <HardHat size={12} />
                                  {installer || 'No installer yet'}
                                </span>
                              </span>
                            </span>
                          </span>

                          <span className="admd-hide-md" role="cell">
                            {t.property_address ? (
                              <span className="admd-address" title={t.property_address}>
                                <MapPin size={14} />
                                <span>{t.property_address}</span>
                              </span>
                            ) : (
                              <span className="admd-muted">No address</span>
                            )}
                          </span>

                          <span className="admd-hide-md" role="cell">
                            {installer ? (
                              <span className="admd-installer">
                                <span className="admd-installer-icon">
                                  <HardHat size={14} />
                                </span>
                                <span className="admd-installer-name">{installer}</span>
                              </span>
                            ) : (
                              <span className="admd-unassigned">Not assigned</span>
                            )}
                          </span>

                          <span className="admd-hide-sm" role="cell">
                            <span className="admd-date">
                              <span className="admd-date-main">{formatDate(t.created_at)}</span>
                              <span className="admd-date-sub">{daysAgo(t.created_at)}</span>
                            </span>
                          </span>

                          <span role="cell">
                            <span className={`admd-status tone-${badge.tone} ${badge.solid ? 'solid' : ''}`}>
                              <BadgeIcon size={12} />
                              {t.status_display}
                            </span>
                          </span>

                          <span className="admd-arrow" aria-hidden="true">
                            <ChevronRight size={18} />
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  <div className="admd-card-footer">
                    <button type="button" className="admd-view-all" onClick={() => navigate('/admin/requests')}>
                      View all requests
                      <ArrowRight size={14} />
                    </button>
                  </div>
                </>
              )}
            </section>
          </>
        )}
      </div>
    </AdminLayout>
  );
}