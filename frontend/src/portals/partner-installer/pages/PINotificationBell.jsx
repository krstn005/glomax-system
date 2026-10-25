import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import useNotifications from '../../../hooks/useNotifications';
import '../styles/pi-notifications.css';

export default function PINotificationBell() {
  const navigate = useNavigate();
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function handleClick(n) {
    if (!n.is_read) markRead(n.id);
    setOpen(false);
    if (n.link) navigate(n.link);
  }

  return (
    <div className="pi-notif-wrap" ref={wrapRef}>
      <button className="pi-bell" type="button" onClick={() => setOpen((v) => !v)}>
        <Bell size={16} />
        {unreadCount > 0 && <span className="pi-notif-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
      </button>

      {open && (
        <div className="pi-notif-dropdown">
          <div className="pi-notif-header">
            <h4>Notifications</h4>
            {unreadCount > 0 && (
              <button className="pi-notif-mark-all" onClick={markAllRead}>
                Mark all as read
              </button>
            )}
          </div>
          <div className="pi-notif-list">
            {notifications.length === 0 ? (
              <p className="pi-notif-empty">No notifications yet.</p>
            ) : (
              notifications.slice(0, 15).map((n) => (
                <button
                  key={n.id}
                  className={`pi-notif-item ${!n.is_read ? 'unread' : ''}`}
                  onClick={() => handleClick(n)}
                >
                  <p className="pi-notif-item-message">{n.message}</p>
                  <p className="pi-notif-item-date">
                    {new Date(n.created_at).toLocaleString()}
                  </p>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}