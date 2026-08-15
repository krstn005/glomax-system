import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, FilePlus, Activity, History, Star, Settings, LogOut, Bell } from 'lucide-react';
import './customer-layout.css';
import logo from '../../../assets/images/logo.jpg';

const NAV_LINKS = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/new-request', label: 'New Request', icon: FilePlus },
  { to: '/request-status', label: 'Request Status', icon: Activity },
  { to: '/past-requests', label: 'Past Requests', icon: History },
  { to: '/feedback', label: 'Feedback', icon: Star },
];

export default function CustomerLayout({ children, pageTitle, pageSubtitle }) {
  const location = useLocation();
  const navigate = useNavigate();

 const displayName = localStorage.getItem('username') || 'Customer';
  const initials = displayName.slice(0, 2).toUpperCase();

  const handleSignOut = () => {
    localStorage.clear();
    navigate('/login');
  };

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

          <p className="cst-nav-label">Account</p>
          <Link
            to="/settings"
            className={`cst-nav-link ${location.pathname === '/settings' ? 'active' : ''}`}
          >
            <Settings size={16} />
            <span>Settings</span>
          </Link>
        </nav>

        <div className="cst-sidebar-footer">
          <button className="cst-signout" onClick={handleSignOut}>
            <LogOut size={16} />
            Sign Out
          </button>
        </div>
      </aside>

      <div className="cst-main">
        <header className="cst-header">
          <span className="cst-portal-pill">Customer Portal</span>
          <div className="cst-header-right">
            <button className="cst-bell"><Bell size={16} /></button>
            <div className="cst-avatar">{initials}</div>
            <span className="cst-username">{displayName}</span>
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
    </div>
  );
}