import { useEffect, useRef, useState } from 'react';
import {
  NavLink, Outlet, useLocation, useNavigate,
} from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useOnline } from '../hooks/useOnline';
import { apiUrl, getToken } from '../api/client';
import { NotificationBell } from '../components/NotificationBell';

// ─────────────────────────────────────────────────────────────
// Menu item — used inside the dropdown panel
// ─────────────────────────────────────────────────────────────
function MenuItem({ to, end, icon, children, onClick }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      className={({ isActive }) =>
        `nav-menu-item${isActive ? ' active' : ''}`
      }
    >
      <span className="nav-menu-icon">{icon}</span>
      <span>{children}</span>
    </NavLink>
  );
}

// ─────────────────────────────────────────────────────────────
// Nav dropdown — hamburger-style menu for all devices
// ─────────────────────────────────────────────────────────────
function NavMenu({ user, onLogout }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const location = useLocation();

  // Close on route change
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
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

  function close() {
    setOpen(false);
  }

  return (
    <div ref={ref} className="nav-menu-wrap">
      <button
        type="button"
        className={`nav-menu-btn${open ? ' open' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="Open navigation menu"
      >
        <span className="nav-menu-burger">☰</span>
        <span className="nav-menu-label">Menu</span>
      </button>

      {open && (
        <div className="nav-menu-panel" role="menu">
          <MenuItem to="/" end icon="🏠" onClick={close}>Dashboard</MenuItem>
          <MenuItem to="/resources" icon="📚" onClick={close}>Resources</MenuItem>
          <MenuItem to="/announcements" icon="📣" onClick={close}>Announcements</MenuItem>
          <MenuItem to="/attendance" icon="✓" onClick={close}>Attendance</MenuItem>
          <MenuItem to="/timetable" icon="📅" onClick={close}>Timetable</MenuItem>
          <MenuItem to="/upload" icon="⬆" onClick={close}>Upload</MenuItem>
          <MenuItem to="/offline" icon="📥" onClick={close}>Offline</MenuItem>
          {(user?.role === 'rep' || user?.role === 'admin') && (
            <MenuItem to="/manage" icon="⚙" onClick={close}>Manage</MenuItem>
          )}

          <div className="nav-menu-divider" />

          <button
            type="button"
            className="nav-menu-item nav-menu-logout"
            onClick={() => {
              close();
              onLogout();
            }}
          >
            <span className="nav-menu-icon">⎋</span>
            <span>Logout</span>
          </button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main layout
// ─────────────────────────────────────────────────────────────
export function AppLayout() {
  const { user, logout } = useAuth();
  const online = useOnline();
  const navigate = useNavigate();

  const displayName = user?.first_name || user?.username || '?';
  const initials = displayName.slice(0, 2).toUpperCase();
  const avatarSrc = user?.avatar_url
    ? `${apiUrl(user.avatar_url)}?token=${getToken()}`
    : null;

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
          position: 'sticky',
          top: 0,
          zIndex: 100,
        }}
      >
        <div className="hdr-bar">
          {/* Brand */}
          <div className="hdr-brand">
            <div className="hdr-logo">C</div>
            <strong className="hdr-brand-name">CompEng</strong>
            <span
              className={`badge ${online ? 'badge-success' : 'badge-danger'} hdr-online-pill`}
            >
              {online ? '● online' : '○ offline'}
            </span>
          </div>

          <div className="hdr-spacer" />

          {/* Actions */}
          <NotificationBell />

          <NavLink to="/profile" className="hdr-user">
            <div className="hdr-avatar">
              {avatarSrc ? (
                <img src={avatarSrc} alt="" />
              ) : (
                initials
              )}
            </div>
            <span className="hdr-user-name">{displayName}</span>
            <span className={`hdr-role hdr-role-${user?.role}`}>
              {user?.role}
            </span>
          </NavLink>

          <NavMenu user={user} onLogout={handleLogout} />
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