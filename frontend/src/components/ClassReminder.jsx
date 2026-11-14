import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useClassReminder } from '../hooks/useClassReminder';

const STYLES = `
  @keyframes reminderSlideIn {
    from { opacity: 0; transform: translateY(-20px) scale(0.96); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }
  @keyframes reminderPulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.5); }
    50%      { box-shadow: 0 0 0 8px rgba(34, 197, 94, 0); }
  }
  @media (prefers-reduced-motion: reduce) {
    .class-reminder { animation: none !important; }
  }
`;

export default function ClassReminder() {
  const { user } = useAuth();
  const location = useLocation();
  const enabled = !!user;

  const { reminder, dismiss } = useClassReminder(enabled);

  const [visible, setVisible] = useState(false);
  const [notifiedKey, setNotifiedKey] = useState(null);
  const [canAskNotifications, setCanAskNotifications] = useState(false);

  // Detect whether we could show a browser notification opt-in
  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setCanAskNotifications(false);
      return;
    }
    setCanAskNotifications(Notification.permission === 'default');
  }, []);

  // Show/hide animation trigger
  useEffect(() => {
    if (reminder) setVisible(true);
    else setVisible(false);
  }, [reminder]);

  // Fire a browser notification once per reminder
  useEffect(() => {
    if (!reminder || notifiedKey === reminder.key) return;
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    try {
      const body =
        reminder.kind === 'check_in_open'
          ? `Check-in is open for ${reminder.courseCode}${reminder.room ? ' in ' + reminder.room : ''}`
          : `${reminder.courseCode}${reminder.room ? ' in ' + reminder.room : ''} · starts in ${reminder.minutesUntilStart} min`;

      new Notification('CompEng Portal', {
        body,
        tag: reminder.key,
        icon: '/images2.jpeg',
      });
      setNotifiedKey(reminder.key);
    } catch {
      // ignore
    }
  }, [reminder, notifiedKey]);

  // Don't render on /attendance — the page has its own active check-in banner
  const isOnAttendance = location.pathname === '/attendance';

  if (!reminder || !visible || isOnAttendance) return null;

  const isCheckInOpen = reminder.kind === 'check_in_open';
  const urgent = isCheckInOpen;

  async function requestNotifications() {
    if (!('Notification' in window)) return;
    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        setCanAskNotifications(false);
      }
    } catch {
      // ignore
    }
  }

  return (
    <>
      <style>{STYLES}</style>
      <div
        className="class-reminder"
        role="status"
        aria-live="polite"
        style={{
          position: 'fixed',
          top: 16,
          right: 16,
          zIndex: 8000,
          maxWidth: 360,
          width: 'calc(100vw - 32px)',
          background: '#fff',
          borderRadius: 14,
          boxShadow: '0 16px 40px rgba(15,23,42,0.20), 0 4px 12px rgba(15,23,42,0.10)',
          border: `1px solid ${urgent ? '#bbf7d0' : '#bfdbfe'}`,
          borderLeft: `4px solid ${urgent ? 'var(--success)' : 'var(--brand)'}`,
          padding: '14px 16px',
          display: 'grid',
          gap: 10,
          animation: 'reminderSlideIn 280ms cubic-bezier(0.2, 0.8, 0.2, 1)',
        }}
      >
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10,
            background: urgent ? 'var(--success-bg)' : 'var(--slate-100)',
            color: urgent ? 'var(--success)' : 'var(--brand)',
            display: 'grid', placeItems: 'center',
            fontSize: 16, flexShrink: 0,
            animation: urgent ? 'reminderPulse 1.5s ease-in-out infinite' : undefined,
          }}>
            🔔
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 11, fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: '0.06em',
              color: urgent ? 'var(--success)' : 'var(--brand)',
              marginBottom: 3,
            }}>
              {isCheckInOpen ? 'Check-in open' : 'Upcoming class'}
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.3, overflowWrap: 'anywhere' }}>
              <span style={{ fontFamily: 'var(--font-mono)' }}>{reminder.courseCode}</span>
              {reminder.courseTitle && (
                <span style={{ fontWeight: 500, color: 'var(--slate-600)' }}>
                  {' · '}{reminder.courseTitle}
                </span>
              )}
            </div>
            <div style={{ fontSize: 12, color: 'var(--slate-600)', marginTop: 4 }}>
              {reminder.startTime}–{reminder.endTime}
              {reminder.room && ` · 📍 ${reminder.room}`}
            </div>
            <div style={{
              fontSize: 12, fontWeight: 600,
              color: urgent ? 'var(--success)' : 'var(--slate-700)',
              marginTop: 6, fontVariantNumeric: 'tabular-nums',
            }}>
              {isCheckInOpen
                ? '✓ Act now — check-in window is open'
                : `⏱ Starts in ${reminder.minutesUntilStart} min`}
            </div>
          </div>
          <button
            onClick={dismiss}
            aria-label="Dismiss reminder"
            style={{
              width: 26, height: 26, borderRadius: 6,
              background: 'transparent', border: 'none',
              cursor: 'pointer', color: 'var(--slate-400)',
              fontSize: 13, flexShrink: 0,
              display: 'grid', placeItems: 'center', padding: 0,
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Link
            to="/attendance"
            onClick={dismiss}
            style={{
              flex: '1 1 auto',
              padding: '9px 14px', fontSize: 13, fontWeight: 600,
              borderRadius: 'var(--radius-sm)',
              background: urgent ? 'var(--success)' : 'var(--brand)',
              color: '#fff', textDecoration: 'none',
              textAlign: 'center',
            }}
          >
            {isCheckInOpen ? 'Check in now →' : 'Go to attendance →'}
          </Link>
          {canAskNotifications && (
            <button
              type="button"
              onClick={requestNotifications}
              title="Get notified even when this tab is in the background"
              style={{
                padding: '9px 12px', fontSize: 12, fontWeight: 500,
                borderRadius: 'var(--radius-sm)',
                background: '#fff',
                border: '1px solid var(--border-strong)',
                color: 'var(--slate-700)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              🔔 Desktop alerts
            </button>
          )}
        </div>
      </div>
    </>
  );
}