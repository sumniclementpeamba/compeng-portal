import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const LABEL = { fontSize: 13, fontWeight: 500, color: 'var(--slate-700)', display: 'block' };
const FIELD = { width: '100%', marginTop: 4 };

// Profile photo — file lives at frontend/public/rep.jpg (or your own name)
const PROFILE_IMG = '/rep.JPG';

// Optional caption shown under your photo. Set to null to hide.
const REP_CAPTION = 'Billy Boye · Course Rep';

export default function Login() {
  const { user, loading, login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({
    identifier: '',
    password: '',
    access_code: '',
  });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'radial-gradient(circle at 20% 0%, #1e293b 0%, #0f172a 60%)',
        display: 'grid', placeItems: 'center',
      }}>
        <span className="spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
      </div>
    );
  }

  if (user) {
    return <Navigate to={location.state?.from?.pathname || '/'} replace />;
  }

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      if (mode === 'login') {
        await login(form.identifier, form.password);
      } else {
        await register({
          full_name: form.identifier,
          password: form.password,
          access_code: form.access_code,
        });
      }
      navigate(location.state?.from?.pathname || '/');
    } catch (e) {
      setErr(e.message || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  function toggleMode() {
    setErr('');
    setMode(mode === 'login' ? 'register' : 'login');
  }

  const identifierLabel = mode === 'login' ? 'Full name or username' : 'Full name';

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(circle at 20% 0%, #1e293b 0%, #0f172a 60%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20,
    }}>
      <form
        onSubmit={submit}
        className="animate-fade-up"
        style={{
          background: '#fff',
          padding: 32,
          borderRadius: 'var(--radius-lg)',
          width: '100%',
          maxWidth: 420,
          boxShadow: 'var(--shadow-lg)',
          display: 'grid',
          gap: 14,
        }}
      >
        {/* ── Profile photo + brand ─────────────────────── */}
        <div style={{ textAlign: 'center', marginBottom: 4 }}>
          <div
            style={{
              width: 84,
              height: 84,
              margin: '0 auto 14px',
              borderRadius: '50%',
              overflow: 'hidden',
              border: '3px solid #fff',
              boxShadow: '0 8px 24px rgba(15,23,42,0.18), 0 0 0 3px rgba(59,130,246,0.35)',
              background: 'var(--slate-100)',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            {!imgFailed ? (
              <img
                src={PROFILE_IMG}
                alt="Course representative"
                width={84}
                height={84}
                onError={() => setImgFailed(true)}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  display: 'block',
                }}
              />
            ) : (
              /* Fallback: initials, in case the file is missing */
              <span style={{ fontSize: 28, fontWeight: 800, color: 'var(--brand)' }}>
                C
              </span>
            )}
          </div>

          <h1 style={{ fontSize: 22 }}>CompEng Portal</h1>

          {REP_CAPTION && (
            <p style={{
              fontSize: 12,
              color: 'var(--text-muted)',
              marginTop: 4,
              letterSpacing: '0.02em',
            }}>
              {REP_CAPTION}
            </p>
          )}

          <p style={{
            color: 'var(--text-muted)',
            fontSize: 14,
            marginTop: 10,
          }}>
            {mode === 'login'
              ? 'Sign in to access your class resources.'
              : 'Create your class account with your full name.'}
          </p>
        </div>

        <label style={LABEL}>
          {identifierLabel}
          <input
            value={form.identifier}
            onChange={set('identifier')}
            required
            autoComplete="username"
            placeholder="e.g. Adaeze Okonkwo"
            style={FIELD}
          />
          {mode === 'register' && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginTop: 4 }}>
              Use your real name — it's how you'll sign in and how the class sees your uploads.
            </span>
          )}
        </label>

        <label style={LABEL}>
          Password
          <input
            type="password"
            value={form.password}
            onChange={set('password')}
            required
            minLength={8}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            style={FIELD}
          />
          {mode === 'register' && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginTop: 4 }}>
              At least 8 characters.
            </span>
          )}
        </label>

        {mode === 'register' && (
          <label style={LABEL}>
            Class access code
            <input
              value={form.access_code}
              onChange={set('access_code')}
              required
              placeholder="Ask your course rep"
              style={FIELD}
            />
          </label>
        )}

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

        <button
          type="submit"
          className="btn-primary"
          disabled={busy}
          style={{ marginTop: 4, padding: '11px 16px', fontSize: 15 }}
        >
          {busy ? 'Working…' : mode === 'login' ? 'Sign in' : 'Create account'}
        </button>

        <button
          type="button"
          onClick={toggleMode}
          disabled={busy}
          style={{
            background: 'transparent', border: 'none',
            color: 'var(--brand)', padding: 0, fontSize: 13, cursor: 'pointer',
          }}
        >
          {mode === 'login' ? 'Need an account? Register' : 'Already have an account? Sign in'}
        </button>
      </form>
    </div>
  );
} 