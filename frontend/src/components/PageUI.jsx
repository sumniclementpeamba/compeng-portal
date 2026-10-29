import { Link } from 'react-router-dom';

export function PageHeader({ eyebrow, title, subtitle, actions }) {
  return (
    <div className="page-header">
      <div>
        {eyebrow && <p className="page-eyebrow">{eyebrow}</p>}
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {actions}
        </div>
      )}
    </div>
  );
}

export function StatCard({ icon, label, value, href, accent = 'var(--brand)', highlight }) {
  const body = (
    <>
      <div style={{
        fontSize: 20, width: 40, height: 40, borderRadius: 10,
        background: `${accent}15`, display: 'grid', placeItems: 'center',
        flexShrink: 0,
      }}>{icon}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: 22, fontWeight: 700, lineHeight: 1,
          color: 'var(--text)', letterSpacing: '-0.02em',
        }}>{value}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
          {label}
        </div>
      </div>
    </>
  );

  const style = {
    padding: '14px 16px',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    textDecoration: 'none',
    color: 'inherit',
    borderColor: highlight ? accent : 'var(--border)',
    borderWidth: highlight ? 2 : 1,
  };

  return href
    ? <Link to={href} className="card" style={style}>{body}</Link>
    : <div className="card" style={style}>{body}</div>;
}

export function InfoCard({ title, children, action }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      {title && (
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'baseline', marginBottom: 12,
        }}>
          <h3 className="info-card-title">{title}</h3>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

export function EmptyState({ icon, title, body, actionLabel, actionHref, actions }) {
  return (
    <div className="card" style={{ textAlign: 'center', padding: 36 }}>
      <div style={{ fontSize: 36, marginBottom: 8 }}>{icon}</div>
      <p style={{ fontWeight: 600, fontSize: 15 }}>{title}</p>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>
        {body}
      </p>
      {(actionLabel || actions) && (
        <div style={{
          display: 'flex', gap: 8, justifyContent: 'center',
          marginTop: 16, flexWrap: 'wrap',
        }}>
          {actionLabel && actionHref && (
            <Link to={actionHref} className="btn-primary" style={{
              display: 'inline-block',
              padding: '8px 16px',
              borderRadius: 'var(--radius-sm)',
              textDecoration: 'none',
              fontSize: 13,
              fontWeight: 500,
            }}>{actionLabel}</Link>
          )}
          {actions}
        </div>
      )}
    </div>
  );
}