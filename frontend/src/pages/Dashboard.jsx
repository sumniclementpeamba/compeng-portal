import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { announcementsApi, resourcesApi } from '../api/resources';
import { useAuth } from '../context/AuthContext';
import { listOffline } from '../offline/db';

const TYPE_ICONS = {
  note: '📝', slide: '📊', past_question: '📜',
  assignment: '📋', lab: '🧪', project: '🛠️',
  textbook: '📚', other: '📁',
};

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function Dashboard() {
  const { user } = useAuth();
  const canManage = user?.role === 'rep' || user?.role === 'admin';

  const [ann, setAnn] = useState([]);
  const [recent, setRecent] = useState([]);
  const [offlineCount, setOfflineCount] = useState(0);
  const [timetable, setTimetable] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [a, r, o, tt] = await Promise.all([
          announcementsApi.list(),
          resourcesApi.list(),
          listOffline().catch(() => []),
          api.get('/attendance/timetable/').catch(() => ({ results: [] })),
        ]);
        setAnn(a.results || []);
        setRecent(r.results || []);
        setOfflineCount(o.length || 0);
        setTimetable(tt.results || []);
      } catch (e) {
        setErr(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '50vh' }}>
        <span className="spinner spinner-dark" style={{ width: 32, height: 32, borderWidth: 3 }} />
      </div>
    );
  }

  const courseMap = {};
  recent.forEach((r) => {
    if (!r.course_name) return;
    courseMap[r.course_name] = (courseMap[r.course_name] || 0) + 1;
  });
  const courses = Object.entries(courseMap)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));

  const pinned = ann.filter((a) => a.pinned);
  const topPinned = pinned[0];
  const pendingCount = recent.filter((r) => r.status === 'pending').length;

  const displayName = user?.first_name || user?.username || '';
  const firstName = displayName.split(' ')[0];
  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  const jsDay = new Date().getDay();
  const todayIdx = jsDay === 0 ? 6 : jsDay - 1;
  const todaysClasses = timetable
    .filter((e) => e.day_of_week === todayIdx)
    .sort((a, b) => (a.start_time > b.start_time ? 1 : -1));

  return (
    <div className="animate-fade-up" style={{ display: 'grid', gap: 28 }}>
      <style>{`
        .dash-grid {
          display: grid;
          gap: 24px;
          grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
          align-items: start;
        }
        .dash-grid > * { min-width: 0; }
        @media (max-width: 900px) { .dash-grid { grid-template-columns: 1fr; } }
        .dash-stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 12px;
        }
        .dash-recents {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
          gap: 12px;
        }
        .dash-courses {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
          gap: 10px;
        }
        .dash-ann-list {
          list-style: none;
          padding: 0;
          margin: 0;
          display: grid;
          min-width: 0;
        }
        .dash-ann-item {
          display: block;
          min-width: 0;
          text-decoration: none;
          color: inherit;
          padding: 10px 0;
          border-top: 1px solid var(--border);
        }
        .dash-ann-title {
          font-size: 13px;
          font-weight: 600;
          color: var(--text);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          min-width: 0;
          max-width: 100%;
        }
        .dash-ann-card-body {
          font-size: 14px;
          color: var(--slate-600);
          margin-top: 8px;
          overflow-wrap: anywhere;
          word-break: break-word;
          display: -webkit-box;
          -webkit-line-clamp: 4;
          -webkit-box-orient: vertical;
          overflow: hidden;
          line-height: 1.55;
        }
        .dash-pinned-body {
          font-size: 13px;
          color: #78350f;
          margin-top: 2px;
          overflow-wrap: anywhere;
          word-break: break-word;
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
          line-height: 1.5;
        }
      `}</style>

      {/* Hero */}
      <header
        style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'flex-end', flexWrap: 'wrap', gap: 16,
        }}
      >
        <div style={{ minWidth: 0, flex: '1 1 260px' }}>
          <p style={{
            fontSize: 12, fontWeight: 600, color: 'var(--text-muted)',
            textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0,
          }}>{today}</p>
          <h1 style={{
            fontSize: 30, marginTop: 6,
            letterSpacing: '-0.025em', lineHeight: 1.15,
            overflowWrap: 'anywhere',
          }}>
            {greeting()}, {firstName}
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 6 }}>
            {recent.length > 0
              ? `${recent.length} resource${recent.length === 1 ? '' : 's'} from across your courses, ready to explore.`
              : 'Be the first to add to your class library.'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link to="/resources" style={{
            padding: '9px 16px', borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-strong)',
            background: '#fff', color: 'var(--text)',
            fontSize: 14, fontWeight: 500,
            textDecoration: 'none',
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>🔍 Browse</Link>
          <Link to="/upload" className="btn-primary" style={{
            padding: '9px 16px', borderRadius: 'var(--radius-sm)',
            fontSize: 14, fontWeight: 500,
            textDecoration: 'none',
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>＋ Upload</Link>
        </div>
      </header>

      {err && (
        <div style={{
          padding: '10px 14px', background: 'var(--danger-bg)',
          color: 'var(--danger)', borderRadius: 'var(--radius-sm)', fontSize: 14,
        }}>{err}</div>
      )}

      {/* Pinned banner — clamp + wrap so long body never overflows */}
      {topPinned && (
        <div style={{
          padding: '14px 18px',
          background: 'linear-gradient(90deg, #fef3c7 0%, #fef9e7 100%)',
          border: '1px solid #fde68a', borderLeft: '4px solid #f59e0b',
          borderRadius: 'var(--radius)',
          display: 'flex', gap: 12, alignItems: 'flex-start',
          minWidth: 0,
        }}>
          <span style={{ fontSize: 20, lineHeight: 1, flexShrink: 0 }}>📌</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontWeight: 600, fontSize: 14, color: '#92400e',
              overflowWrap: 'anywhere', wordBreak: 'break-word',
            }}>
              {topPinned.title}
            </div>
            <div className="dash-pinned-body">{topPinned.body}</div>
          </div>
          <Link to="/announcements" style={{
            fontSize: 12, color: '#92400e',
            fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0,
          }}>View →</Link>
        </div>
      )}

      {/* Stats */}
      <div className="dash-stats">
        <StatCard
          icon="📚" label="Resources" value={recent.length}
          href="/resources" accent="var(--brand)"
        />
        <StatCard
          icon="📣" label="Announcements" value={ann.length}
          href="/announcements" accent="#f59e0b"
        />
        <StatCard
          icon="📥" label="Offline saved" value={offlineCount}
          href="/offline" accent="var(--success)"
        />
        {canManage && (
          <StatCard
            icon="⏳" label="Pending review" value={pendingCount}
            href="/manage" accent="var(--warning)"
            highlight={pendingCount > 0}
          />
        )}
      </div>

      {/* Today's classes */}
      <div className="card" style={{ padding: 16, minWidth: 0 }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8,
        }}>
          <h3 style={{
            fontSize: 11, textTransform: 'uppercase',
            letterSpacing: '0.08em', color: 'var(--text-muted)',
            fontWeight: 600, margin: 0,
          }}>Today's classes</h3>
          <Link to="/timetable" style={{ fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap' }}>
            {canManage ? 'Manage →' : 'Full week →'}
          </Link>
        </div>
        {todaysClasses.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
            No classes scheduled today.
            {canManage && (
              <>
                {' '}
                <Link to="/timetable" style={{ color: 'var(--brand)', fontWeight: 500 }}>
                  Add your weekly schedule
                </Link>
                {' '}so attendance opens automatically.
              </>
            )}
          </p>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {todaysClasses.map((c) => (
              <div key={c.id} style={{
                display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', gap: 12,
                padding: '10px 12px',
                background: 'var(--slate-50)',
                borderRadius: 'var(--radius-sm)',
                flexWrap: 'wrap',
                minWidth: 0,
              }}>
                <div style={{ minWidth: 0, flex: '1 1 200px' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{
                      fontSize: 13, fontWeight: 700,
                      fontFamily: 'var(--font-mono)',
                      overflowWrap: 'anywhere',
                    }}>{c.course_code}</span>
                    {c.course_title && (
                      <span style={{
                        fontSize: 12, color: 'var(--slate-600)',
                        overflowWrap: 'anywhere',
                      }}>
                        {c.course_title}
                      </span>
                    )}
                  </div>
                  <div style={{
                    fontSize: 11, color: 'var(--text-muted)', marginTop: 2,
                    overflowWrap: 'anywhere',
                  }}>
                    {c.start_time} – {c.end_time}
                    {c.room && ` · ${c.room}`}
                    {c.lecturer && ` · ${c.lecturer}`}
                  </div>
                </div>
                <Link to="/attendance" style={{
                  padding: '5px 12px', fontSize: 11, fontWeight: 600,
                  borderRadius: 'var(--radius-pill)',
                  background: 'var(--brand)', color: '#fff',
                  textDecoration: 'none', flexShrink: 0,
                }}>
                  Check in →
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Main + sidebar */}
      <div className="dash-grid">
        <div style={{ display: 'grid', gap: 28, minWidth: 0 }}>
          <section style={{ minWidth: 0 }}>
            <SectionHeader
              title="Recently added"
              action="View all"
              actionHref="/resources"
            />
            {recent.length === 0 ? (
              <EmptyState
                icon="📚" title="No resources yet"
                body="Be the first to contribute to the class library."
                actionLabel="Upload a resource" actionHref="/upload"
              />
            ) : (
              <div className="dash-recents">
                {recent.slice(0, 6).map((r) => (
                  <ResourceCard key={r.id} resource={r} canManage={canManage} />
                ))}
              </div>
            )}
          </section>

          {courses.length > 0 && (
            <section style={{ minWidth: 0 }}>
              <SectionHeader
                title="Browse by course"
                action="All resources"
                actionHref="/resources"
              />
              <div className="dash-courses">
                {courses.slice(0, 8).map((c) => (
                  <Link
                    key={c.name}
                    to={`/resources?course=${encodeURIComponent(c.name)}`}
                    className="card"
                    style={{
                      textDecoration: 'none', color: 'inherit',
                      padding: '14px 16px',
                      display: 'flex', alignItems: 'center',
                      justifyContent: 'space-between', gap: 8,
                      minWidth: 0,
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{
                        fontWeight: 700, fontSize: 14,
                        letterSpacing: '-0.01em', color: 'var(--text)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        maxWidth: '100%',
                      }}>{c.name}</div>
                      <div style={{
                        fontSize: 12, color: 'var(--text-muted)', marginTop: 2,
                      }}>
                        {c.count} resource{c.count === 1 ? '' : 's'}
                      </div>
                    </div>
                    <span style={{ color: 'var(--slate-400)', fontSize: 16, flexShrink: 0 }}>→</span>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>

        <aside style={{ display: 'grid', gap: 20, minWidth: 0 }}>
          <div className="card" style={{ padding: 16, minWidth: 0 }}>
            <h3 style={{
              fontSize: 11, textTransform: 'uppercase',
              letterSpacing: '0.08em', color: 'var(--text-muted)',
              marginBottom: 12,
            }}>Quick actions</h3>
            <div style={{ display: 'grid', gap: 2 }}>
              <QuickLink to="/upload" icon="＋" label="Upload resource" />
              <QuickLink to="/resources" icon="🔍" label="Search library" />
              <QuickLink to="/attendance" icon="✓" label="Check attendance" />
              <QuickLink to="/timetable" icon="📅" label="View timetable" />
              <QuickLink to="/offline" icon="📥" label="Offline materials" />
              {canManage && (
                <QuickLink to="/manage" icon="⚙" label="Review queue" />
              )}
            </div>
          </div>

          {/* Sidebar — Latest announcements (safe title + link chain) */}
          <div className="card" style={{ padding: 16, minWidth: 0 }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              alignItems: 'baseline', marginBottom: 4, gap: 8,
            }}>
              <h3 style={{
                fontSize: 11, textTransform: 'uppercase',
                letterSpacing: '0.08em', color: 'var(--text-muted)',
                minWidth: 0,
              }}>Latest announcements</h3>
              {ann.length > 0 && (
                <Link to="/announcements" style={{ fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>
                  All →
                </Link>
              )}
            </div>
            {ann.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '12px 0 0' }}>
                No announcements yet.
              </p>
            ) : (
              <ul className="dash-ann-list">
                {ann.slice(0, 4).map((a) => (
                  <li key={a.id} style={{ minWidth: 0 }}>
                    <Link to="/announcements" className="dash-ann-item">
                      <div className="dash-ann-title">
                        {a.pinned && '📌 '}
                        {a.title}
                      </div>
                      <div style={{
                        fontSize: 11, color: 'var(--text-muted)', marginTop: 2,
                      }}>
                        {new Date(a.created_at).toLocaleDateString()}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, href, accent, highlight }) {
  return (
    <Link to={href} className="card" style={{
      textDecoration: 'none', color: 'inherit',
      padding: '14px 16px',
      display: 'flex', alignItems: 'center', gap: 12,
      borderColor: highlight ? accent : 'var(--border)',
      borderWidth: highlight ? 2 : 1,
      minWidth: 0,
    }}>
      <div style={{
        fontSize: 20, width: 40, height: 40, borderRadius: 10,
        background: `${accent}15`,
        display: 'grid', placeItems: 'center', flexShrink: 0,
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
    </Link>
  );
}

function SectionHeader({ title, action, actionHref }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between',
      alignItems: 'baseline', marginBottom: 12, gap: 8,
    }}>
      <h2 style={{ fontSize: 16, letterSpacing: '-0.01em', minWidth: 0 }}>{title}</h2>
      {action && actionHref && (
        <Link to={actionHref} style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap' }}>
          {action} →
        </Link>
      )}
    </div>
  );
}

function ResourceCard({ resource, canManage }) {
  const showStatus = canManage || resource.status !== 'approved';
  const badgeClass =
    resource.status === 'approved' ? 'badge-success'
    : resource.status === 'rejected' ? 'badge-danger'
    : 'badge-warning';
  const typeLabel = resource.resource_type.replace('_', ' ');

  return (
    <Link to={`/resources/${resource.id}`} className="card" style={{
      textDecoration: 'none', color: 'inherit',
      padding: 14,
      display: 'flex', flexDirection: 'column',
      gap: 10, height: '100%', minWidth: 0,
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'flex-start', gap: 8,
      }}>
        <div style={{
          fontSize: 22, width: 40, height: 40, borderRadius: 10,
          background: 'var(--slate-100)',
          display: 'grid', placeItems: 'center', flexShrink: 0,
        }}>
          {TYPE_ICONS[resource.resource_type] || '📁'}
        </div>
        {showStatus && (
          <span className={`badge ${badgeClass}`}>{resource.status}</span>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontWeight: 600, fontSize: 14, color: 'var(--text)',
          display: '-webkit-box',
          WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          lineHeight: 1.35, minHeight: '2.7em',
          overflowWrap: 'anywhere', wordBreak: 'break-word',
        }}>{resource.title}</div>
        <div style={{
          fontSize: 12, color: 'var(--text-muted)', marginTop: 6,
          display: 'flex', gap: 6, flexWrap: 'wrap',
        }}>
          <span>{resource.course_name}</span>
          <span>·</span>
          <span>{typeLabel}</span>
          <span>·</span>
          <span>v{resource.version}</span>
        </div>
      </div>
    </Link>
  );
}

function QuickLink({ to, icon, label }) {
  return (
    <Link to={to} style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 10px',
      borderRadius: 'var(--radius-sm)',
      textDecoration: 'none', color: 'var(--text)', fontSize: 13,
      transition: 'background 140ms ease',
      minWidth: 0,
    }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--slate-100)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      <span style={{
        width: 24, height: 24, borderRadius: 6,
        background: 'var(--slate-100)',
        display: 'grid', placeItems: 'center',
        fontSize: 12, flexShrink: 0,
      }}>{icon}</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
        {label}
      </span>
    </Link>
  );
}

function EmptyState({ icon, title, body, actionLabel, actionHref }) {
  return (
    <div className="card" style={{ textAlign: 'center', padding: 36 }}>
      <div style={{ fontSize: 36, marginBottom: 8 }}>{icon}</div>
      <p style={{ fontWeight: 600, fontSize: 15 }}>{title}</p>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>{body}</p>
      {actionLabel && actionHref && (
        <Link to={actionHref} className="btn-primary" style={{
          display: 'inline-block', marginTop: 16,
          padding: '8px 16px', borderRadius: 'var(--radius-sm)',
          textDecoration: 'none', fontSize: 13, fontWeight: 500,
        }}>{actionLabel}</Link>
      )}
    </div>
  );
} 