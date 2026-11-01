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

// Counts up from 0 to `value` on mount (and re-runs when value changes).
// Uses requestAnimationFrame — no animation library needed.
function CountUp({ value, duration = 900 }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!value || value === 0) {
      setDisplay(0);
      return;
    }
    let raf = null;
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / duration);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(value * eased));
      if (t < 1) raf = requestAnimationFrame(step);
      else setDisplay(value);
    };
    raf = requestAnimationFrame(step);
    return () => { if (raf) cancelAnimationFrame(raf); };
  }, [value, duration]);

  return <>{display}</>;
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

  const greetingDelay = 0;
  const greetAnim = (delayMs) => ({
    animation: `greetingIn 500ms cubic-bezier(0.2, 0.8, 0.2, 1) ${delayMs}ms both`,
  });

  return (
    <div className="animate-fade-up" style={{ display: 'grid', gap: 28 }}>
      {/* Hero */}
      <header
        style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'flex-end', flexWrap: 'wrap', gap: 16,
        }}
      >
        <div style={{ minWidth: 0, flex: '1 1 260px' }}>
          <p
            style={{
              fontSize: 12, fontWeight: 600, color: 'var(--text-muted)',
              textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0,
              ...greetAnim(greetingDelay + 0),
            }}
          >
            {today}
          </p>
          <h1
            style={{
              fontSize: 30, marginTop: 6,
              letterSpacing: '-0.025em', lineHeight: 1.15,
              overflowWrap: 'anywhere',
              ...greetAnim(greetingDelay + 100),
            }}
          >
            {greeting()}, {firstName}
          </h1>
          <p
            style={{
              color: 'var(--text-muted)', fontSize: 14, marginTop: 6,
              ...greetAnim(greetingDelay + 200),
            }}
          >
            {recent.length > 0
              ? `${recent.length} resource${recent.length === 1 ? '' : 's'} from across your courses, ready to explore.`
              : 'Be the first to add to your class library.'}
          </p>
        </div>
        <div
          style={{
            display: 'flex', gap: 8, flexWrap: 'wrap',
            ...greetAnim(greetingDelay + 300),
          }}
        >
          <Link
            to="/resources"
            className="hover-lift"
            style={{
              padding: '9px 16px', borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-strong)',
              background: '#fff', color: 'var(--text)',
              fontSize: 14, fontWeight: 500,
              textDecoration: 'none',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
          >
            🔍 Browse
          </Link>
          <Link
            to="/upload"
            className="btn-primary hover-lift"
            style={{
              padding: '9px 16px', borderRadius: 'var(--radius-sm)',
              fontSize: 14, fontWeight: 500,
              textDecoration: 'none',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
          >
            ＋ Upload
          </Link>
        </div>
      </header>

      {err && (
        <div style={{
          padding: '10px 14px', background: 'var(--danger-bg)',
          color: 'var(--danger)', borderRadius: 'var(--radius-sm)', fontSize: 14,
        }}>{err}</div>
      )}

      {/* Pinned banner with hover shimmer */}
      {topPinned && (
        <div
          className="pinned-glow"
          style={{
            padding: '14px 18px',
            background: 'linear-gradient(90deg, #fef3c7 0%, #fef9e7 100%)',
            border: '1px solid #fde68a', borderLeft: '4px solid #f59e0b',
            borderRadius: 'var(--radius)',
            display: 'flex', gap: 12, alignItems: 'flex-start',
            minWidth: 0,
            animation: 'greetingIn 500ms cubic-bezier(0.2, 0.8, 0.2, 1) 400ms both',
          }}
        >
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
          <Link to="/announcements" className="hover-arrow" style={{
            fontSize: 12, color: '#92400e',
            fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0,
          }}>
            View <span className="nav-arrow">→</span>
          </Link>
        </div>
      )}

      {/* Stats — count-up + hover lift + icon pop + pending pulse */}
      <div className="dash-stats stagger">
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
      <div
        className="card"
        style={{
          padding: 16, minWidth: 0,
          animation: 'greetingIn 500ms cubic-bezier(0.2, 0.8, 0.2, 1) 500ms both',
        }}
      >
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8,
        }}>
          <h3 style={{
            fontSize: 11, textTransform: 'uppercase',
            letterSpacing: '0.08em', color: 'var(--text-muted)',
            fontWeight: 600, margin: 0,
          }}>Today's classes</h3>
          <Link to="/timetable" className="hover-arrow" style={{ fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap' }}>
            {canManage ? 'Manage' : 'Full week'} <span className="nav-arrow">→</span>
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
              <div key={c.id} className="hover-lift" style={{
                display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', gap: 12,
                padding: '10px 12px',
                background: 'var(--slate-50)',
                borderRadius: 'var(--radius-sm)',
                flexWrap: 'wrap',
                minWidth: 0,
                cursor: 'pointer',
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
                <Link to="/attendance" className="hover-arrow" style={{
                  padding: '5px 12px', fontSize: 11, fontWeight: 600,
                  borderRadius: 'var(--radius-pill)',
                  background: 'var(--brand)', color: '#fff',
                  textDecoration: 'none', flexShrink: 0,
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                }}>
                  Check in <span className="nav-arrow">→</span>
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
              <div className="dash-recents stagger">
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
              <div className="dash-courses stagger">
                {courses.slice(0, 8).map((c) => (
                  <Link
                    key={c.name}
                    to={`/resources?course=${encodeURIComponent(c.name)}`}
                    className="card hover-lift hover-arrow"
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
                    <span className="nav-arrow" style={{ color: 'var(--slate-400)', fontSize: 16, flexShrink: 0 }}>
                      →
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>

        <aside style={{ display: 'grid', gap: 20, minWidth: 0 }}>
          <div
            className="card"
            style={{
              padding: 16, minWidth: 0,
              animation: 'greetingIn 500ms cubic-bezier(0.2, 0.8, 0.2, 1) 700ms both',
            }}
          >
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

          <div
            className="card"
            style={{
              padding: 16, minWidth: 0,
              animation: 'greetingIn 500ms cubic-bezier(0.2, 0.8, 0.2, 1) 800ms both',
            }}
          >
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
                <Link to="/announcements" className="hover-arrow" style={{ fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>
                  All <span className="nav-arrow">→</span>
                </Link>
              )}
            </div>
            {ann.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '12px 0 0' }}>
                No announcements yet.
              </p>
            ) : (
              <ul className="dash-ann-list stagger">
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
  const card = (
    <Link
      to={href}
      className={`card hover-lift hover-icon-pop${highlight ? ' highlight-pulse' : ''}`}
      style={{
        textDecoration: 'none', color: 'inherit',
        padding: '14px 16px',
        display: 'flex', alignItems: 'center', gap: 12,
        borderColor: highlight ? accent : 'var(--border)',
        borderWidth: highlight ? 2 : 1,
        minWidth: 0,
      }}
    >
      <div
        className="stat-icon"
        style={{
          fontSize: 20, width: 40, height: 40, borderRadius: 10,
          background: `${accent}15`,
          display: 'grid', placeItems: 'center', flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: 22, fontWeight: 700, lineHeight: 1,
          color: 'var(--text)', letterSpacing: '-0.02em',
          fontVariantNumeric: 'tabular-nums',
        }}>
          <CountUp value={value} />
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
          {label}
        </div>
      </div>
    </Link>
  );
  return card;
}

function SectionHeader({ title, action, actionHref }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between',
      alignItems: 'baseline', marginBottom: 12, gap: 8,
    }}>
      <h2 style={{ fontSize: 16, letterSpacing: '-0.01em', minWidth: 0 }}>{title}</h2>
      {action && actionHref && (
        <Link to={actionHref} className="hover-arrow" style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap' }}>
          {action} <span className="nav-arrow">→</span>
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
    <Link
      to={`/resources/${resource.id}`}
      className="card hover-lift hover-icon-pop"
      style={{
        textDecoration: 'none', color: 'inherit',
        padding: 14,
        display: 'flex', flexDirection: 'column',
        gap: 10, height: '100%', minWidth: 0,
      }}
    >
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'flex-start', gap: 8,
      }}>
        <div
          className="stat-icon"
          style={{
            fontSize: 22, width: 40, height: 40, borderRadius: 10,
            background: 'var(--slate-100)',
            display: 'grid', placeItems: 'center', flexShrink: 0,
          }}
        >
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
    <Link
      to={to}
      className="hover-arrow"
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 10px',
        borderRadius: 'var(--radius-sm)',
        textDecoration: 'none', color: 'var(--text)', fontSize: 13,
        transition: 'background 140ms ease, transform 180ms ease',
        minWidth: 0,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--slate-100)';
        e.currentTarget.style.transform = 'translateX(3px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.transform = 'translateX(0)';
      }}
    >
      <span style={{
        width: 24, height: 24, borderRadius: 6,
        background: 'var(--slate-100)',
        display: 'grid', placeItems: 'center',
        fontSize: 12, flexShrink: 0,
      }}>{icon}</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flex: 1 }}>
        {label}
      </span>
      <span className="nav-arrow" style={{ color: 'var(--slate-400)', fontSize: 12, flexShrink: 0 }}>
        →
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
        <Link to={actionHref} className="btn-primary hover-lift" style={{
          display: 'inline-block', marginTop: 16,
          padding: '8px 16px', borderRadius: 'var(--radius-sm)',
          textDecoration: 'none', fontSize: 13, fontWeight: 500,
        }}>{actionLabel}</Link>
      )}
    </div>
  );
} 