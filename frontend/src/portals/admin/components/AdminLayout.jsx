import { useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Inbox,
  CheckCircle,
  Users,
  Receipt,
  DollarSign,
  ListChecks,
  BarChart3,
  Star,
  Settings,
  LogOut,
  ChevronDown,
  ArrowRight,
  Menu,
  X,
} from 'lucide-react';
import logo from '../../../assets/images/logo.jpg';
import apiClient from '../../../api/client';
import { toMediaUrl } from '../../../utils/mediaUrl';
import AdminNotificationBell from './AdminNotificationBell';
// Kept in case some Admin pages still use Staff classes (like stf-btn-secondary)
import '../../staff/styles/staff-layout.css';
import '../styles/admin-layout.css';

const NAV_GROUPS = [
  {
    label: 'Overview',
    items: [{ to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard }],
  },
  {
    label: 'Tickets',
    items: [
      { to: '/admin/requests', label: 'Requests', icon: Inbox },
      { to: '/admin/completed-tickets', label: 'Completed Tickets', icon: CheckCircle },
    ],
  },
  {
    label: 'People',
    items: [
      { to: '/admin/workers', label: 'Workers', icon: Users },
      { to: '/admin/customers-log', label: 'All Customers Log', icon: ListChecks },
    ],
  },
  {
    label: 'Pricing',
    items: [
      { to: '/admin/price-history', label: 'Prices', icon: DollarSign },
      { to: '/admin/payment-terms-history', label: 'Payment Terms History', icon: Receipt },
    ],
  },
  {
    label: 'Reports',
    items: [
      { to: '/admin/reports', label: 'Reports & Analytics', icon: BarChart3 },
      { to: '/admin/customer-feedback', label: 'Customer Feedback', icon: Star },
    ],
  },
];

// Keeps a link highlighted on its detail pages too (/admin/requests/42)
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
    <div className={`adm-avatar ${large ? 'adm-avatar-lg' : ''}`}>
      {picture && !broken ? (
        <img src={picture} alt="" className="adm-avatar-img" onError={() => setBroken(true)} />
      ) : (
        initials
      )}
    </div>
  );
}

export default function AdminLayout({ children, pageTitle, pageSubtitle }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [username, setUsername] = useState(localStorage.getItem('username') || 'Admin');
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
    navigate('/admin/settings');
  }

  function handleSignOutClick() {
    setMenuOpen(false);
    setSidebarOpen(false);
    setShowSignOutConfirm(true);
  }

  function confirmSignOut() {
    localStorage.clear();
    navigate('/admin-login');
  }

  return (
    <div className="adm-layout">
      <aside className={`adm-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="adm-sidebar-brand">
          <div className="adm-logo-circle">
            <img src={logo} alt="Glomax Solar Enterprises" />
          </div>
          <div className="adm-brand-text">
            <p className="adm-brand-title">Glomax Solar</p>
            <p className="adm-brand-subtitle">Enterprises</p>
          </div>
          <button
            type="button"
            className="adm-sidebar-close"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="adm-nav">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="adm-nav-group">
              <p className="adm-nav-label">{group.label}</p>
              {group.items.map(({ to, label, icon: Icon }) => (
                <Link
                  key={to}
                  to={to}
                  className={`adm-nav-link ${isActive(location.pathname, to) ? 'active' : ''}`}
                >
                  <Icon size={17} />
                  <span>{label}</span>
                </Link>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      {sidebarOpen && <div className="adm-sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}

      <div className="adm-main">
        <header className="adm-header">
          <button
            type="button"
            className="adm-menu-btn"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>

          <span className="adm-portal-pill">Admin Portal</span>

          <div className="adm-header-right">
            <AdminNotificationBell />
            <div className="adm-profile-area" ref={profileRef}>
              <button
                type="button"
                className={`adm-profile-btn ${menuOpen ? 'open' : ''}`}
                onClick={() => setMenuOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
              >
                <AvatarCircle initials={initials} picture={picture} />
                <span className="adm-username">{username}</span>
                <ChevronDown size={14} className="adm-chevron" />
              </button>

              {menuOpen && (
                <div className="adm-profile-menu" role="menu">
                  {/* Profile card - goes to Settings */}
                  <button
                    type="button"
                    className="adm-profile-menu-head"
                    onClick={goToSettings}
                    title="View your profile"
                  >
                    <AvatarCircle initials={initials} picture={picture} large />
                    <span className="adm-profile-menu-info">
                      <span className="adm-profile-menu-top">
                        <span className="adm-profile-menu-name">{username}</span>
                        <span className="adm-role-badge">Admin</span>
                      </span>
                      <span className="adm-profile-menu-link">
                        View profile
                        <ArrowRight size={13} />
                      </span>
                    </span>
                  </button>

                  <div className="adm-profile-menu-items">
                    <p className="adm-profile-menu-label">Account</p>
                    <button type="button" className="adm-menu-item" onClick={goToSettings} role="menuitem">
                      <span className="adm-menu-item-icon">
                        <Settings size={15} />
                      </span>
                      <span className="adm-menu-item-text">
                        <span className="adm-menu-item-title">Settings</span>
                        <span className="adm-menu-item-hint">Profile, password, notifications</span>
                      </span>
                    </button>
                  </div>

                  <div className="adm-profile-menu-footer">
                    <button
                      type="button"
                      className="adm-menu-item danger"
                      onClick={handleSignOutClick}
                      role="menuitem"
                    >
                      <span className="adm-menu-item-icon">
                        <LogOut size={15} />
                      </span>
                      <span className="adm-menu-item-text">
                        <span className="adm-menu-item-title">Sign Out</span>
                      </span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="adm-content">
          {pageTitle && (
            <div className="adm-page-heading">
              <h1>{pageTitle}</h1>
              {pageSubtitle && <p>{pageSubtitle}</p>}
            </div>
          )}
          <div className="adm-page-body">{children}</div>
        </main>
      </div>

      {showSignOutConfirm && (
        <div className="adm-modal-overlay" onClick={() => setShowSignOutConfirm(false)}>
          <div className="adm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="adm-modal-icon">
              <LogOut size={22} />
            </div>
            <h3>Sign Out?</h3>
            <p>Are you sure you want to sign out of your account?</p>
            <div className="adm-modal-actions">
              <button className="adm-btn-secondary" onClick={() => setShowSignOutConfirm(false)}>
                Cancel
              </button>
              <button className="adm-btn-danger" onClick={confirmSignOut}>
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}