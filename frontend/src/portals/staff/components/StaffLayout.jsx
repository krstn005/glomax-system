import { useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Mail,
  FileText,
  Activity,
  ClipboardCheck,
  CheckCircle,
  DollarSign,
  History,
  Receipt,
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
import '../styles/staff-layout.css';
import StaffNotificationBell from './StaffNotificationBell';

const NAV_GROUPS = [
  {
    label: 'Overview',
    items: [
      { to: '/staff/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    ],
  },
  {
    label: 'Inquiries & Quotations',
    items: [
      { to: '/staff/email-inquiries', label: 'Email Inquiries', icon: Mail },
      { to: '/staff/quotation-management', label: 'Quotation Management', icon: FileText },
    ],
  },
  {
    label: 'Ticket Management',
    items: [
      { to: '/staff/manage-tickets', label: 'Ticket Tracking', icon: Activity },
      { to: '/staff/assessment-review', label: 'Assessment Review', icon: ClipboardCheck },
      { to: '/staff/completed-tickets', label: 'Completed Tickets', icon: CheckCircle },
      { to: '/staff/calendar', label: 'Calendar', icon: CalendarDays },
    ],
  },
  {
    label: 'Pricing',
    items: [
      { to: '/staff/active-prices', label: 'Active Prices', icon: DollarSign },
      { to: '/staff/price-history', label: 'Price History', icon: History },
      { to: '/staff/payment-terms-history', label: 'Payment Terms History', icon: Receipt },
    ],
  },
];

// Shows the profile photo if there is one, otherwise the initials.
// If the photo link is broken, it falls back to the initials too.
function AvatarCircle({ initials, picture, large = false }) {
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    setBroken(false);
  }, [picture]);

  return (
    <div className={`stf-avatar ${large ? 'stf-avatar-lg' : ''}`}>
      {picture && !broken ? (
        <img src={picture} alt="" className="stf-avatar-img" onError={() => setBroken(true)} />
      ) : (
        initials
      )}
    </div>
  );
}

// Keeps a link like /staff/manage-tickets highlighted on its detail
// pages too (/staff/manage-tickets/42), without matching unrelated
// routes that just start with the same letters.
function isActive(pathname, to) {
  if (pathname === to) return true;
  return pathname.startsWith(to + '/');
}

export default function StaffLayout({ children, pageTitle, pageSubtitle }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [username, setUsername] = useState(localStorage.getItem('username') || 'Staff');
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

  // Load the real photo from the backend when the layout opens. The saved
  // copy in localStorage is shown first so the header doesn't flash "ST".
  useEffect(() => {
    let cancelled = false;
    async function loadProfilePicture() {
      try {
        const res = await apiClient.get('/accounts/me/');
        if (cancelled) return;
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
    loadProfilePicture();
    return () => {
      cancelled = true;
    };
  }, []);

  // Settings saves the new name and photo to localStorage and sends
  // this event, so the header updates right away without a reload.
  useEffect(() => {
    function handleProfileUpdate() {
      setUsername(localStorage.getItem('username') || 'Staff');
      setPicture(localStorage.getItem('profilePicture') || null);
    }
    window.addEventListener('profile-picture-updated', handleProfileUpdate);
    return () => window.removeEventListener('profile-picture-updated', handleProfileUpdate);
  }, []);

  function goToSettings() {
    setMenuOpen(false);
    navigate('/staff/settings');
  }

  function handleSignOutClick() {
    setMenuOpen(false);
    setSidebarOpen(false);
    setShowSignOutConfirm(true);
  }

  function confirmSignOut() {
    localStorage.clear();
    navigate('/staff-login');
  }

  return (
    <div className="stf-layout">
      <aside className={`stf-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="stf-sidebar-brand">
          <div className="stf-logo-circle">
            <img src={logo} alt="Glomax Solar Enterprises" />
          </div>
          <div className="stf-brand-text">
            <p className="stf-brand-title">Glomax Solar</p>
            <p className="stf-brand-subtitle">Enterprises</p>
          </div>
          <button
            type="button"
            className="stf-sidebar-close"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="stf-nav">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="stf-nav-group">
              <p className="stf-nav-label">{group.label}</p>
              {group.items.map(({ to, label, icon: Icon }) => (
                <Link
                  key={to}
                  to={to}
                  className={`stf-nav-link ${isActive(location.pathname, to) ? 'active' : ''}`}
                >
                  <Icon size={17} />
                  <span>{label}</span>
                </Link>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      {sidebarOpen && <div className="stf-sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}

      <div className="stf-main">
        <header className="stf-header">
          <button
            type="button"
            className="stf-menu-btn"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>

          <span className="stf-portal-pill">Staff Portal</span>

          <div className="stf-header-right">
            <StaffNotificationBell />
            <div className="stf-profile-area" ref={profileRef}>
              <button
                type="button"
                className={`stf-profile-btn ${menuOpen ? 'open' : ''}`}
                onClick={() => setMenuOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
              >
                <AvatarCircle initials={initials} picture={picture} />
                <span className="stf-username">{username}</span>
                <ChevronDown size={14} className="stf-chevron" />
              </button>

              {menuOpen && (
                <div className="stf-profile-menu" role="menu">
                  {/* Profile card - goes to Settings */}
                  <button
                    type="button"
                    className="stf-profile-menu-head"
                    onClick={goToSettings}
                    title="View your profile"
                  >
                    <AvatarCircle initials={initials} picture={picture} large />
                    <span className="stf-profile-menu-info">
                      <span className="stf-profile-menu-top">
                        <span className="stf-profile-menu-name">{username}</span>
                        <span className="stf-role-badge">Staff</span>
                      </span>
                      <span className="stf-profile-menu-link">
                        View profile
                        <ArrowRight size={13} />
                      </span>
                    </span>
                  </button>

                  <div className="stf-profile-menu-items">
                    <p className="stf-profile-menu-label">Account</p>
                    <button type="button" className="stf-menu-item" onClick={goToSettings} role="menuitem">
                      <span className="stf-menu-item-icon">
                        <Settings size={15} />
                      </span>
                      <span className="stf-menu-item-text">
                        <span className="stf-menu-item-title">Settings</span>
                        <span className="stf-menu-item-hint">Profile, password, notifications</span>
                      </span>
                    </button>
                  </div>

                  <div className="stf-profile-menu-footer">
                    <button
                      type="button"
                      className="stf-menu-item danger"
                      onClick={handleSignOutClick}
                      role="menuitem"
                    >
                      <span className="stf-menu-item-icon">
                        <LogOut size={15} />
                      </span>
                      <span className="stf-menu-item-text">
                        <span className="stf-menu-item-title">Sign Out</span>
                      </span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="stf-content">
          {pageTitle && (
            <div className="stf-page-heading">
              <h1>{pageTitle}</h1>
              {pageSubtitle && <p>{pageSubtitle}</p>}
            </div>
          )}
          <div className="stf-page-body">{children}</div>
        </main>
      </div>

      {showSignOutConfirm && (
        <div className="stf-modal-overlay" onClick={() => setShowSignOutConfirm(false)}>
          <div className="stf-modal" onClick={(e) => e.stopPropagation()}>
            <div className="stf-modal-icon">
              <LogOut size={22} />
            </div>
            <h3>Sign Out?</h3>
            <p>Are you sure you want to sign out of your account?</p>
            <div className="stf-modal-actions">
              <button className="stf-btn-secondary" onClick={() => setShowSignOutConfirm(false)}>
                Cancel
              </button>
              <button className="stf-btn-danger" onClick={confirmSignOut}>
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}