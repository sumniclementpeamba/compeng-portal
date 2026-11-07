import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import LoginBackground from '../components/LoginBackground';
import AnimatedTitle from '../components/AnimatedTitle';
import AnimatedFooter from '../components/AnimatedFooter';

const LABEL = { fontSize: 13, fontWeight: 500, color: 'var(--slate-700)', display: 'block' };
const FIELD = { width: '100%', marginTop: 4 };

const PROFILE_IMG = '/images2.jpeg';
const REP_CAPTION = 'Billy Boye Antwi · Course Rep';
const REFERENCE_MAX_LEN = 9;

// Footer metadata
const CREATOR_NAME = 'CLEMENT PEAMBA SUMNI';
const COPYRIGHT_YEAR = new Date().getFullYear();

// Routes that require rep/admin role. If a login redirect target is one
// of these and the user doesn't have the role, we send them to the
// dashboard instead of showing "Access denied".
const PROTECTED_ROUTES = ['/manage'];

function isProtectedPath(path) {
  if (!path) return false;
  return PROTECTED_ROUTES.some(
    (p) => path === p || path.startsWith(p + '/')
  );
}

function safeRedirect(user, location) {
  const from = location.state?.from?.pathname;
  if (!from) return '/';
  if (isProtectedPath(from)) {
    if (user?.role === 'rep' || user?.role === 'admin') return from;
    // Student tried to reach a protected route — send to dashboard
    return '/';
  }
  return from;
}

// ── Keyframes used by this page (guaranteed to exist) ────────
const PageKeyframes = () => (
  <style>{`
    @keyframes avatarGlow {
      0%, 100% {
        box-shadow:
          0 8px 24px rgba(15,23,42,0.18),
          0 0 0 3px rgba(59,130,246,0.35);
      }
      50% {
        box-shadow:
          0 8px 28px rgba(15,23,42,0.28),
          0 0 0 7px rgba(59,130,246,0.14);
      }
    }
    @keyframes welcomePop {
      0%   { opacity: 0; transform: scale(0.7); }
      60%  { opacity: 1; transform: scale(1.10); }
      100% { opacity: 1; transform: scale(1); }
    }
    @media (prefers-reduced-motion: reduce) {
      .login-avatar-glow,
      .login-welcome-pop { animation: none !important; }
    }
  `}</style>
);

export default function Login() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [form, setForm] = useState({ reference: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);

  // ── Loading state — with the background visible behind the spinner ──
  if (loading) {
    return (
      <div
        style={{
          position: 'relative',
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          overflow: 'hidden',
        }}
      >
        <LoginBackground />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <span className="spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
        </div>
      </div>
    );
  }

  // Already logged in — smart redirect (never sends students to /manage)
  if (user) {
    return <Navigate to={safeRedirect(user, location)} replace />;
  }

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const loggedInUser = await login(form.reference.trim(), form.password);
      navigate(safeRedirect(loggedInUser, location));
    } catch (e) {
      setErr(e.message || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        position: 'relative',
        minHeight: '100vh',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        gap: 20,
      }}
    >
      <LoginBackground />
      <PageKeyframes />

      {/* ── Content layer (above the animated background) ─── */}
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 20,
        }}
      >
        <form
          onSubmit={submit}
          className="animate-fade-up"
          style={{
            background: 'rgba(255, 255, 255, 0.97)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            padding: 32,
            borderRadius: 'var(--radius-lg)',
            width: '100%',
            maxWidth: 420,
            boxShadow:
              '0 30px 80px rgba(0, 0, 0, 0.35), ' +
              '0 8px 24px rgba(0, 0, 0, 0.15), ' +
              'inset 0 0 0 1px rgba(255, 255, 255, 0.4)',
            border: '1px solid rgba(255, 255, 255, 0.25)',
            display: 'grid',
            gap: 14,
          }}
        >
          <div style={{ textAlign: 'center', marginBottom: 4 }}>
            {/* Avatar with soft pulsing glow */}
            <div
              className="login-avatar-glow"
              style={{
                width: 84,
                height: 84,
                margin: '0 auto 14px',
                borderRadius: '50%',
                overflow: 'hidden',
                border: '3px solid #fff',
                boxShadow:
                  '0 8px 24px rgba(15,23,42,0.18), ' +
                  '0 0 0 3px rgba(59,130,246,0.35)',
                background: 'var(--slate-100)',
                display: 'grid',
                placeItems: 'center',
                animation: 'avatarGlow 3s ease-in-out infinite',
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
                <span style={{ fontSize: 28, fontWeight: 800, color: 'var(--brand)' }}>
                  C
                </span>
              )}
            </div>

            {/* Animated welcome tagline */}
            <p
              className="login-welcome-pop"
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: 'var(--brand)',
                margin: '0 0 6px',
                animation:
                  'welcomePop 800ms cubic-bezier(0.34, 1.56, 0.64, 1) 200ms both',
              }}
            >
              👋 Welcome
            </p>

            <AnimatedTitle text="CompEng Portal" as="h1" fontSize={26} />
            {REP_CAPTION && (
              <p
                style={{
                  fontSize: 12,
                  color: 'var(--text-muted)',
                  marginTop: 4,
                  letterSpacing: '0.02em',
                }}
              >
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
            <span
              style={{
                fontSize: 12,
                color: 'var(--text-muted)',
                display: 'block',
                marginTop: 4,
              }}
            >
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
            <div
              role="alert"
              style={{
                padding: '10px 12px',
                background: 'var(--danger-bg)',
                color: 'var(--danger)',
                borderRadius: 'var(--radius-sm)',
                fontSize: 13,
                border: '1px solid #fecaca',
              }}
            >
              {err}
            </div>
          )}

          <button
            type="submit"
            className="btn-primary"
            disabled={busy}
            style={{ marginTop: 4, padding: '11px 16px', fontSize: 15 }}
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </button>

          <p
            style={{
              fontSize: 12,
              color: 'var(--text-muted)',
              textAlign: 'center',
              marginTop: 4,
              lineHeight: 1.5,
            }}
          >
            Accounts are created by your course rep from the class list.
          </p>
        </form>

        {/* ── Footer ─────────────────────────────────────── */}
        <AnimatedFooter year={COPYRIGHT_YEAR} name={CREATOR_NAME} />
      </div>
    </div>
  );
} 