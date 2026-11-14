import { useState } from 'react';
import { createPortal } from 'react-dom';
import { api, setToken } from '../api/client';
import { useAuth } from '../context/AuthContext';

const LABEL = { fontSize: 13, fontWeight: 500, color: 'var(--slate-700)', display: 'block' };
const FIELD = { width: '100%', marginTop: 4 };

function EyeToggle({ visible, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={visible ? 'Hide password' : 'Show password'}
      style={{
        position: 'absolute', top: '50%', right: 8,
        transform: 'translateY(-50%)',
        width: 34, height: 34, borderRadius: 8,
        border: 'none', background: 'transparent',
        cursor: 'pointer',
        display: 'grid', placeItems: 'center',
        color: 'var(--slate-500)', padding: 0,
      }}
    >
      {visible ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      )}
    </button>
  );
}

export default function PasswordSetupModal({ user, open, onClose, onSuccess }) {
  const { refresh } = useAuth();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const isFirstSetup = user?.is_using_class_password === true;

  async function submit(e) {
    e.preventDefault();
    setErr('');

    if (newPassword !== confirmPassword) {
      setErr('Passwords do not match.');
      return;
    }
    if (newPassword.length < 8) {
      setErr('Password must be at least 8 characters.');
      return;
    }

    setBusy(true);
    try {
      const payload = { new_password: newPassword };
      if (!isFirstSetup) {
        payload.current_password = currentPassword;
      }

      const result = await api.post('/me/set-password/', payload);

      if (result?.token) {
        setToken(result.token);
      }

      await refresh();

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setErr('');
      onSuccess?.();
      onClose?.();
    } catch (e) {
      setErr(e?.data?.detail || e.message || 'Could not save your password.');
    } finally {
      setBusy(false);
    }
  }

  function handleClose() {
    if (busy) return;
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setErr('');
    onClose?.();
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(15, 23, 42, 0.55)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        zIndex: 9999,
        display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
        paddingTop: 'max(5vh, 32px)', paddingLeft: 16, paddingRight: 16,
        paddingBottom: 24, overflowY: 'auto',
        animation: 'pwFadeIn 200ms ease-out',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) handleClose();
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 20,
          width: '100%',
          maxWidth: 440,
          padding: '22px 22px 24px',
          boxShadow: '0 24px 60px rgba(15,23,42,0.28), 0 8px 20px rgba(15,23,42,0.12)',
          display: 'grid',
          gap: 14,
          animation: 'pwSlideDown 280ms cubic-bezier(0.2, 0.8, 0.2, 1)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em' }}>
              {isFirstSetup ? 'Set up personal password' : 'Change password'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              {isFirstSetup
                ? `You'll log in with ${user.index_number} + this new password.`
                : `Logged in as ${user.index_number}.`}
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={busy}
            style={{
              width: 32, height: 32, borderRadius: 8,
              background: 'var(--slate-100)', border: 'none',
              cursor: busy ? 'not-allowed' : 'pointer',
              display: 'grid', placeItems: 'center',
              fontSize: 14, color: 'var(--slate-600)',
              flexShrink: 0,
            }}
            aria-label="Close"
          >✕</button>
        </div>

        <form onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
          {!isFirstSetup && (
            <label style={LABEL}>
              Current password *
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="Your existing password"
                style={FIELD}
              />
            </label>
          )}

          <label style={LABEL}>
            New password *
            <div style={{ position: 'relative', marginTop: 4 }}>
              <input
                type={showNew ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                placeholder="At least 8 characters"
                style={{ width: '100%', paddingRight: 48 }}
              />
              <EyeToggle visible={showNew} onClick={() => setShowNew((v) => !v)} />
            </div>
          </label>

          <label style={LABEL}>
            Confirm password *
            <input
              type={showNew ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="Re-enter new password"
              style={FIELD}
            />
          </label>

          {err && (
            <div role="alert" style={{
              padding: '10px 12px',
              background: 'var(--danger-bg)',
              color: 'var(--danger)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 13,
              border: '1px solid #fecaca',
            }}>{err}</div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap', marginTop: 4 }}>
            <button
              type="button"
              onClick={handleClose}
              disabled={busy}
              style={{ padding: '10px 18px', fontSize: 14 }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={busy}
              style={{ padding: '10px 22px', fontSize: 14 }}
            >
              {busy ? 'Saving…' : isFirstSetup ? 'Set password' : 'Change password'}
            </button>
          </div>
        </form>
      </div>

      <style>{`
        @keyframes pwFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes pwSlideDown {
          from { opacity: 0; transform: translateY(-16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>,
    document.body,
  );
}