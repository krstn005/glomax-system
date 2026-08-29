import { useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Inbox,
  History,
  Star,
  Settings,
  Bell,
} from 'lucide-react';
import logo from '../../../assets/images/logo.jpg';
import '../styles/pi-layout.css';

const NAV_GROUPS = [
  {
    label: 'Overview',
    items: [
      { to: '/partner-installer/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/partner-installer/incoming-tickets', label: 'Incoming Tickets', icon: Inbox },
      { to: '/partner-installer/ticket-history', label: 'Ticket History', icon: History },
      { to: '/partner-installer/my-ratings', label: 'My Ratings', icon: Star },
    ],
  },
  {
    label: 'Privacy & Account',
    items: [
      { to: '/partner-installer/settings', label: 'Settings', icon: Settings },
    ],
  },
];

// Matches by path prefix (not exact match) so a detail sub-route like
// /partner-installer/incoming-tickets/42 still keeps the "Incoming
// Tickets" sidebar link highlighted, the same fix already used on
// the Staff portal's sidebar.
function isActive(pathname, to) {
  if (pathname === to) return true;
  return pathname.startsWith(to + '/');
}

function AvatarCircle({ initials, className = '' }) {
  return <div className={`pi-avatar ${className}`}>{initials}</div>;
}

export default function PILayout({ children, pageTitle, pageSubtitle }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [username, setUsername] = useState(localStorage.getItem('username') || 'PI User');
  const menuRef = useRef(null);
  const initials = username.slice(0, 2).toUpperCase();

  function handleSignOutClick() {
    setShowSignOutConfirm(true);
  }

  function confirmSignOut() {
    localStorage.clear();
    navigate('/staff-login');
  }

  // Same pattern as Staff's layout: if the Settings page updates the
  // saved name, refresh what's shown here without needing a reload.
  useEffect(() => {
    function handleProfileUpdate() {
      setUsername(localStorage.getItem('username') || 'PI User');
    }
    window.addEventListener('profile-picture-updated', handleProfileUpdate);
    return () => window.removeEventListener('profile-picture-updated', handleProfileUpdate);
  }, []);

  return (
    <div className="pi-layout">
      <header className="pi-topbar">
        <div className="pi-topbar-brand">
          <img src={logo} alt="Glomax Solar Enterprises" className="pi-topbar-logo" />
          <span>Glomax Solar</span>
        </div>
        <Link to="/partner-installer/dashboard" className="pi-topbar-pill">
          Dashboard
        </Link>
        <div className="pi-topbar-right" ref={menuRef}>
          <button className="pi-bell" type="button">
            <Bell size={18} />
            <span className="pi-bell-badge">3</span>
          </button>
          <div className="pi-topbar-profile">
            <AvatarCircle initials={initials} />
            <span className="pi-username">{username}</span>
          </div>
        </div>
      </header>

      <div className="pi-body">
        <aside className="pi-sidebar">
          <nav className="pi-nav">
            {NAV_GROUPS.map((group) => (
              <div key={group.label} className="pi-nav-group">
                <p className="pi-nav-label">{group.label.toUpperCase()}</p>
                {group.items.map(({ to, label, icon: Icon }) => (
                  <Link
                    key={to}
                    to={to}
                    className={`pi-nav-link ${isActive(location.pathname, to) ? 'active' : ''}`}
                  >
                    <Icon size={16} />
                    <span>{label}</span>
                  </Link>
                ))}
              </div>
            ))}
          </nav>
          <button className="pi-signout" onClick={handleSignOutClick}>
            Sign Out
          </button>
        </aside>

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