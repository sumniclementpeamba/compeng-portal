import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '../context/NotificationContext';

const KIND_ICON = {
  announcement: '📣',
  resource_approved: '✅',
  resource_rejected: '❌',
  role_changed: '👤',
};

function relativeTime(iso) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function NotificationBell() {
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  function openNotification(n) {
    if (!n.is_read) markRead(n.id);
    setOpen(false);
    if (n.link) navigate(n.link);
  }

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={`Notifications${unreadCount ? ` (${unreadCount} unread)` : ''}`}
        style={{
          position: 'relative',
          width: 34, height: 34,
          borderRadius: 8,
          background: open ? 'rgba(255,255,255,0.12)' : 'transparent',
          border: '1px solid rgba(255,255,255,0.1)',
          color: '#fff', cursor: 'pointer',
          display: 'grid', placeItems: 'center',
          fontSize: 16,
        }}
      >
        🔔
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: -4, right: -4,
            minWidth: 16, height: 16, padding: '0 4px',
            borderRadius: 999, background: '#dc2626',
            color: '#fff', fontSize: 10, fontWeight: 700,
            display: 'grid', placeItems: 'center',
            border: '2px solid var(--slate-900)',
          }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="animate-scale-in"
          style={{
            position: 'absolute', top: 44, right: 0,
            width: 360, maxWidth: '90vw',
            background: '#fff', color: 'var(--text)',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-lg)',
            overflow: 'hidden',
            zIndex: 9998,
          }}
        >
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', padding: '12px 16px',
            borderBottom: '1px solid var(--border)',
          }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Notifications</div>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                style={{
                  background: 'transparent', border: 'none',
                  color: 'var(--brand)', fontSize: 12, cursor: 'pointer',
                  fontWeight: 500, padding: 0,
                }}
              >
                Mark all read
              </button>
            )}
          </div>

          <div style={{ maxHeight: 420, overflowY: 'auto' }}>
            {notifications.length === 0 ? (
              <div style={{
                padding: 36, textAlign: 'center',
                color: 'var(--text-muted)', fontSize: 13,
              }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>🔕</div>
                No notifications yet.
              </div>
            ) : (
              notifications.slice(0, 20).map((n) => (
                <button
                  key={n.id}
                  onClick={() => openNotification(n)}
                  style={{
                    display: 'block', width: '100%',
                    padding: '12px 16px',
                    borderBottom: '1px solid var(--border)',
                    background: n.is_read ? '#fff' : '#f0f9ff',
                    border: 'none', textAlign: 'left',
                    cursor: 'pointer', font: 'inherit',
                  }}
                >
                  <div style={{ display: 'flex', gap: 10 }}>
                    <div style={{ fontSize: 20, flexShrink: 0 }}>
                      {KIND_ICON[n.kind] || '•'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 13, fontWeight: n.is_read ? 500 : 600,
                        color: 'var(--text)', lineHeight: 1.4,
                      }}>
                        {n.title}
                      </div>
                      {n.body && (
                        <div style={{
                          fontSize: 12, color: 'var(--text-muted)',
                          marginTop: 3,
                          display: '-webkit-box',
                          WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                          overflow: 'hidden', lineHeight: 1.4,
                        }}>
                          {n.body}
                        </div>
                      )}
                      <div style={{
                        fontSize: 11, color: 'var(--text-muted)',
                        marginTop: 4,
                      }}>
                        {n.actor_name && `${n.actor_name} · `}
                        {relativeTime(n.created_at)}
                      </div>
                    </div>
                    {!n.is_read && (
                      <div style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: 'var(--brand)', flexShrink: 0,
                        marginTop: 6,
                      }} />
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
} 