import { useEffect, useState, useCallback } from 'react';
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  clearAllNotifications,
} from '../api/notifications';

const POLL_INTERVAL_MS = 20000;

export default function useNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    // Nobody is signed in, so there is nothing to ask the server.
    // This also avoids useless 401 errors in the browser console.
    if (!localStorage.getItem('access_token')) {
      setNotifications([]);
      setLoading(false);
      return;
    }
    try {
      const data = await getNotifications();
      setNotifications(data);
    } catch {
      // Silent failure - a header widget shouldn't show a page-level
      // error banner just because a poll request failed once.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();

    // Check again every 20 seconds, but skip while the tab is hidden.
    const interval = setInterval(() => {
      if (document.visibilityState !== 'hidden') load();
    }, POLL_INTERVAL_MS);

    // Check right away when the user comes back to the tab.
    function onReturn() {
      if (document.visibilityState !== 'hidden') load();
    }
    document.addEventListener('visibilitychange', onReturn);
    window.addEventListener('focus', onReturn);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onReturn);
      window.removeEventListener('focus', onReturn);
    };
  }, [load]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  async function markRead(id) {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    try {
      await markNotificationRead(id);
    } catch {
      load();
    }
  }

  async function markAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    try {
      await markAllNotificationsRead();
    } catch {
      load();
    }
  }

  async function remove(id) {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    try {
      await deleteNotification(id);
    } catch {
      load();
    }
  }

  async function clearAll() {
    setNotifications([]);
    try {
      await clearAllNotifications();
    } catch {
      load();
    }
  }

  return { notifications, unreadCount, loading, markRead, markAllRead, remove, clearAll };
}