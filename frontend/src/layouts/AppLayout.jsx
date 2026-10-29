import { useEffect, useRef } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useOnline } from '../hooks/useOnline';
import { getToken } from '../api/client';
import { NotificationBell } from '../components/NotificationBell';

function NavTab({ to, end, children }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `nav-link${isActive ? ' nav-link-active' : ''}`
      }
    >
      {children}
    </NavLink>
  );
}

export function AppLayout() {
  const { user, logout } = useAuth();
  const online = useOnline();
  const navigate = useNavigate();
  const location = useLocation();
  const navRef = useRef(null);

  const displayName = user?.first_name || user?.username || '?';
  const initials = displayName.slice(0, 2).toUpperCase();
  const avatarSrc = user?.avatar_url
    ? `${user.avatar_url}?token=${getToken()}`
    : null;

  // On mobile, ensure the active nav tab is scrolled into view.
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const active = nav.querySelector('.nav-link-active');
    if (!active) return;
    if (nav.scrollWidth > nav.clientWidth) {
      active.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      });
    }
  }, [location.pathname]);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg)',
      }}
    >
      <header
        style={{
          background: 'var(--slate-900)',
          color: '#fff',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <div className="hdr-bar">
          <div className="hdr-brand">
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: 8,
                background: 'var(--brand)',
                display: 'grid',
                placeItems: 'center',
                fontWeight: 800,
                fontSize: 15,
                letterSpacing: '-0.02em',
                color: '#fff',
              }}
            >
              C
            </div>
            <strong style={{ fontSize: 16, letterSpacing: '-0.01em' }}>
              CompEng
            </strong>
            <span
              className={`badge ${online ? 'badge-success' : 'badge-danger'}`}
              style={{ fontSize: 11, padding: '3px 8px' }}
            >
              {online ? '● online' : '○ offline'}
            </span>
          </div>

          <nav className="hdr-nav" ref={navRef}>
            <NavTab to="/" end>Dashboard</NavTab>
            <NavTab to="/resources">Resources</NavTab>
            <NavTab to="/announcements">Announcements</NavTab>
            <NavTab to="/upload">Upload</NavTab>
            <NavTab to="/offline">Offline</NavTab>
            {(user?.role === 'rep' || user?.role === 'admin') && (
              <NavTab to="/manage">Manage</NavTab>
            )}
          </nav>

          <NotificationBell />

          <NavLink to="/profile" className="hdr-user">
            <div
              style={{
                width: 26,
                height: 26,
                borderRadius: '50%',
                background: avatarSrc ? 'transparent' : 'rgba(255,255,255,0.12)',
                display: 'grid',
                placeItems: 'center',
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                flexShrink: 0,
                overflow: 'hidden',
              }}
            >
              {avatarSrc ? (
                <img
                  src={avatarSrc}
                  alt=""
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    display: 'block',
                  }}
                />
              ) : (
                initials
              )}
            </div>
            <span className="hdr-user-name">{displayName}</span>
            <span
              style={{
                fontSize: 10,
                padding: '2px 6px',
                borderRadius: 4,
                background:
                  user?.role === 'admin'
                    ? '#7c2d12'
                    : user?.role === 'rep'
                    ? '#1e40af'
                    : 'rgba(255,255,255,0.1)',
                color: '#fff',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                flexShrink: 0,
              }}
            >
              {user?.role}
            </span>
          </NavLink>

          <button onClick={handleLogout} className="hdr-logout">
            Logout
          </button>
        </div>
      </header>

      <main
        className="animate-fade-in"
        style={{
          flex: 1,
          maxWidth: 1100,
          width: '100%',
          margin: '0 auto',
          padding: '28px 20px',
        }}
      >
        <Outlet />
      </main>

      <footer
        style={{
          borderTop: '1px solid var(--border)',
          padding: '16px 20px',
          textAlign: 'center',
          fontSize: 12,
          color: 'var(--text-muted)',
        }}
      >
        CompEng Vault · class-maintained resource archive
      </footer>
    </div>
  );
}

export const btnStyle = {};
export const inputStyle = { width: '100%' };