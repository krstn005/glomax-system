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
  Bell,
  ChevronDown,
} from 'lucide-react';
import logo from '../../../assets/images/logo.jpg';
import '../styles/staff-layout.css';

const NAV_GROUPS = [
  {
    label: 'Overview',
    items: [
      { to: '/staff/dashboard', label: 'Dashboard', icon: LayoutDashboard, enabled: true },
    ],
  },
  {
    label: 'Inquiries & Quotations',
    items: [
      { to: '/staff/email-inquiries', label: 'Email Inquiries', icon: Mail, enabled: true },
      { to: '/staff/quotations', label: 'Quotation Management', icon: FileText, enabled: true },
    ],
  },
  {
    label: 'Ticket Management',
    items: [
      { to: '/staff/manage-tickets', label: 'Ticket Tracking', icon: Activity, enabled: true },
      { to: '/staff/assessment-review', label: 'Assessment Review', icon: ClipboardCheck, enabled: true },
      { to: '/staff/completed-tickets', label: 'Completed Tickets', icon: CheckCircle, enabled: true },
    ],
  },
  {
    label: 'Pricing',
    items: [
      { to: '/staff/active-prices', label: 'Active Prices', icon: DollarSign, enabled: true },
      { to: '/staff/price-history', label: 'Price History', icon: History, enabled: true },
      { to: '/staff/payment-terms-history', label: 'Payment Terms History', icon: Receipt, enabled: true },
    ],
  },
];

function AvatarCircle({ initials, className = '' }) {
  return <div className={`stf-avatar ${className}`}>{initials}</div>;
}

export default function StaffLayout({ children, pageTitle, pageSubtitle }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const menuRef = useRef(null);

  const username = localStorage.getItem('username') || 'Staff';
  const initials = username.slice(0, 2).toUpperCase();

  function handleSignOutClick() {
    setMenuOpen(false);
    setShowSignOutConfirm(true);
  }

  function confirmSignOut() {
    localStorage.clear();
    navigate('/staff-login');
  }

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
    <div className="stf-layout">
      <aside className="stf-sidebar">
        <div className="stf-sidebar-brand">
          <img src={logo} alt="Glomax Solar Enterprises" className="stf-sidebar-logo" />
          <span>Glomax Solar<br />Enterprises</span>
        </div>

        <nav className="stf-nav">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="stf-nav-group">
              <p className="stf-nav-label">{group.label}</p>
              <hr className="stf-nav-divider" />
              {group.items.map(({ to, label, icon: Icon, enabled }) =>
                enabled ? (
                  <Link
                    key={to}
                    to={to}
                    className={`stf-nav-link ${location.pathname === to ? 'active' : ''}`}
                  >
                    <Icon size={16} />
                    <span>{label}</span>
                  </Link>
                ) : (
                  <span key={to} className="stf-nav-link disabled">
                    <Icon size={16} />
                    <span>{label}</span>
                  </span>
                )
              )}
            </div>
          ))}
        </nav>
      </aside>

      <div className="stf-main">
        <header className="stf-header">
          <span className="stf-portal-pill">Staff Portal</span>
          <div className="stf-header-right" ref={menuRef}>
            <button className="stf-bell"><Bell size={16} /></button>

            <button className="stf-profile-btn" onClick={() => setMenuOpen((v) => !v)}>
              <AvatarCircle initials={initials} />
              <span className="stf-username">{username}</span>
              <ChevronDown size={14} className={`stf-chevron ${menuOpen ? 'open' : ''}`} />
            </button>

            {menuOpen && (
              <div className="stf-profile-menu">
                <div className="stf-profile-menu-header">
                  <AvatarCircle initials={initials} className="stf-avatar-lg" />
                  <span>{username}</span>
                </div>
                <Link
                  to="/staff/settings"
                  className="stf-profile-menu-item"
                  onClick={() => setMenuOpen(false)}
                >
                  <Settings size={16} />
                  Settings
                </Link>
                <button className="stf-profile-menu-item stf-profile-menu-signout" onClick={handleSignOutClick}>
                  <LogOut size={16} />
                  Sign Out
                </button>
              </div>
            )}
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