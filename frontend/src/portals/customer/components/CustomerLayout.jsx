import { useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, FilePlus, Activity, History, Star, Settings, LogOut, Bell, ChevronDown } from 'lucide-react';
import apiClient from '../../../api/client';
import logo from '../../../assets/images/logo.jpg';
import './customer-layout.css';

const NAV_LINKS = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/new-request', label: 'New Request', icon: FilePlus },
  { to: '/request-status', label: 'Request Status', icon: Activity },
  { to: '/past-requests', label: 'Past Requests', icon: History },
  { to: '/feedback', label: 'Feedback', icon: Star },
];

function AvatarCircle({ pictureUrl, displayName, initials, className = '' }) {
  return pictureUrl ? (
    <img src={pictureUrl} alt={displayName} className={`cst-avatar-img ${className}`} />
  ) : (
    <div className={`cst-avatar ${className}`}>{initials}</div>
  );
}

export default function CustomerLayout({ children, pageTitle, pageSubtitle }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [pictureUrl, setPictureUrl] = useState(null);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const menuRef = useRef(null);

  const displayName = localStorage.getItem('username') || 'Customer';
  const initials = displayName.slice(0, 2).toUpperCase();

  function handleSignOutClick() {
    setMenuOpen(false);
    setShowSignOutConfirm(true);
  }

  function confirmSignOut() {
    localStorage.clear();
    navigate('/login');
  }

  useEffect(() => {
    let cancelled = false;

    async function loadPicture() {
      try {
        const res = await apiClient.get('/accounts/me/');
        if (!cancelled) {
          setPictureUrl(res.data.profile_picture || null);
        }
      } catch {
        // fails silently - just falls back to showing initials
      }
    }

    loadPicture();
    window.addEventListener('profile-picture-updated', loadPicture);

    return () => {
      cancelled = true;
      window.removeEventListener('profile-picture-updated', loadPicture);
    };
  }, []);

  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="cst-layout">
      <aside className="cst-sidebar">
        <div className="cst-sidebar-brand">
          <img src={logo} alt="Glomax Solar Enterprises" className="cst-sidebar-logo" />
          <span>Glomax Solar<br />Enterprises</span>
        </div>

        <nav className="cst-nav">
          <p className="cst-nav-label">Overview</p>
          {NAV_LINKS.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className={`cst-nav-link ${location.pathname === to ? 'active' : ''}`}
            >
              <Icon size={16} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
      </aside>

      <div className="cst-main">
        <header className="cst-header">
          <span className="cst-portal-pill">Customer Portal</span>
          <div className="cst-header-right" ref={menuRef}>
            <button className="cst-bell"><Bell size={16} /></button>

            <button className="cst-profile-btn" onClick={() => setMenuOpen((v) => !v)}>
              <AvatarCircle pictureUrl={pictureUrl} displayName={displayName} initials={initials} />
              <span className="cst-username">{displayName}</span>
              <ChevronDown size={14} className={`cst-chevron ${menuOpen ? 'open' : ''}`} />
            </button>

            {menuOpen && (
              <div className="cst-profile-menu">
                <div className="cst-profile-menu-header">
                  <AvatarCircle
                    pictureUrl={pictureUrl}
                    displayName={displayName}
                    initials={initials}
                    className="cst-avatar-lg"
                  />
                  <span>{displayName}</span>
                </div>
                <Link
                  to="/settings"
                  className="cst-profile-menu-item"
                  onClick={() => setMenuOpen(false)}
                >
                  <Settings size={16} />
                  Settings
                </Link>
                <button className="cst-profile-menu-item cst-profile-menu-signout" onClick={handleSignOutClick}>
                  <LogOut size={16} />
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </header>

        <main className="cst-content">
          {pageTitle && (
            <div className="cst-page-heading">
              <h1>{pageTitle}</h1>
              {pageSubtitle && <p>{pageSubtitle}</p>}
            </div>
          )}
          {children}
        </main>
      </div>

      {showSignOutConfirm && (
        <div className="cst-modal-overlay" onClick={() => setShowSignOutConfirm(false)}>
          <div className="cst-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Sign Out?</h3>
            <p>Are you sure you want to sign out of your account?</p>
            <div className="cst-modal-actions">
              <button className="cst-btn-secondary" onClick={() => setShowSignOutConfirm(false)}>
                Cancel
              </button>
              <button className="cst-btn-danger" onClick={confirmSignOut}>
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}