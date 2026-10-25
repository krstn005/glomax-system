import { useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Inbox,
  History,
  Star,
  Settings,
  LogOut,
  ChevronDown,
  ArrowRight,
  CalendarDays,
  Menu,
  X,
} from 'lucide-react';
import logo from '../../../assets/images/logo.jpg';
import apiClient from '../../../api/client';
import { toMediaUrl } from '../../../utils/mediaUrl';
import PINotificationBell from './PINotificationBell';
import '../styles/pi-layout.css';

const NAV_GROUPS = [
  {
    label: 'Overview',
    items: [{ to: '/partner-installer/dashboard', label: 'Dashboard', icon: LayoutDashboard }],
  },
  {
    label: 'My Work',
    items: [
      { to: '/partner-installer/incoming-tickets', label: 'Incoming Tickets', icon: Inbox },
      { to: '/partner-installer/calendar', label: 'Calendar', icon: CalendarDays },
      { to: '/partner-installer/ticket-history', label: 'Ticket History', icon: History },
    ],
  },
  {
    label: 'Performance',
    items: [{ to: '/partner-installer/my-ratings', label: 'My Ratings', icon: Star }],
  },
];

// Keeps a link like /partner-installer/incoming-tickets highlighted on
// its detail pages too (/partner-installer/incoming-tickets/42).
function isActive(pathname, to) {
  if (pathname === to) return true;
  return pathname.startsWith(to + '/');
}

// Shows the profile photo if there is one, otherwise the initials.
// If the photo link is broken, it falls back to the initials too.
function AvatarCircle({ initials, picture, large = false }) {
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    setBroken(false);
  }, [picture]);

  return (
    <div className={`pi-avatar ${large ? 'pi-avatar-lg' : ''}`}>
      {picture && !broken ? (
        <img src={picture} alt="" className="pi-avatar-img" onError={() => setBroken(true)} />
      ) : (
        initials
      )}
    </div>
  );
}

export default function PILayout({ children, pageTitle, pageSubtitle }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [username, setUsername] = useState(localStorage.getItem('username') || 'Partner Installer');
  const [picture, setPicture] = useState(localStorage.getItem('profilePicture') || null);
  const profileRef = useRef(null);
  const initials = username.slice(0, 2).toUpperCase();

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

  // On phones, close the sliding sidebar and the dropdown when the page changes
  useEffect(() => {
    setSidebarOpen(false);
    setMenuOpen(false);
  }, [location.pathname]);

  // Load the real name and photo. Settings sends 'profile-picture-updated'
  // after a save, so the header updates right away without a reload.
  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      try {
        const res = await apiClient.get('/accounts/me/');
        if (cancelled) return;
        if (res.data.username) {
          localStorage.setItem('username', res.data.username);
          setUsername(res.data.username);
        }
        const url = toMediaUrl(res.data.profile_picture);
        setPicture(url);
        if (url) {
          localStorage.setItem('profilePicture', url);
        } else {
          localStorage.removeItem('profilePicture');
        }
      } catch {
        // Keep whatever we already have - the initials still work.
      }
    }

    loadProfile();

    function handleProfileUpdate() {
      loadProfile();
    }
    window.addEventListener('profile-picture-updated', handleProfileUpdate);
    return () => {
      cancelled = true;
      window.removeEventListener('profile-picture-updated', handleProfileUpdate);
    };
  }, []);

  function goToSettings() {
    setMenuOpen(false);
    navigate('/partner-installer/settings');
  }

  function handleSignOutClick() {
    setMenuOpen(false);
    setSidebarOpen(false);
    setShowSignOutConfirm(true);
  }

  function confirmSignOut() {
    localStorage.clear();
    navigate('/partner-installer-login');
  }

  return (
    <div className="pi-layout">
      <aside className={`pi-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="pi-sidebar-brand">
          <div className="pi-logo-circle">
            <img src={logo} alt="Glomax Solar Enterprises" />
          </div>
          <div className="pi-brand-text">
            <p className="pi-brand-title">Glomax Solar</p>
            <p className="pi-brand-subtitle">Enterprises</p>
          </div>
          <button
            type="button"
            className="pi-sidebar-close"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="pi-nav">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="pi-nav-group">
              <p className="pi-nav-label">{group.label}</p>
              {group.items.map(({ to, label, icon: Icon }) => (
                <Link
                  key={to}
                  to={to}
                  className={`pi-nav-link ${isActive(location.pathname, to) ? 'active' : ''}`}
                >
                  <Icon size={17} />
                  <span>{label}</span>
                </Link>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      {sidebarOpen && <div className="pi-sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}

      <div className="pi-main">
        <header className="pi-header">
          <button
            type="button"
            className="pi-menu-btn"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>

          <span className="pi-portal-pill">Partner Installer Portal</span>

          <div className="pi-header-right">
            <PINotificationBell />
            <div className="pi-profile-area" ref={profileRef}>
              <button
                type="button"
                className={`pi-profile-btn ${menuOpen ? 'open' : ''}`}
                onClick={() => setMenuOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
              >
                <AvatarCircle initials={initials} picture={picture} />
                <span className="pi-username">{username}</span>
                <ChevronDown size={14} className="pi-chevron" />
              </button>

              {menuOpen && (
                <div className="pi-profile-menu" role="menu">
                  {/* Profile card - goes to Settings */}
                  <button
                    type="button"
                    className="pi-profile-menu-head"
                    onClick={goToSettings}
                    title="View your profile"
                  >
                    <AvatarCircle initials={initials} picture={picture} large />
                    <span className="pi-profile-menu-info">
                      <span className="pi-profile-menu-name">{username}</span>
                      <span className="pi-role-badge">Partner Installer</span>
                      <span className="pi-profile-menu-link">
                        View profile
                        <ArrowRight size={13} />
                      </span>
                    </span>
                  </button>

                  <div className="pi-profile-menu-items">
                    <p className="pi-profile-menu-label">Account</p>
                    <button type="button" className="pi-menu-item" onClick={goToSettings} role="menuitem">
                      <span className="pi-menu-item-icon">
                        <Settings size={15} />
                      </span>
                      <span className="pi-menu-item-text">
                        <span className="pi-menu-item-title">Settings</span>
                        <span className="pi-menu-item-hint">Profile, password, notifications</span>
                      </span>
                    </button>
                  </div>

                  <div className="pi-profile-menu-footer">
                    <button
                      type="button"
                      className="pi-menu-item danger"
                      onClick={handleSignOutClick}
                      role="menuitem"
                    >
                      <span className="pi-menu-item-icon">
                        <LogOut size={15} />
                      </span>
                      <span className="pi-menu-item-text">
                        <span className="pi-menu-item-title">Sign Out</span>
                      </span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="pi-content">
          {pageTitle && (
            <div className="pi-page-heading">
              <h1>{pageTitle}</h1>
              {pageSubtitle && <p>{pageSubtitle}</p>}
            </div>
          )}
          <div className="pi-page-body">{children}</div>
        </main>
      </div>

      {showSignOutConfirm && (
        <div className="pi-modal-overlay" onClick={() => setShowSignOutConfirm(false)}>
          <div className="pi-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pi-modal-icon">
              <LogOut size={22} />
            </div>
            <h3>Sign Out?</h3>
            <p>Are you sure you want to sign out of your account?</p>
            <div className="pi-modal-actions">
              <button className="pi-btn-secondary" onClick={() => setShowSignOutConfirm(false)}>
                Cancel
              </button>
              <button className="pi-btn-danger" onClick={confirmSignOut}>
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}