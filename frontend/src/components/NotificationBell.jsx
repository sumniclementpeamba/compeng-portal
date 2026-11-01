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

function BellIcon({ size = 22, color = '#fbbf24' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ display: 'block' }}
    >
      <path
        d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"
        fill={color}
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M13.73 21a2 2 0 0 1-3.46 0"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function NotificationBell() {
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  function openNotification(n) {
    if (!n.is_read) markRead(n.id);
    setOpen(false);
    if (n.link) navigate(n.link);
  }

  return (
    <div
      ref={ref}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        flexShrink: 0,
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        aria-label={`Notifications${unreadCount ? ` (${unreadCount} unread)` : ''}`}
        aria-haspopup="true"
        aria-expanded={open}
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'transparent',
          border: 'none',
          outline: 'none',
          padding: 4,
          margin: 0,
          cursor: 'pointer',
          color: '#fbbf24',
          borderRadius: 6,
          transition: 'transform 120ms ease, opacity 120ms ease',
          transform: hover || open ? 'scale(1.08)' : 'scale(1)',
          opacity: hover || open ? 1 : 0.85,
        }}
      >
        <BellIcon size={22} color="#fbbf24" />

        {unreadCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              minWidth: 16,
              height: 16,
              padding: '0 4px',
              borderRadius: 999,
              background: '#dc2626',
              color: '#fff',
              fontSize: 10,
              fontWeight: 700,
              display: 'grid',
              placeItems: 'center',
              border: '2px solid var(--slate-900)',
              lineHeight: 1,
              pointerEvents: 'none',
            }}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="notif-panel animate-scale-in">
          <div className="notif-panel-header">
            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>
              Notifications
            </div>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--brand)',
                  fontSize: 12,
                  cursor: 'pointer',
                  fontWeight: 500,
                  padding: 0,
                }}
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="notif-panel-list">
            {notifications.length === 0 ? (
              <div className="notif-panel-empty">
                <div style={{ fontSize: 32, marginBottom: 8 }}>🔕</div>
                No notifications yet.
              </div>
            ) : (
              notifications.slice(0, 20).map((n) => (
                <button
                  key={n.id}
                  onClick={() => openNotification(n)}
                  className={`notif-item${n.is_read ? '' : ' unread'}`}
                >
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <div style={{ fontSize: 20, flexShrink: 0, lineHeight: 1 }}>
                      {KIND_ICON[n.kind] || '•'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: n.is_read ? 500 : 600,
                          color: 'var(--text)',
                          lineHeight: 1.4,
                          overflowWrap: 'anywhere',
                        }}
                      >
                        {n.title}
                      </div>
                      {n.body && (
                        <div
                          style={{
                            fontSize: 12,
                            color: 'var(--text-muted)',
                            marginTop: 3,
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                            lineHeight: 1.4,
                            overflowWrap: 'anywhere',
                          }}
                        >
                          {n.body}
                        </div>
                      )}
                      <div
                        style={{
                          fontSize: 11,
                          color: 'var(--text-muted)',
                          marginTop: 4,
                        }}
                      >
                        {n.actor_name && `${n.actor_name} · `}
                        {relativeTime(n.created_at)}
                      </div>
                    </div>
                    {!n.is_read && (
                      <div
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: 'var(--brand)',
                          flexShrink: 0,
                          marginTop: 6,
                        }}
                      />
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