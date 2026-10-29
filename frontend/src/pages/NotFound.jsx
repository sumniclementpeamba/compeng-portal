import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div
      className="animate-fade-up"
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        textAlign: 'center',
      }}
    >
      <h1
        style={{
          fontSize: 88,
          margin: 0,
          color: 'var(--slate-300)',
          letterSpacing: '-0.04em',
          lineHeight: 1,
        }}
      >
        404
      </h1>
      <h2 style={{ marginTop: 16 }}>Page not found</h2>
      <p
        style={{
          color: 'var(--text-muted)',
          marginTop: 8,
          maxWidth: 420,
          fontSize: 15,
        }}
      >
        The page you're looking for doesn't exist or has been moved.
      </p>
      <Link
        to="/"
        style={{
          marginTop: 28,
          display: 'inline-block',
          padding: '10px 20px',
          borderRadius: 'var(--radius-sm)',
          background: 'var(--brand)',
          color: '#fff',
          fontWeight: 500,
          textDecoration: 'none',
          transition: 'background-color 140ms ease',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--brand-500)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--brand)'; }}
      >
        Go home
      </Link>
    </div>
  );
}