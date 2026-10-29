import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function ProtectedRoute({ children, requireRole }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '60vh' }}>
        <span className="spinner spinner-dark" style={{ width: 28, height: 28, borderWidth: 3 }} />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;

  if (requireRole && !requireRole.includes(user.role)) {
    return (
      <div className="animate-fade-up" style={{ maxWidth: 480, margin: '80px auto', textAlign: 'center', padding: 20 }}>
        <div style={{ fontSize: 52, marginBottom: 12 }}>🔒</div>
        <h2>Access denied</h2>
        <p style={{ color: 'var(--text-muted)', marginTop: 8 }}>
          This page requires <strong>{requireRole.join(' or ')}</strong> privileges.
          You are signed in as <strong>{user.role}</strong>.
        </p>
      </div>
    );
  }

  return children;
} 