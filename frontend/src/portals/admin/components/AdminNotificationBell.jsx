import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  BellOff,
  X,
  CheckCheck,
  CalendarClock,
  ClipboardCheck,
  CheckCircle2,
  XCircle,
  UserCheck,
  Award,
  Star,
  RotateCcw,
  ShieldCheck,
  Mail,
  FileText,
  Inbox,
} from 'lucide-react';
import useNotifications from '../../../hooks/useNotifications';
import '../styles/admin-notifications.css';

const MAX_SHOWN = 15;

// Picks an icon and color from the notification kind.
// Checks for words inside the kind, so new kinds still get a sensible look.
function getKindStyle(kind) {
  const k = (kind || '').toUpperCase();
  if (k.includes('RESCHEDULE')) return { icon: CalendarClock, tone: 'amber' };
  if (k.includes('REVISION') || k.includes('RETURN')) return { icon: RotateCcw, tone: 'amber' };
  if (k.includes('NOT_COMPATIBLE') || k.includes('NC_')) return { icon: XCircle, tone: 'red' };
  if (k.includes('COMPLET')) return { icon: Award, tone: 'gold' };
  if (k.includes('APPROV')) return { icon: CheckCircle2, tone: 'green' };
  if (k.includes('FORWARD') || k.includes('ADMIN')) return { icon: ShieldCheck, tone: 'indigo' };
  if (k.includes('ASSESSMENT')) return { icon: ClipboardCheck, tone: 'blue' };
  if (k.includes('ASSIGN')) return { icon: UserCheck, tone: 'navy' };
  if (k.includes('REQUEST') || k.includes('SUBMIT')) return { icon: Inbox, tone: 'navy' };
  if (k.includes('FEEDBACK')) return { icon: Star, tone: 'amber' };
  if (k.includes('INQUIR') || k.includes('REPLY') || k.includes('EMAIL')) return { icon: Mail, tone: 'blue' };
  if (k.includes('QUOTATION')) return { icon: FileText, tone: 'navy' };
  return { icon: Bell, tone: 'navy' };
}

// "Just now", "5 min ago", "2 hr ago", "Yesterday", "3 days ago", or a date
function timeAgo(value) {
  if (!value) return '';
  const then = new Date(value);
  const diffSec = Math.floor((Date.now() - then.getTime()) / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return 'Yesterday';
  if (diffDay < 7) return `${diffDay} days ago`;
  return then.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fullDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function AdminNotificationBell() {
  const navigate = useNavigate();
  const { notifications, unreadCount, markRead, markAllRead, remove, clearAll } = useNotifications();
  const [open, setOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const wrapRef = useRef(null);

  // Close when clicking outside or pressing Esc
  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    function handleKey(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, []);

  // Reset the "Clear all?" question every time the menu closes
  useEffect(() => {
    if (!open) setConfirmClear(false);
  }, [open]);

  function handleClick(n) {
    if (!n.is_read) markRead(n.id);
    setOpen(false);
    if (n.link) navigate(n.link);
  }

  function handleDelete(e, id) {
    e.stopPropagation();
    remove(id);
  }

  function handleClearAll() {
    clearAll();
    setConfirmClear(false);
  }

  const shown = notifications.slice(0, MAX_SHOWN);

  return (
    <div className="adm-notif-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`adm-bell ${open ? 'open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Bell size={17} />
        {unreadCount > 0 && <span className="adm-notif-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
      </button>

      {open && (
        <div className="adm-notif-dropdown" role="menu">
          <div className="adm-notif-header">
            <div className="adm-notif-title">
              <h4>Notifications</h4>
              {unreadCount > 0 && <span className="adm-notif-count">{unreadCount} new</span>}
            </div>

            {notifications.length > 0 && (
              <div className="adm-notif-header-actions">
                {confirmClear ? (
                  <span className="adm-notif-confirm">
                    Clear all?
                    <button type="button" className="adm-notif-confirm-yes" onClick={handleClearAll}>
                      Yes
                    </button>
                    <button type="button" className="adm-notif-confirm-no" onClick={() => setConfirmClear(false)}>
                      No
                    </button>
                  </span>
                ) : (
                  <>
                    {unreadCount > 0 && (
                      <button type="button" className="adm-notif-action" onClick={markAllRead} title="Mark all as read">
                        <CheckCheck size={14} />
                        Mark all read
                      </button>
                    )}
                    <button type="button" className="adm-notif-action danger" onClick={() => setConfirmClear(true)}>
                      Clear all
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="adm-notif-list">
            {notifications.length === 0 ? (
              <div className="adm-notif-empty">
                <span className="adm-notif-empty-badge">
                  <BellOff size={22} />
                </span>
                <p className="adm-notif-empty-title">You're all caught up</p>
                <p className="adm-notif-empty-hint">New requests and approvals will show up here.</p>
              </div>
            ) : (
              shown.map((n) => {
                const { icon: Icon, tone } = getKindStyle(n.kind);
                return (
                  <div key={n.id} className={`adm-notif-item ${!n.is_read ? 'unread' : ''}`}>
                    <button type="button" className="adm-notif-item-main" onClick={() => handleClick(n)}>
                      <span className={`adm-notif-icon tone-${tone}`}>
                        <Icon size={16} />
                      </span>
                      <span className="adm-notif-item-text">
                        <span className="adm-notif-item-message">{n.message}</span>
                        <span className="adm-notif-item-date" title={fullDate(n.created_at)}>
                          {timeAgo(n.created_at)}
                        </span>
                      </span>
                      {!n.is_read && <span className="adm-notif-unread-dot" aria-label="Unread" />}
                    </button>
                    <button
                      type="button"
                      className="adm-notif-delete"
                      onClick={(e) => handleDelete(e, n.id)}
                      title="Delete this notification"
                      aria-label="Delete this notification"
                    >
                      <X size={14} />
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {notifications.length > MAX_SHOWN && (
            <p className="adm-notif-footer">Showing the latest {MAX_SHOWN} of {notifications.length}</p>
          )}
        </div>
      )}
    </div>
  );
}