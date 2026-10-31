import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const LABEL = { fontSize: 13, fontWeight: 500, color: 'var(--slate-700)', display: 'block' };
const FIELD = { width: '100%', marginTop: 4 };

const PROFILE_IMG = '/images2.jpeg';
const REP_CAPTION = 'Billy Boye Antwi · Course Rep';
const REFERENCE_MAX_LEN = 9;

// Footer metadata
const CREATOR_NAME = 'CLEMENT PEAMBA SUMNI';
const COPYRIGHT_YEAR = new Date().getFullYear();

export default function Login() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [form, setForm] = useState({ reference: '', password: '' });
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
      await login(form.reference.trim(), form.password);
      navigate(location.state?.from?.pathname || '/');
    } catch (e) {
      setErr(e.message || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(circle at 20% 0%, #1e293b 0%, #0f172a 60%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
      gap: 20,
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
        <div style={{ textAlign: 'center', marginBottom: 4 }}>
          <div style={{
            width: 84, height: 84, margin: '0 auto 14px',
            borderRadius: '50%', overflow: 'hidden',
            border: '3px solid #fff',
            boxShadow: '0 8px 24px rgba(15,23,42,0.18), 0 0 0 3px rgba(59,130,246,0.35)',
            background: 'var(--slate-100)',
            display: 'grid', placeItems: 'center',
          }}>
            {!imgFailed ? (
              <img
                src={PROFILE_IMG}
                alt="Course representative"
                width={84}
                height={84}
                onError={() => setImgFailed(true)}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
            ) : (
              <span style={{ fontSize: 28, fontWeight: 800, color: 'var(--brand)' }}>C</span>
            )}
          </div>

          <h1 style={{ fontSize: 22 }}>CompEng Portal</h1>
          {REP_CAPTION && (
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, letterSpacing: '0.02em' }}>
              {REP_CAPTION}
            </p>
          )}
          <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 10 }}>
            Sign in with your admission reference number.
          </p>
        </div>

        <label style={LABEL}>
          Reference number
          <input
            value={form.reference}
            onChange={set('reference')}
            required
            maxLength={REFERENCE_MAX_LEN}
            autoComplete="username"
            autoCapitalize="characters"
            placeholder="e.g. UA2600133"
            style={{
              ...FIELD,
              fontFamily: 'var(--font-mono)',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
          />
          <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginTop: 4 }}>
             Not on the class list? Contact your course rep.
          </span>
        </label>

        <label style={LABEL}>
          Class password
          <input
            type="password"
            value={form.password}
            onChange={set('password')}
            required
            autoComplete="current-password"
            placeholder="Shared class password"
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

        <button
          type="submit"
          className="btn-primary"
          disabled={busy}
          style={{ marginTop: 4, padding: '11px 16px', fontSize: 15 }}
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>

        <p style={{
          fontSize: 12, color: 'var(--text-muted)',
          textAlign: 'center', marginTop: 4, lineHeight: 1.5,
        }}>
          Accounts are created by your course rep from the class list.
        </p>
      </form>

      {/* ── Footer ─────────────────────────────────────── */}
      <footer style={{
        textAlign: 'center',
        fontSize: 12,
        color: 'rgba(203, 213, 225, 0.7)',
        letterSpacing: '0.02em',
        lineHeight: 1.6,
        paddingBottom: 8,
      }}>
        <div style={{ fontWeight: 500 }}>
          © {COPYRIGHT_YEAR} — Created by{' '}
          <span style={{ color: 'rgba(255,255,255,0.9)', fontWeight: 600 }}>
            {CREATOR_NAME}
          </span>
        </div>
      </footer>
    </div>
  );
}