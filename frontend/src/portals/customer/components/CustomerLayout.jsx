import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Plus,
  Activity,
  History,
  Files,
  Star,
  HelpCircle,
  Settings,
  LogOut,
  ChevronDown,
  ArrowRight,
  Menu,
  X,
} from 'lucide-react';
import logo from '../../../assets/images/logo.jpg';
import apiClient from '../../../api/client';
import { getMyTickets } from '../../../api/tickets';
import { toMediaUrl } from '../../../utils/mediaUrl';
import CustomerNotificationBell from './CustomerNotificationBell';
import '../styles/customer-layout.css';

// While a ticket has one of these, the customer already has a request
// being worked on, so the gold New Request button is hidden.
// It shows again once the ticket is approved, completed, withdrawn
// or marked not compatible (same rule as the Dashboard).
const IN_PROGRESS_STATUSES = ['REQUEST_SUBMITTED', 'PI_ASSIGNED', 'ASSESSMENT_SUBMITTED', 'STAFF_REVIEW', 'ADMIN_REVIEW'];

// Tickets that have documents the customer can download
const DOCUMENT_STATUSES = ['APPROVED', 'COMPLETED'];

// How often the sidebar numbers refresh.
const COUNT_REFRESH_MS = 60000;

// Kept outside the component. Every page has its own layout, so the layout
// is created again on each page change - this keeps the last numbers so
// they do not jump back to 0 while loading.
let savedCounts = { active: 0, documents: 0 };

// Small gold number next to a sidebar link. Hidden when it is 0.
function NavBadge({ count }) {
  if (!count) return null;
  return (
    <span className="cst-nav-badge" aria-label={`${count} waiting`}>
      {count > 99 ? '99+' : count}
    </span>
  );
}

// Sidebar links, grouped into sections. "New Request" isn't here
// because it has its own gold button at the top of the sidebar.
const NAV_GROUPS = [
  {
    label: 'Overview',
    items: [{ to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }],
  },
  {
    label: 'My Requests',
    items: [
      { to: '/request-status', label: 'Request Status', icon: Activity, badge: 'active' },
      { to: '/past-requests', label: 'Past Requests', icon: History },
      { to: '/documents', label: 'My Documents', icon: Files, badge: 'documents' },
    ],
  },
  {
    label: 'Support',
    items: [
      { to: '/feedback', label: 'Feedback', icon: Star },
      { to: '/faqs', label: 'FAQs', icon: HelpCircle },
    ],
  },
];

// "Juan Dela Cruz" becomes "JC" (first and last word)
function getInitials(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'CU';
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : parts[0][1] || '';
  return (first + last).toUpperCase();
}

// Shows the profile photo if there is one, otherwise the initials.
// If the photo link is broken, it falls back to the initials too.
function HeaderAvatar({ picture, initials, large = false }) {
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    setBroken(false);
  }, [picture]);

  const sizeClass = large ? 'cst-avatar-lg' : '';

  if (picture && !broken) {
    return (
      <img
        src={picture}
        alt="Profile"
        className={`cst-profile-avatar-img ${sizeClass}`}
        onError={() => setBroken(true)}
      />
    );
  }
  return <div className={`cst-profile-avatar ${sizeClass}`}>{initials}</div>;
}

export default function CustomerLayout({ children, pageTitle, pageSubtitle }) {
  const navigate = useNavigate();
  const location = useLocation();
  const profileRef = useRef(null);
  // The name shown in the header: the Full Name from Settings, or the username if there is none
  const [username, setUsername] = useState(
    localStorage.getItem('displayName') || localStorage.getItem('username') || '',
  );
  const [profilePicture, setProfilePicture] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  // Hidden until the tickets load, so the button doesn't flash in and out
  const [canRequest, setCanRequest] = useState(false);
  const [navCounts, setNavCounts] = useState(savedCounts);

  // Check if the customer already has a request in progress
  useEffect(() => {
    let cancelled = false;

    async function checkTickets() {
      try {
        const tickets = await getMyTickets();
        if (cancelled) return;
        const list = Array.isArray(tickets) ? tickets : [];
        setCanRequest(!list.some((t) => IN_PROGRESS_STATUSES.includes(t.status)));
        // Numbers beside the sidebar links
        savedCounts = {
          active: list.filter((t) => IN_PROGRESS_STATUSES.includes(t.status)).length,
          documents: list.filter((t) => DOCUMENT_STATUSES.includes(t.status)).length,
        };
        setNavCounts(savedCounts);
      } catch {
        // Could not check - keep the button hidden. The New Request page
        // still blocks a second request on its own.
        if (!cancelled) setCanRequest(false);
      }
    }
    checkTickets();
    const timer = setInterval(checkTickets, COUNT_REFRESH_MS);
    function handleVisible() {
      if (document.visibilityState === 'visible') checkTickets();
    }
    document.addEventListener('visibilitychange', handleVisible);

    // The Dashboard sends this after a withdraw, so the button comes
    // back right away without a page reload.
    window.addEventListener('customer-tickets-changed', checkTickets);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisible);
      window.removeEventListener('customer-tickets-changed', checkTickets);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadProfilePicture() {
      try {
        const res = await apiClient.get('/accounts/me/');
        if (cancelled) return;
        setProfilePicture(toMediaUrl(res.data.profile_picture));
        const shownName = (res.data.full_name || '').trim() || res.data.username || '';
        if (shownName) {
          setUsername(shownName);
          localStorage.setItem('displayName', shownName);
        }
      } catch {
        // Non-critical - the header just shows initials instead.
      }
    }
    loadProfilePicture();

    // Settings sends this event after a save, so the header updates
    // right away without a page reload.
    function handleUpdate() {
      loadProfilePicture();
    }
    window.addEventListener('profile-picture-updated', handleUpdate);
    return () => {
      cancelled = true;
      window.removeEventListener('profile-picture-updated', handleUpdate);
    };
  }, []);

  // Close the profile dropdown when clicking outside it or pressing Esc
  useEffect(() => {
    function handleClickOutside(e) {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    }
    function handleKey(e) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, []);

  // On phones, close the sliding sidebar whenever the page changes
  useEffect(() => {
    setSidebarOpen(false);
    setMenuOpen(false);
  }, [location.pathname]);

  // Both the profile card at the top of the dropdown and the Settings
  // item go here - the Settings page opens on the My Profile tab
  function goToSettings() {
    setMenuOpen(false);
    navigate('/settings');
  }

  function handleLogoutClick() {
    setMenuOpen(false);
    setSidebarOpen(false);
    setShowLogoutConfirm(true);
  }

  function confirmLogout() {
    localStorage.clear();
    navigate('/login');
  }

  const initials = getInitials(username);

  return (
    <div className="cst-layout">
      <aside className={`cst-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="cst-sidebar-header">
          <div className="cst-logo-circle">
            <img src={logo} alt="Glomax Solar Enterprises" />
          </div>
          <div className="cst-brand-text">
            <p className="cst-logo-title">Glomax Solar</p>
            <p className="cst-logo-subtitle">Enterprises</p>
          </div>
          <button
            type="button"
            className="cst-sidebar-close"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        {canRequest && (
          <div className="cst-sidebar-cta">
            <NavLink to="/new-request" className="cst-new-request-btn">
              <Plus size={16} />
              New Request
            </NavLink>
          </div>
        )}

        <nav className="cst-nav">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="cst-nav-group">
              <p className="cst-nav-label">{group.label}</p>
              {group.items.map(({ to, label, icon: Icon, badge }) => (
                <NavLink key={to} to={to} className="cst-nav-link">
                  <Icon size={17} />
                  <span className="cst-nav-text">{label}</span>
                  {badge && <NavBadge count={navCounts[badge]} />}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      {sidebarOpen && (
        <div className="cst-sidebar-backdrop" onClick={() => setSidebarOpen(false)} />
      )}

      <div className="cst-main">
        <header className="cst-header">
          <button
            type="button"
            className="cst-menu-btn"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>

          <div className="cst-header-badge">Customer Portal</div>

          <div className="cst-header-right">
            <CustomerNotificationBell />
            <div className="cst-profile-area" ref={profileRef}>
              <button
                type="button"
                className={`cst-profile-wrap ${menuOpen ? 'open' : ''}`}
                onClick={() => setMenuOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
              >
                <HeaderAvatar picture={profilePicture} initials={initials} />
                <span className="cst-profile-name">{username}</span>
                <ChevronDown size={14} className="cst-profile-chevron" />
              </button>

              {menuOpen && (
                <div className="cst-profile-menu" role="menu">
                  {/* Profile card - goes to Settings */}
                  <button
                    type="button"
                    className="cst-profile-menu-head"
                    onClick={goToSettings}
                    title="View your profile"
                  >
                    <HeaderAvatar picture={profilePicture} initials={initials} large />
                    <span className="cst-profile-menu-info">
                      <span className="cst-profile-menu-top">
                        <span className="cst-profile-menu-name">{username || 'Customer'}</span>
                        <span className="cst-role-badge">Customer</span>
                      </span>
                      <span className="cst-profile-menu-link">
                        View profile
                        <ArrowRight size={13} />
                      </span>
                    </span>
                  </button>

                  <div className="cst-profile-menu-items">
                    <p className="cst-profile-menu-label">Account</p>
                    <button type="button" className="cst-menu-item" onClick={goToSettings} role="menuitem">
                      <span className="cst-menu-item-icon">
                        <Settings size={15} />
                      </span>
                      <span className="cst-menu-item-text">
                        <span className="cst-menu-item-title">Settings</span>
                        <span className="cst-menu-item-hint">Profile, password, notifications</span>
                      </span>
                    </button>
                  </div>

                  <div className="cst-profile-menu-footer">
                    <button
                      type="button"
                      className="cst-menu-item danger"
                      onClick={handleLogoutClick}
                      role="menuitem"
                    >
                      <span className="cst-menu-item-icon">
                        <LogOut size={15} />
                      </span>
                      <span className="cst-menu-item-text">
                        <span className="cst-menu-item-title">Sign Out</span>
                      </span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="cst-content">
          {(pageTitle || pageSubtitle) && (
            <div className="cst-page-heading">
              {pageTitle && <h1>{pageTitle}</h1>}
              {pageSubtitle && <p>{pageSubtitle}</p>}
            </div>
          )}
          {children}
        </main>
      </div>

      {showLogoutConfirm && (
        <div className="cst-modal-overlay" onClick={() => setShowLogoutConfirm(false)}>
          <div className="cst-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cst-modal-icon">
              <LogOut size={22} />
            </div>
            <h3>Sign Out?</h3>
            <p>Are you sure you want to sign out of your account?</p>
            <div className="cst-modal-actions">
              <button className="cst-btn-secondary" onClick={() => setShowLogoutConfirm(false)}>
                Cancel
              </button>
              <button className="cst-btn-danger" onClick={confirmLogout}>
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}