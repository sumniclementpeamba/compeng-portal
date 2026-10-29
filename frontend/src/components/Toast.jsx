import { useNavigate } from 'react-router-dom';
import { useNotifications } from '../context/NotificationContext';

const KIND_ICON = {
  announcement: '📣',
  resource_approved: '✅',
  resource_rejected: '❌',
  role_changed: '👤',
};

export function ToastContainer() {
  const { toasts, dismissToast } = useNotifications();
  const navigate = useNavigate();

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: 20, right: 20,
        zIndex: 10000,
        display: 'grid',
        gap: 8,
        maxWidth: 340,
        pointerEvents: 'none',
      }}
    >
      {toasts.map((t) => (
        <div
          key={t._toastId}
          onClick={() => {
            if (t.link) navigate(t.link);
            dismissToast(t._toastId);
          }}
          className="animate-slide-in"
          style={{
            pointerEvents: 'auto',
            background: '#fff',
            border: '1px solid var(--border)',
            borderLeft: '4px solid var(--brand)',
            borderRadius: 'var(--radius)',
            padding: '12px 14px',
            boxShadow: 'var(--shadow-lg)',
            cursor: 'pointer',
            display: 'flex',
            gap: 10,
            alignItems: 'flex-start',
          }}
        >
          <div style={{ fontSize: 20, flexShrink: 0 }}>
            {KIND_ICON[t.kind] || '•'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 13, fontWeight: 600,
              lineHeight: 1.35, color: 'var(--text)',
            }}>
              {t.title}
            </div>
            {t.body && (
              <div style={{
                fontSize: 12, color: 'var(--text-muted)',
                marginTop: 2,
                overflow: 'hidden',
                display: '-webkit-box',
                WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                lineHeight: 1.4,
              }}>
                {t.body}
              </div>
            )}
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); dismissToast(t._toastId); }}
            style={{
              background: 'transparent', border: 'none',
              color: 'var(--text-muted)', cursor: 'pointer',
              fontSize: 16, lineHeight: 1, padding: 0,
              flexShrink: 0,
            }}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
} 