import { createContext, useContext, useEffect, useState } from 'react';
import { api, getToken } from '../api/client';
import { useAuth } from './AuthContext';

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [toasts, setToasts] = useState([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      setToasts([]);
      return;
    }
    api.get('/notifications/unread-count/')
      .then((d) => setUnreadCount(d.count || 0))
      .catch(() => {});
    api.get('/notifications/')
      .then((d) => setNotifications(d.results || []))
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const token = getToken();
    if (!token) return;

    let es = null;
    let reconnectTimer = null;
    let cancelled = false;

    function connect() {
      if (cancelled) return;
      try {
        es = new EventSource(`/api/notifications/stream/?token=${token}`);
        es.onopen = () => setConnected(true);
        es.onmessage = (e) => {
          try {
            const n = JSON.parse(e.data);
            setNotifications((prev) => {
              if (prev.some((x) => x.id === n.id)) return prev;
              return [n, ...prev].slice(0, 60);
            });
            setUnreadCount((c) => c + 1);
            pushToast(n);
          } catch {}
        };
        es.onerror = () => {
          setConnected(false);
          if (es) es.close();
          reconnectTimer = setTimeout(connect, 5000);
        };
      } catch {
        setConnected(false);
        reconnectTimer = setTimeout(connect, 5000);
      }
    }

    connect();
    return () => {
      cancelled = true;
      if (es) es.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const id = setInterval(() => {
      api.get('/notifications/unread-count/')
        .then((d) => setUnreadCount(d.count || 0))
        .catch(() => {});
    }, 15000);
    return () => clearInterval(id);
  }, [user]);

  function pushToast(n) {
    const toastId = `${n.id}-${Date.now()}`;
    setToasts((t) => [...t, { ...n, _toastId: toastId }]);
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x._toastId !== toastId));
    }, 6000);
  }

  function dismissToast(toastId) {
    setToasts((t) => t.filter((x) => x._toastId !== toastId));
  }

  async function markRead(id) {
    const target = notifications.find((n) => n.id === id);
    if (target?.is_read) return;
    setNotifications((list) =>
      list.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
    setUnreadCount((c) => Math.max(0, c - 1));
    try { await api.post(`/notifications/${id}/read/`); } catch {}
  }

  async function markAllRead() {
    setNotifications((list) => list.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
    try { await api.post('/notifications/read-all/'); } catch {}
  }

  return (
    <NotificationContext.Provider
      value={{
        notifications, unreadCount, toasts, connected,
        markRead, markAllRead, dismissToast,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be inside NotificationProvider');
  return ctx;
} 