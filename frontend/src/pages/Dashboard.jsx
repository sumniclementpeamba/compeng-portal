import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { announcementsApi, resourcesApi } from '../api/resources';
import { useAuth } from '../context/AuthContext';
import { listOffline } from '../offline/db';
import { useAutoRefresh, AUTO_REFRESH_MS } from '../hooks/useAutoRefresh';

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

function CountUp({ value, duration = 900 }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!value || value === 0) { setDisplay(0); return; }
    let raf = null;
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / duration);
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

// ── Live clock so "in X min" / live badges tick ─────────────
function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

// ── Relative time for announcements ────────────────────────
function relativeTime(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay === 1) return 'Yesterday';
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ── Check-in window status for a single timetable entry ────
function getCheckInStatus(entry, now) {
  const [sh, sm] = (entry.start_time || '08:00').split(':').map(Number);
  const [eh, em] = (entry.end_time || '10:00').split(':').map(Number);
  const start = new Date(now);
  start.setHours(sh, sm, 0, 0);
  const end = new Date(now);
  end.setHours(eh, em, 0, 0);
  const open = new Date(start.getTime() - (entry.check_in_starts_minutes_before || 5) * 60000);
  const close = new Date(end.getTime() + (entry.check_in_ends_minutes_after || 15) * 60000);

  if (now < open) return { status: 'upcoming', inMs: open - now, start, end };
  if (now >= open && now < close) return { status: 'open', closesInMs: close - now, start, end };
  return { status: 'ended', start, end };
}

export default function Dashboard() {
  const { user } = useAuth();
  const canManage = user?.role === 'rep' || user?.role === 'admin';
  const isAdmin = user?.role === 'admin';

  const [ann, setAnn] = useState([]);
  const [recent, setRecent] = useState([]);
  const [offlineCount, setOfflineCount] = useState(0);
  const [timetable, setTimetable] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const now = useNow(1000);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
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
      setErr('');
    } catch (e) {
      if (!silent) setErr(e.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useAutoRefresh(() => load({ silent: true }), AUTO_REFRESH_MS);

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
  const unpinned = ann.filter((a) => !a.pinned);
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

  // Find live / next class for the contextual subtitle
  const liveClass = todaysClasses.find((c) => getCheckInStatus(c, now).status === 'open');
  const nextClass = todaysClasses.find((c) => getCheckInStatus(c, now).status === 'upcoming');

  // Contextual subtitle
  let subtitle;
  let subtitleAction = null;
  if (liveClass) {
    const status = getCheckInStatus(liveClass, now);
    const mins = Math.max(1, Math.ceil(status.closesInMs / 60000));
    subtitle = (
      <>
        <span style={{
          display: 'inline-block', width: 8, height: 8,
          borderRadius: '50%', background: 'var(--success)',
          marginRight: 8, boxShadow: '0 0 0 3px rgba(34,197,94,0.2)',
          animation: 'dashPulse 2s ease-in-out infinite',
        }} />
        <strong style={{ color: 'var(--success)' }}>{liveClass.course_code}</strong>{' '}
        check-in is open — closes in {mins} min
      </>
    );
    subtitleAction = (
      <Link to="/attendance" style={{
        fontSize: 12, fontWeight: 700, color: 'var(--success)',
        textDecoration: 'none', whiteSpace: 'nowrap',
      }}>
        Check in →
      </Link>
    );
  } else if (nextClass) {
    const status = getCheckInStatus(nextClass, now);
    const mins = Math.max(1, Math.ceil(status.inMs / 60000));
    subtitle = (
      <>
        Next class: <strong style={{ color: 'var(--text)' }}>{nextClass.course_code}</strong>
        {nextClass.room && ` in ${nextClass.room}`} — in {mins} min
      </>
    );
  } else if (canManage && pendingCount > 0) {
    subtitle = (
      <>
        <strong style={{ color: 'var(--warning)' }}>{pendingCount}</strong>{' '}
        resource{pendingCount === 1 ? '' : 's'} awaiting your review
      </>
    );
    subtitleAction = (
      <Link to="/manage" style={{ fontSize: 12, fontWeight: 700, color: 'var(--warning)', textDecoration: 'none', whiteSpace: 'nowrap' }}>
        Review →
      </Link>
    );
  } else if (recent.length > 0) {
    subtitle = `${recent.length} resource${recent.length === 1 ? '' : 's'} from across your courses, ready to explore.`;
  } else {
    subtitle = 'Be the first to add to your class library.';
  }

  return (
    <div className="animate-fade-up" style={{ display: 'grid', gap: 24 }}>
      {/* ── Header ───────────────────────────────────────── */}
      <header style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'flex-end', flexWrap: 'wrap', gap: 16,
      }}>
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
          <p style={{
            color: 'var(--text-muted)', fontSize: 14, marginTop: 8,
            display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          }}>
            <span>{subtitle}</span>
            {subtitleAction}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link to="/resources" className="hover-lift" style={{
            padding: '9px 16px', borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-strong)',
            background: '#fff', color: 'var(--text)',
            fontSize: 14, fontWeight: 500, textDecoration: 'none',
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>🔍 Browse</Link>
          <Link to="/upload" className="btn-primary hover-lift" style={{
            padding: '9px 16px', borderRadius: 'var(--radius-sm)',
            fontSize: 14, fontWeight: 500, textDecoration: 'none',
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>＋ Upload</Link>
        </div>
      </header>

      {/* ── Quick actions row ────────────────────────────── */}
      <div style={{
        display: 'flex', gap: 8, flexWrap: 'wrap',
        paddingBottom: 4,
      }}>
        <QuickChip to="/upload" icon="＋" label="Upload" />
        <QuickChip to="/resources" icon="🔍" label="Search" />
        <QuickChip to="/attendance" icon="✓" label="Attendance" />
        <QuickChip to="/timetable" icon="📅" label="Timetable" />
        <QuickChip to="/offline" icon="📥" label="Offline" />
        {canManage && <QuickChip to="/manage" icon="⚙" label="Review queue" accent />}
      </div>

      {isAdmin && <FaceEnrollmentToggle />}

      {err && (
        <div style={{
          padding: '10px 14px', background: 'var(--danger-bg)',
          color: 'var(--danger)', borderRadius: 'var(--radius-sm)', fontSize: 14,
        }}>{err}</div>
      )}

      {topPinned && (
        <div style={{
          padding: '14px 18px',
          background: 'linear-gradient(90deg, #fef3c7 0%, #fef9e7 100%)',
          border: '1px solid #fde68a', borderLeft: '4px solid #f59e0b',
          borderRadius: 'var(--radius)',
          display: 'flex', gap: 12, alignItems: 'flex-start', minWidth: 0,
        }}>
          <span style={{ fontSize: 20, lineHeight: 1, flexShrink: 0 }}>📌</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontWeight: 600, fontSize: 14, color: '#92400e',
              overflowWrap: 'anywhere', wordBreak: 'break-word',
            }}>{topPinned.title}</div>
            <div style={{
              fontSize: 13, color: '#a16207', marginTop: 4,
              overflow: 'hidden', textOverflow: 'ellipsis',
              display: '-webkit-box', WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
            }}>{topPinned.body}</div>
          </div>
          <Link to="/announcements" style={{
            fontSize: 12, color: '#92400e',
            fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0,
          }}>View →</Link>
        </div>
      )}

      {/* ── Stat cards ───────────────────────────────────── */}
      <div className="dash-stats stagger">
        <StatCard
          icon="📚" label="Resources"
          value={recent.length} href="/resources"
          accent="var(--brand)"
        />
        <StatCard
          icon="📣" label="Announcements"
          value={ann.length} href="/announcements"
          accent="#f59e0b"
        />
        <StatCard
          icon="📥" label="Offline saved"
          value={offlineCount} href="/offline"
          accent="var(--success)"
        />
        {canManage && (
          <StatCard
            icon="⏳" label="Pending review"
            value={pendingCount} href="/manage"
            accent="var(--warning)"
            highlight={pendingCount > 0}
          />
        )}
      </div>

      {/* ── Today's classes ──────────────────────────────── */}
      <div className="card" style={{ padding: 20, minWidth: 0 }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8,
        }}>
          <h3 style={{
            fontSize: 11, textTransform: 'uppercase',
            letterSpacing: '0.08em', color: 'var(--text-muted)',
            fontWeight: 600, margin: 0,
          }}>Today's classes</h3>
          <Link to="/timetable" style={{ fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap' }}>
            {canManage ? 'Manage' : 'Full week'} →
          </Link>
        </div>

        {todaysClasses.length === 0 ? (
          <div style={{
            padding: '16px 0', fontSize: 13, color: 'var(--text-muted)',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{ fontSize: 20 }}>{todayIdx === -1 || todayIdx > 4 ? '🌤' : '☕'}</span>
            <span>
              {todayIdx === -1 || todayIdx > 4
                ? 'No classes today — enjoy the weekend.'
                : 'No classes scheduled today. Take it easy.'}
            </span>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {todaysClasses.map((c) => {
              const status = getCheckInStatus(c, now);
              const isLive = status.status === 'open';
              const isUpcoming = status.status === 'upcoming';
              const isEnded = status.status === 'ended';
              const mins = isLive
                ? Math.max(1, Math.ceil(status.closesInMs / 60000))
                : isUpcoming
                ? Math.max(1, Math.ceil(status.inMs / 60000))
                : 0;

              return (
                <div
                  key={c.id}
                  style={{
                    display: 'flex', justifyContent: 'space-between',
                    alignItems: 'center', gap: 12, padding: '12px 14px',
                    background: isLive ? 'rgba(34,197,94,0.06)' : 'var(--slate-50)',
                    borderRadius: 'var(--radius-sm)',
                    border: isLive ? '1px solid #bbf7d0' : '1px solid transparent',
                    flexWrap: 'wrap', minWidth: 0,
                    opacity: isEnded ? 0.65 : 1,
                    transition: 'opacity 200ms, background 200ms',
                  }}
                >
                  <div style={{ minWidth: 0, flex: '1 1 200px' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                        {c.course_code}
                      </span>
                      {c.course_title && (
                        <span style={{ fontSize: 12, color: 'var(--slate-600)' }}>
                          {c.course_title}
                        </span>
                      )}
                      {isLive && (
                        <span className="badge badge-success" style={{
                          fontSize: 9, display: 'inline-flex',
                          alignItems: 'center', gap: 4,
                        }}>
                          <span style={{
                            width: 5, height: 5, borderRadius: '50%',
                            background: 'currentColor',
                          }} />
                          LIVE · {mins}m left
                        </span>
                      )}
                      {isUpcoming && (
                        <span className="badge badge-neutral" style={{ fontSize: 9 }}>
                          in {mins}m
                        </span>
                      )}
                      {isEnded && (
                        <span className="badge badge-neutral" style={{ fontSize: 9 }}>
                          ended
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                      {c.start_time} – {c.end_time}
                      {c.room && ` · ${c.room}`}
                    </div>
                  </div>

                  {isLive ? (
                    <Link to="/attendance" style={{
                      padding: '7px 14px', fontSize: 12, fontWeight: 700,
                      borderRadius: 'var(--radius-pill)',
                      background: 'var(--success)', color: '#fff',
                      textDecoration: 'none', flexShrink: 0,
                      boxShadow: '0 2px 8px rgba(34,197,94,0.3)',
                    }}>Check in →</Link>
                  ) : isUpcoming ? (
                    <Link to="/attendance" style={{
                      padding: '7px 14px', fontSize: 11, fontWeight: 500,
                      borderRadius: 'var(--radius-pill)',
                      border: '1px solid var(--border-strong)',
                      background: '#fff', color: 'var(--slate-600)',
                      textDecoration: 'none', flexShrink: 0,
                    }}>View</Link>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Two-column layout ────────────────────────────── */}
      <div className="dash-grid">
        <div style={{ display: 'grid', gap: 24, minWidth: 0 }}>
          <section style={{ minWidth: 0 }}>
            <SectionHeader title="Recently added" action="View all" actionHref="/resources" />
            {recent.length === 0 ? (
              <EmptyState
                icon="📚" title="No resources yet"
                body="Be the first to contribute to the class library."
                actionLabel="Upload a resource" actionHref="/upload"
              />
            ) : (
              <div className="dash-recents stagger">
                {recent.slice(0, 4).map((r) => (
                  <ResourceCard key={r.id} resource={r} canManage={canManage} />
                ))}
              </div>
            )}
          </section>

          {courses.length > 0 && (
            <section style={{ minWidth: 0 }}>
              <SectionHeader title="Browse by course" action="All resources" actionHref="/resources" />
              <div className="dash-courses stagger">
                {courses.slice(0, 8).map((c) => (
                  <Link
                    key={c.name}
                    to={`/resources?course=${encodeURIComponent(c.name)}`}
                    className="card hover-lift"
                    style={{
                      textDecoration: 'none', color: 'inherit',
                      padding: '14px 16px',
                      display: 'flex', alignItems: 'center',
                      justifyContent: 'space-between', gap: 8, minWidth: 0,
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{
                        fontWeight: 700, fontSize: 14,
                        letterSpacing: '-0.01em', color: 'var(--text)',
                        overflow: 'hidden', textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap', maxWidth: '100%',
                      }}>{c.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
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

        <aside style={{ display: 'grid', gap: 20, minWidth: 0, alignContent: 'start' }}>
          <div className="card" style={{ padding: 16, minWidth: 0 }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              alignItems: 'baseline', marginBottom: 8, gap: 8,
            }}>
              <h3 style={{
                fontSize: 11, textTransform: 'uppercase',
                letterSpacing: '0.08em', color: 'var(--text-muted)', minWidth: 0,
              }}>Announcements</h3>
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
              <>
                {/* Pinned section (max 2, excluding the topPinned already shown in banner) */}
                {pinned.length > 1 && (
                  <>
                    <div style={{
                      fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                      letterSpacing: '0.06em', color: '#92400e',
                      marginBottom: 4, marginTop: 4,
                    }}>
                      📌 Pinned
                    </div>
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                      {pinned.slice(1, 3).map((a) => (
                        <li key={a.id} style={{ minWidth: 0 }}>
                          <AnnouncementItem announcement={a} pinned />
                        </li>
                      ))}
                    </ul>
                  </>
                )}

                {/* Recent unpinned */}
                {unpinned.length > 0 && (
                  <>
                    {pinned.length > 0 && (
                      <div style={{
                        fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                        letterSpacing: '0.06em', color: 'var(--text-muted)',
                        marginBottom: 4, marginTop: 10,
                      }}>
                        Recent
                      </div>
                    )}
                    <ul className="dash-ann-list stagger" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                      {unpinned.slice(0, 4).map((a) => (
                        <li key={a.id} style={{ minWidth: 0 }}>
                          <AnnouncementItem announcement={a} />
                        </li>
                      ))}
                    </ul>
                  </>
                )}

                {/* If everything was pinned, still show the rest */}
                {unpinned.length === 0 && pinned.length <= 1 && (
                  <ul className="dash-ann-list stagger" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {ann.slice(0, 4).map((a) => (
                      <li key={a.id} style={{ minWidth: 0 }}>
                        <AnnouncementItem announcement={a} />
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        </aside>
      </div>

      <style>{`
        @keyframes dashPulse {
          0%, 100% { transform: scale(1); }
          50%      { transform: scale(1.25); }
        }
      `}</style>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// Announcement item
// ═════════════════════════════════════════════════════════════
function AnnouncementItem({ announcement, pinned }) {
  return (
    <Link
      to="/announcements"
      style={{
        display: 'block', padding: '8px 10px',
        borderRadius: 'var(--radius-sm)',
        textDecoration: 'none', color: 'var(--text)',
        borderLeft: pinned ? '2px solid #f59e0b' : '2px solid transparent',
        background: pinned ? 'rgba(254, 243, 199, 0.35)' : 'transparent',
        transition: 'background 160ms',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--slate-50)'; }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = pinned ? 'rgba(254, 243, 199, 0.35)' : 'transparent';
      }}
    >
      <div style={{
        fontSize: 13, fontWeight: 500, overflowWrap: 'anywhere',
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
        overflow: 'hidden', lineHeight: 1.4,
      }}>
        {announcement.title}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
        {relativeTime(announcement.created_at)}
        {announcement.course_name && ` · ${announcement.course_name}`}
      </div>
    </Link>
  );
}

// ═════════════════════════════════════════════════════════════
// Quick action chip
// ═════════════════════════════════════════════════════════════
function QuickChip({ to, icon, label, accent }) {
  return (
    <Link
      to={to}
      className="hover-lift"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '7px 12px',
        borderRadius: 'var(--radius-pill)',
        background: accent ? 'var(--warning-bg)' : '#fff',
        border: `1px solid ${accent ? '#fcd34d' : 'var(--border)'}`,
        color: accent ? '#92400e' : 'var(--slate-700)',
        fontSize: 12, fontWeight: 500,
        textDecoration: 'none', whiteSpace: 'nowrap',
        transition: 'all 140ms ease',
      }}
    >
      <span style={{ fontSize: 13 }}>{icon}</span>
      <span>{label}</span>
    </Link>
  );
}

// ═════════════════════════════════════════════════════════════
// Face enrollment toggle — admin only
// ═════════════════════════════════════════════════════════════
function FaceEnrollmentToggle() {
  const [setting, setSetting] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(async ({ silent = false } = {}) => {
    try {
      const s = await api.get('/face-enrollment/setting/');
      setSetting(s);
      if (!silent) setErr('');
    } catch (e) {
      if (!silent) setErr(e.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useAutoRefresh(() => load({ silent: true }), AUTO_REFRESH_MS);

  async function toggle() {
    if (!setting || busy) return;
    const next = !setting.is_open;
    setBusy(true); setErr(''); setMsg('');
    try {
      const s = await api.post('/face-enrollment/setting/', { is_open: next });
      setSetting(s);
      setMsg(
        next
          ? 'Face enrollment is now OPEN. Students can enrol from Profile.'
          : 'Face enrollment is now CLOSED. New enrollments are blocked.'
      );
      setTimeout(() => setMsg(''), 5000);
    } catch (e) {
      setErr(e?.data?.detail || e.message || 'Could not update setting.');
    } finally {
      setBusy(false);
    }
  }

  if (!setting && !err) return null;

  if (err && !setting) {
    return (
      <div className="card" style={{ padding: 14, background: 'var(--danger-bg)', color: 'var(--danger)', fontSize: 13 }}>
        Face enrollment setting unavailable: {err}
      </div>
    );
  }

  const isOpen = setting.is_open;
  const accent = isOpen ? 'var(--success)' : 'var(--warning)';
  const bg = isOpen
    ? 'linear-gradient(135deg, #f0fdf4 0%, #ffffff 100%)'
    : 'linear-gradient(135deg, #fef3c7 0%, #ffffff 100%)';
  const enrolledPct =
    setting.total_members > 0
      ? Math.round((setting.enrolled_count / setting.total_members) * 100)
      : 0;

  return (
    <div className="card" style={{
      padding: 20,
      background: bg,
      borderLeft: `4px solid ${accent}`,
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'flex-start', gap: 16, flexWrap: 'wrap',
      }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{
            display: 'flex', alignItems: 'center',
            gap: 8, marginBottom: 6, flexWrap: 'wrap',
          }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              fontSize: 11, fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: '0.06em',
              color: accent,
            }}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%',
                background: accent,
                boxShadow: `0 0 0 3px ${isOpen ? 'rgba(34,197,94,0.2)' : 'rgba(245,158,11,0.2)'}`,
                animation: 'dashPulse 2s ease-in-out infinite',
              }} />
              {isOpen ? 'Open' : 'Closed'}
            </span>
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, letterSpacing: '-0.01em' }}>
              Face enrollment
            </h3>
          </div>

          <p style={{ fontSize: 13, color: 'var(--slate-700)', margin: '0 0 10px', lineHeight: 1.55 }}>
            {isOpen
              ? 'Students can enrol their face from their Profile page.'
              : 'Students cannot enrol their faces right now.'}
          </p>

          {setting.total_members !== undefined && (
            <>
              <div style={{
                display: 'flex', gap: 16, flexWrap: 'wrap',
                fontSize: 12, color: 'var(--slate-700)', marginBottom: 8,
              }}>
                <span>
                  <strong style={{ color: 'var(--success)' }}>{setting.enrolled_count}</strong>
                  {' '}of <strong>{setting.total_members}</strong> enrolled
                </span>
                {setting.eligible_not_enrolled > 0 && (
                  <span style={{ color: 'var(--slate-500)' }}>
                    · <strong>{setting.eligible_not_enrolled}</strong> ready to enrol
                  </span>
                )}
              </div>

              <div style={{
                height: 5, borderRadius: 3,
                background: 'rgba(0,0,0,0.08)', overflow: 'hidden',
                maxWidth: 280,
              }}>
                <div style={{
                  height: '100%',
                  width: `${enrolledPct}%`,
                  background: 'var(--success)',
                  borderRadius: 3,
                  transition: 'width 600ms var(--ease)',
                }} />
              </div>
            </>
          )}

          {setting.updated_at && setting.updated_by_name && (
            <p style={{
              fontSize: 11, color: 'var(--text-muted)',
              margin: '10px 0 0', fontStyle: 'italic',
            }}>
              Last changed {new Date(setting.updated_at).toLocaleString()} by {setting.updated_by_name}
            </p>
          )}
        </div>
        <button
          onClick={toggle}
          disabled={busy}
          style={{
            padding: '11px 20px',
            fontSize: 13, fontWeight: 600,
            borderRadius: 'var(--radius-sm)',
            background: isOpen ? '#fff' : 'var(--success)',
            color: isOpen ? 'var(--danger)' : '#fff',
            border: `1px solid ${isOpen ? '#fecaca' : 'var(--success)'}`,
            cursor: busy ? 'not-allowed' : 'pointer',
            opacity: busy ? 0.6 : 1,
            flexShrink: 0,
            whiteSpace: 'nowrap',
          }}
        >
          {busy ? 'Saving…' : isOpen ? '🔒 Close enrollment' : '🔓 Open enrollment'}
        </button>
      </div>

      {msg && (
        <div style={{
          marginTop: 12, padding: '10px 14px',
          background: 'var(--success-bg)', color: 'var(--success)',
          borderRadius: 8, fontSize: 13,
          border: '1px solid #bbf7d0',
        }}>{msg}</div>
      )}
      {err && (
        <div style={{
          marginTop: 12, padding: '10px 14px',
          background: 'var(--danger-bg)', color: 'var(--danger)',
          borderRadius: 8, fontSize: 13,
          border: '1px solid #fecaca',
        }}>{err}</div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// Stat card — 2-line layout with hover arrow
// ═════════════════════════════════════════════════════════════
function StatCard({ icon, label, value, href, accent, highlight }) {
  return (
    <Link
      to={href}
      className={`card hover-lift${highlight ? ' highlight-pulse' : ''}`}
      style={{
        textDecoration: 'none', color: 'inherit',
        padding: '16px 18px',
        display: 'grid', gap: 10,
        borderColor: highlight ? accent : 'var(--border)',
        borderWidth: highlight ? 2 : 1,
        minWidth: 0,
        position: 'relative',
      }}
    >
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'flex-start', gap: 8,
      }}>
        <div style={{
          fontSize: 20, width: 38, height: 38, borderRadius: 10,
          background: `${accent}15`,
          display: 'grid', placeItems: 'center', flexShrink: 0,
        }}>{icon}</div>
        <span style={{
          color: 'var(--slate-400)', fontSize: 14,
          opacity: 0.4, transition: 'opacity 140ms, transform 140ms',
        }}>→</span>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: 26, fontWeight: 700, lineHeight: 1,
          color: 'var(--text)', letterSpacing: '-0.03em',
          fontVariantNumeric: 'tabular-nums',
        }}>
          <CountUp value={value} />
        </div>
        <div style={{
          fontSize: 12, color: 'var(--text-muted)',
          marginTop: 6, lineHeight: 1.3,
          overflowWrap: 'anywhere',
        }}>
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

  return (
    <Link to={`/resources/${resource.id}`} className="card hover-lift" style={{
      textDecoration: 'none', color: 'inherit', padding: 14,
      display: 'flex', flexDirection: 'column', gap: 10,
      height: '100%', minWidth: 0,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{
          fontSize: 22, width: 40, height: 40, borderRadius: 10,
          background: 'var(--slate-100)', display: 'grid', placeItems: 'center', flexShrink: 0,
        }}>
          {TYPE_ICONS[resource.resource_type] || '📁'}
        </div>
        {showStatus && <span className={`badge ${badgeClass}`}>{resource.status}</span>}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontWeight: 600, fontSize: 14, color: 'var(--text)',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          overflow: 'hidden', lineHeight: 1.35, minHeight: '2.7em',
          overflowWrap: 'anywhere', wordBreak: 'break-word',
        }}>{resource.title}</div>
        <div style={{
          fontSize: 12, color: 'var(--text-muted)', marginTop: 6,
          display: 'flex', gap: 6, flexWrap: 'wrap',
        }}>
          <span>{resource.course_name}</span><span>·</span>
          <span>{resource.resource_type.replace('_', ' ')}</span><span>·</span>
          <span>v{resource.version}</span>
        </div>
      </div>
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
          display: 'inline-block', marginTop: 16, padding: '8px 16px',
          borderRadius: 'var(--radius-sm)', textDecoration: 'none',
          fontSize: 13, fontWeight: 500,
        }}>{actionLabel}</Link>
      )}
    </div>
  );
} 