import { useEffect, useState } from 'react';
import { API_BASE, api, apiUrl, getToken } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { PageHeader, StatCard, EmptyState } from '../components/PageUI';

const STATUS_META = {
  present: { label: 'Present', color: 'var(--success)', bg: 'var(--success-bg)', icon: '✓' },
  absent:  { label: 'Absent',  color: 'var(--danger)',  bg: 'var(--danger-bg)',  icon: '✕' },
  late:    { label: 'Late',    color: 'var(--warning)', bg: 'var(--warning-bg)', icon: '⏱' },
  excused: { label: 'Excused', color: 'var(--slate-500)', bg: 'var(--slate-100)', icon: '—' },
};

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function formatCountdown(ms) {
  if (ms <= 0) return '0:00';
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function Attendance() {
  const { user } = useAuth();
  if (!user) return null;

  const isAdmin = user.role === 'admin';
  const isRep = user.is_class_rep === true;

  if (isAdmin) {
    return <AdminView canCreateSessions={isRep} />;
  }
  return <StudentView isRep={isRep} />;
}

// ═════════════════════════════════════════════════════════════
// STUDENT VIEW — used by students AND reps
// Reps get one extra "Create session" button.
// ═════════════════════════════════════════════════════════════
function StudentView({ isRep }) {
  const [data, setData] = useState(null);
  const [semester, setSemester] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [flash, setFlash] = useState('');
  const [showNewForm, setShowNewForm] = useState(false);
  const now = useNow(1000);

  async function refresh() {
    try {
      const [d, sem] = await Promise.all([
        api.get('/attendance/me/'),
        api.get('/attendance/me/semester/').catch(() => null),
      ]);
      setData(d);
      setSemester(sem);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, 20000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function checkIn(sessionId) {
    setBusyId(sessionId);
    setErr('');
    setFlash('');
    try {
      const res = await api.post(`/attendance/sessions/${sessionId}/self-check-in/`);
      setFlash(
        res.status === 'late'
          ? 'Checked in — marked LATE. Speak to your rep if this is wrong.'
          : 'Checked in — marked present. Welcome!'
      );
      await refresh();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '40vh' }}>
        <span className="spinner spinner-dark" style={{ width: 28, height: 28, borderWidth: 3 }} />
      </div>
    );
  }

  const s = data?.summary || {};
  const records = data?.records || [];
  const activeCheckIns = data?.active_check_ins || [];

  const pct = s.percentage || 0;
  const pctColor =
    pct >= 75 ? 'var(--success)'
    : pct >= 60 ? 'var(--warning)'
    : 'var(--danger)';

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow={isRep ? 'My record · Class rep' : 'My record'}
        title="Attendance"
        subtitle={
          isRep
            ? 'Check yourself in during class. Create a session for manual classes — students mark themselves.'
            : 'Check yourself in during class, then review your full history.'
        }
        actions={
          isRep && !showNewForm ? (
            <button
              onClick={() => setShowNewForm(true)}
              className="btn-primary"
              style={{ padding: '9px 16px' }}
            >
              ＋ Create session
            </button>
          ) : null
        }
      />

      {showNewForm && (
        <NewSessionForm
          onCreated={() => {
            setShowNewForm(false);
            setFlash('Session created — check-in is open. Students can now mark themselves present.');
            refresh();
          }}
          onCancel={() => setShowNewForm(false)}
        />
      )}

      {semester && <SemesterSummaryCard data={semester} />}

      {activeCheckIns.length > 0 && (
        <div style={{ display: 'grid', gap: 10, marginBottom: 20 }}>
          {activeCheckIns.map((session) => {
            const closesMs = new Date(session.check_in_closes_at).getTime();
            const remaining = closesMs - now;
            const urgent = remaining < 60_000;
            return (
              <div key={session.id} style={{
                padding: 20,
                borderRadius: 'var(--radius)',
                background: urgent
                  ? 'linear-gradient(135deg, #fee2e2 0%, #ffffff 100%)'
                  : 'linear-gradient(135deg, #dcfce7 0%, #ffffff 100%)',
                border: `1px solid ${urgent ? '#fecaca' : '#bbf7d0'}`,
                borderLeft: `4px solid ${urgent ? 'var(--danger)' : 'var(--success)'}`,
              }}>
                <div style={{
                  display: 'flex', justifyContent: 'space-between',
                  alignItems: 'flex-start', gap: 12, flexWrap: 'wrap',
                }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{
                      fontSize: 11, fontWeight: 700,
                      textTransform: 'uppercase', letterSpacing: '0.06em',
                      color: urgent ? 'var(--danger)' : 'var(--success)',
                      marginBottom: 4,
                    }}>
                      🔔 Class is open for check-in
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>
                      {session.title}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--slate-600)', marginTop: 2 }}>
                      {new Date(session.date).toLocaleDateString(undefined, {
                        weekday: 'long', month: 'short', day: 'numeric',
                      })}
                      {session.course_name && ` · ${session.course_name}`}
                    </div>
                    <div style={{
                      fontSize: 13, marginTop: 8, fontWeight: 600,
                      color: urgent ? 'var(--danger)' : 'var(--slate-700)',
                      fontVariantNumeric: 'tabular-nums',
                    }}>
                      ⏱ Closes in {formatCountdown(remaining)}
                    </div>
                  </div>
                  <button
                    onClick={() => checkIn(session.id)}
                    disabled={busyId === session.id || remaining <= 0}
                    className="btn-primary"
                    style={{ padding: '12px 24px', fontSize: 15, fontWeight: 700 }}
                  >
                    {busyId === session.id ? 'Checking in…' : "I'm here ✓"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {flash && (
        <div style={{
          padding: '12px 16px', background: 'var(--success-bg)',
          color: 'var(--success)', borderRadius: 'var(--radius-sm)',
          fontSize: 14, marginBottom: 16, border: '1px solid #bbf7d0',
        }}>{flash}</div>
      )}

      {err && (
        <div role="alert" style={{
          padding: '12px 16px', background: 'var(--danger-bg)',
          color: 'var(--danger)', borderRadius: 'var(--radius-sm)',
          fontSize: 14, marginBottom: 16, border: '1px solid #fecaca',
        }}>{err}</div>
      )}

      {records.length === 0 ? (
        <EmptyState
          icon="📅"
          title="No sessions recorded yet"
          body="When your course rep schedules classes on the timetable, attendance will appear here automatically."
        />
      ) : (
        <>
          <div className="card" style={{
            padding: 24, marginBottom: 20,
            display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap',
          }}>
            <div style={{ textAlign: 'center', minWidth: 140 }}>
              <div style={{
                fontSize: 56, fontWeight: 800,
                letterSpacing: '-0.04em', lineHeight: 1,
                color: pctColor, fontVariantNumeric: 'tabular-nums',
              }}>{pct}%</div>
              <div style={{
                fontSize: 12, color: 'var(--text-muted)', marginTop: 6,
                textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600,
              }}>Attendance (all-time)</div>
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>
                Attended {s.attended} of {s.total} session{s.total === 1 ? '' : 's'}
              </div>
              <div style={{
                height: 10, borderRadius: 5,
                background: 'var(--slate-100)', overflow: 'hidden',
              }}>
                <div style={{
                  width: `${pct}%`, height: '100%',
                  background: pctColor, borderRadius: 5,
                  transition: 'width 600ms var(--ease)',
                }} />
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))',
                gap: 10, marginTop: 16,
              }}>
                <StatMini label="Present" value={s.present} color="var(--success)" />
                <StatMini label="Late" value={s.late} color="var(--warning)" />
                <StatMini label="Absent" value={s.absent} color="var(--danger)" />
                <StatMini label="Excused" value={s.excused} color="var(--slate-500)" />
              </div>
            </div>
          </div>

          <h2 style={{ fontSize: 16, marginBottom: 12 }}>Session history</h2>
          <div className="stagger" style={{ display: 'grid', gap: 8 }}>
            {records.map((r) => {
              const meta = STATUS_META[r.status] || STATUS_META.absent;
              const isSelf = r.check_in_method === 'self';
              const isCancelled = r.session_cancelled === true;

              return (
                <div key={r.id} className="card" style={{
                  padding: '14px 16px',
                  display: 'flex', justifyContent: 'space-between',
                  alignItems: 'center', gap: 12, flexWrap: 'wrap',
                }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>
                      {r.session_title}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                      {new Date(r.session_date).toLocaleDateString(undefined, {
                        weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
                      })}
                      {r.session_course && ` · ${r.session_course}`}
                      {isSelf && (
                        <span style={{ marginLeft: 8, color: 'var(--success)', fontWeight: 600 }}>
                          · Self check-in
                        </span>
                      )}
                    </div>
                  </div>
                  {isCancelled ? (
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '4px 12px',
                      borderRadius: 'var(--radius-pill)',
                      background: 'var(--slate-100)',
                      color: 'var(--slate-500)',
                      fontSize: 12, fontWeight: 700,
                      flexShrink: 0,
                      textDecoration: 'line-through',
                    }}>
                      Class cancelled
                    </span>
                  ) : (
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '4px 12px',
                      borderRadius: 'var(--radius-pill)',
                      background: meta.bg, color: meta.color,
                      fontSize: 12, fontWeight: 700, flexShrink: 0,
                    }}>
                      {meta.icon} {meta.label}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function StatMini({ label, value, color }) {
  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{label}</div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// SEMESTER SUMMARY CARD
// ═════════════════════════════════════════════════════════════
function SemesterSummaryCard({ data }) {
  const sem = data.semester || {};
  const s = data.summary || {};
  const byCourse = data.by_course || [];

  const pct = s.percentage_vs_expected || 0;
  const pctColor =
    pct >= 75 ? 'var(--success)'
    : pct >= 60 ? 'var(--warning)'
    : 'var(--danger)';

  const progress = sem.progress || {};
  const progressPct = progress.percent || 0;

  const hasData = (s.expected_to_date || 0) > 0 || (s.recorded || 0) > 0;

  return (
    <div className="card" style={{
      padding: 24, marginBottom: 20,
      borderLeft: '3px solid var(--brand)',
      background: 'linear-gradient(180deg, #eff6ff 0%, #ffffff 60%)',
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'baseline', flexWrap: 'wrap', gap: 8,
        marginBottom: 16,
      }}>
        <div>
          <div style={{
            fontSize: 11, textTransform: 'uppercase',
            letterSpacing: '0.08em', color: 'var(--brand)',
            fontWeight: 700, marginBottom: 2,
          }}>Semester summary</div>
          <div style={{ fontSize: 14, color: 'var(--slate-600)' }}>
            {sem.name}
          </div>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {progress.start && progress.end
            ? `${new Date(progress.start).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} → ${new Date(progress.end).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
            : ''}
        </div>
      </div>

      {!hasData ? (
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
          No attendance data yet for this semester. Once classes begin, your stats will appear here.
        </p>
      ) : (
        <>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 24,
            flexWrap: 'wrap', marginBottom: 20,
          }}>
            <div style={{ textAlign: 'center', minWidth: 120 }}>
              <div style={{
                fontSize: 52, fontWeight: 800,
                letterSpacing: '-0.04em', lineHeight: 1,
                color: pctColor, fontVariantNumeric: 'tabular-nums',
              }}>{pct}%</div>
              <div style={{
                fontSize: 11, color: 'var(--text-muted)',
                marginTop: 6, textTransform: 'uppercase',
                letterSpacing: '0.06em', fontWeight: 600,
              }}>Semester attendance</div>
            </div>

            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontSize: 13, color: 'var(--slate-600)', marginBottom: 8 }}>
                Attended <strong>{s.attended}</strong> of <strong>{s.expected_to_date}</strong> expected so far
              </div>
              <div style={{
                height: 10, borderRadius: 5,
                background: 'var(--slate-100)', overflow: 'hidden',
                marginBottom: 6,
              }}>
                <div style={{
                  width: `${Math.min(100, pct)}%`, height: '100%',
                  background: pctColor, borderRadius: 5,
                  transition: 'width 600ms var(--ease)',
                }} />
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 16 }}>
                {s.expected_total} session{s.expected_total === 1 ? '' : 's'} total this semester
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(70px, 1fr))',
                gap: 10,
              }}>
                <SemMini label="Present" value={s.present} color="var(--success)" />
                <SemMini label="Late" value={s.late} color="var(--warning)" />
                <SemMini label="Absent" value={s.absent} color="var(--danger)" />
                <SemMini label="Excused" value={s.excused} color="var(--slate-500)" />
              </div>
            </div>
          </div>

          <div style={{ paddingTop: 16, borderTop: '1px solid var(--border)' }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              alignItems: 'baseline', fontSize: 11,
              color: 'var(--text-muted)', marginBottom: 6,
            }}>
              <span style={{ fontWeight: 600 }}>📅 Semester progress</span>
              <span>{progress.elapsed_days || 0} of {progress.total_days || 0} days ({progressPct}%)</span>
            </div>
            <div style={{
              height: 6, borderRadius: 3,
              background: 'var(--slate-100)', overflow: 'hidden',
            }}>
              <div style={{
                width: `${progressPct}%`, height: '100%',
                background: 'var(--slate-400)', borderRadius: 3,
              }} />
            </div>
          </div>

          {byCourse.length > 0 && (
            <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <div style={{
                fontSize: 11, textTransform: 'uppercase',
                letterSpacing: '0.08em', color: 'var(--text-muted)',
                fontWeight: 600, marginBottom: 12,
              }}>By course</div>
              <div style={{ display: 'grid', gap: 8 }}>
                {byCourse.map((c) => (
                  <div key={c.course_code} style={{
                    display: 'flex', justifyContent: 'space-between',
                    alignItems: 'center', gap: 12,
                    padding: '8px 12px',
                    background: 'var(--slate-50)',
                    borderRadius: 'var(--radius-sm)',
                    flexWrap: 'wrap',
                  }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{
                        fontSize: 13, fontWeight: 700,
                        fontFamily: 'var(--font-mono)',
                      }}>{c.course_code}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                        {c.attended} / {c.expected} attended
                      </div>
                    </div>
                    <span style={{
                      fontSize: 13, fontWeight: 700,
                      color:
                        c.percentage_vs_expected >= 75 ? 'var(--success)'
                        : c.percentage_vs_expected >= 60 ? 'var(--warning)'
                        : 'var(--danger)',
                      fontVariantNumeric: 'tabular-nums', flexShrink: 0,
                    }}>{c.percentage_vs_expected}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SemMini({ label, value, color }) {
  return (
    <div>
      <div style={{ fontSize: 18, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>{label}</div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// NEW SESSION FORM — used by reps (in StudentView) and admin
// ═════════════════════════════════════════════════════════════
function NewSessionForm({ onCreated, onCancel }) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    title: '',
    date: today,
    course_name: '',
    notes: '',
    check_in_window_minutes: 30,
    late_after_minutes: 15,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const payload = {
        title: form.title,
        date: form.date,
        course_name: form.course_name,
        notes: form.notes,
        self_check_in: true,   // always true — manual sessions auto-open
        check_in_window_minutes: Number(form.check_in_window_minutes),
        late_after_minutes: Number(form.late_after_minutes),
      };
      const created = await api.post('/attendance/sessions/', payload);
      onCreated(created);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  const LBL = { fontSize: 13, fontWeight: 500, color: 'var(--slate-700)', display: 'block' };

  return (
    <form
      onSubmit={submit}
      className="card"
      style={{
        padding: 20, marginBottom: 20,
        display: 'grid', gap: 12,
        borderLeft: '3px solid var(--brand)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700 }}>Create manual session</h3>
        <button
          type="button" onClick={onCancel}
          style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13, padding: 0 }}
        >
          Cancel ✕
        </button>
      </div>

      <p style={{
        fontSize: 12, color: 'var(--text-muted)',
        margin: 0, padding: '8px 12px',
        background: 'var(--slate-50)',
        borderLeft: '2px solid var(--brand)',
        borderRadius: 'var(--radius-sm)',
        lineHeight: 1.55,
      }}>
        Check-in will open <strong>immediately</strong>. Students (including you) mark themselves present. Only admins can correct records afterwards.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
        <label style={LBL}>
          Title *
          <input
            value={form.title} onChange={set('title')}
            required placeholder="e.g. CSC301 Lab Makeup"
            style={{ width: '100%', marginTop: 4 }}
          />
        </label>
        <label style={LBL}>
          Date *
          <input
            type="date" value={form.date} onChange={set('date')}
            required style={{ width: '100%', marginTop: 4 }}
          />
        </label>
      </div>

      <label style={LBL}>
        Course (optional)
        <input
          value={form.course_name} onChange={set('course_name')}
          placeholder="e.g. CSC301"
          style={{ width: '100%', marginTop: 4 }}
        />
      </label>

      <label style={LBL}>
        Notes (optional)
        <textarea
          value={form.notes} onChange={set('notes')}
          rows={2} placeholder="Topic covered, reason for makeup, etc."
          style={{ width: '100%', marginTop: 4 }}
        />
      </label>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <label style={LBL}>
          Check-in window (minutes)
          <input
            type="number" min={1} max={240}
            value={form.check_in_window_minutes}
            onChange={set('check_in_window_minutes')}
            style={{ width: '100%', marginTop: 4 }}
          />
        </label>
        <label style={LBL}>
          Late after (minutes)
          <input
            type="number" min={0} max={240}
            value={form.late_after_minutes}
            onChange={set('late_after_minutes')}
            style={{ width: '100%', marginTop: 4 }}
          />
        </label>
      </div>

      {err && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{err}</div>}

      <button
        type="submit" className="btn-primary" disabled={busy}
        style={{ justifySelf: 'start', padding: '9px 18px' }}
      >
        {busy ? 'Creating…' : 'Create & open check-in'}
      </button>
    </form>
  );
}

// ═════════════════════════════════════════════════════════════
// ADMIN VIEW — full marking control
// ═════════════════════════════════════════════════════════════
function AdminView({ canCreateSessions }) {
  const [sessions, setSessions] = useState([]);
  const [myData, setMyData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [busyCheckInId, setBusyCheckInId] = useState(null);
  const [flash, setFlash] = useState('');
  const now = useNow(1000);

  async function load() {
    setLoading(true);
    setErr('');
    try {
      const [s, me] = await Promise.all([
        api.get('/attendance/sessions/'),
        api.get('/attendance/me/').catch(() => null),
      ]);
      setSessions(s.results || []);
      setMyData(me);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function checkIn(sessionId) {
    setBusyCheckInId(sessionId);
    setErr('');
    setFlash('');
    try {
      const res = await api.post(`/attendance/sessions/${sessionId}/self-check-in/`);
      setFlash(
        res.status === 'late'
          ? 'Checked in — marked LATE.'
          : 'Checked in — marked present.'
      );
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusyCheckInId(null);
    }
  }

  async function downloadCsv() {
    setDownloading(true);
    setErr('');
    try {
      const token = getToken();
      const res = await fetch(`${API_BASE}/api/attendance/export/`, {
        headers: token ? { Authorization: `Token ${token}` } : {},
      });
      if (!res.ok) throw new Error(`Download failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `attendance-report-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErr(e.message);
    } finally {
      setDownloading(false);
    }
  }

  const activeCheckIns = myData?.active_check_ins || [];

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Admin"
        title="Attendance"
        subtitle="Manage class attendance. Corrections are allowed at any time."
        actions={
          <>
            <button onClick={downloadCsv} disabled={downloading} style={{ padding: '9px 16px' }}>
              {downloading ? '⏳ Preparing…' : '📥 Download report'}
            </button>
            {canCreateSessions && !showNewForm && (
              <button
                onClick={() => setShowNewForm(true)}
                className="btn-primary"
                style={{ padding: '9px 16px' }}
              >
                ＋ Create session
              </button>
            )}
          </>
        }
      />

      {showNewForm && (
        <NewSessionForm
          onCreated={() => {
            setShowNewForm(false);
            setMsg('Session created.');
            load();
          }}
          onCancel={() => setShowNewForm(false)}
        />
      )}

      {/* Self check-in banners for admin who has records */}
      {activeCheckIns.length > 0 && (
        <div style={{ display: 'grid', gap: 10, marginBottom: 20 }}>
          {activeCheckIns.map((session) => {
            const closesMs = new Date(session.check_in_closes_at).getTime();
            const remaining = closesMs - now;
            const urgent = remaining < 60_000;
            return (
              <div key={session.id} style={{
                padding: 20, borderRadius: 'var(--radius)',
                background: urgent
                  ? 'linear-gradient(135deg, #fee2e2 0%, #ffffff 100%)'
                  : 'linear-gradient(135deg, #dcfce7 0%, #ffffff 100%)',
                border: `1px solid ${urgent ? '#fecaca' : '#bbf7d0'}`,
                borderLeft: `4px solid ${urgent ? 'var(--danger)' : 'var(--success)'}`,
              }}>
                <div style={{
                  display: 'flex', justifyContent: 'space-between',
                  alignItems: 'flex-start', gap: 12, flexWrap: 'wrap',
                }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{
                      fontSize: 11, fontWeight: 700,
                      textTransform: 'uppercase', letterSpacing: '0.06em',
                      color: urgent ? 'var(--danger)' : 'var(--success)',
                      marginBottom: 4,
                    }}>🔔 Your check-in · {session.title}</div>
                    <div style={{ fontSize: 13, color: 'var(--slate-600)' }}>
                      {session.course_name || 'No course'}
                    </div>
                    <div style={{
                      fontSize: 13, marginTop: 8, fontWeight: 600,
                      color: urgent ? 'var(--danger)' : 'var(--slate-700)',
                      fontVariantNumeric: 'tabular-nums',
                    }}>⏱ Closes in {formatCountdown(remaining)}</div>
                  </div>
                  <button
                    onClick={() => checkIn(session.id)}
                    disabled={busyCheckInId === session.id || remaining <= 0}
                    className="btn-primary"
                    style={{ padding: '12px 24px', fontSize: 15, fontWeight: 700 }}
                  >
                    {busyCheckInId === session.id ? 'Checking in…' : "I'm here ✓"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {flash && (
        <div style={{
          padding: '12px 16px', background: 'var(--success-bg)',
          color: 'var(--success)', borderRadius: 'var(--radius-sm)',
          fontSize: 14, marginBottom: 16, border: '1px solid #bbf7d0',
        }}>{flash}</div>
      )}

      {err && (
        <div style={{
          padding: '12px 16px', background: 'var(--danger-bg)',
          color: 'var(--danger)', borderRadius: 'var(--radius-sm)',
          fontSize: 14, marginBottom: 16, border: '1px solid #fecaca',
        }}>{err}</div>
      )}

      {msg && (
        <div style={{
          padding: '12px 16px', background: 'var(--success-bg)',
          color: 'var(--success)', borderRadius: 'var(--radius-sm)',
          fontSize: 14, marginBottom: 16, border: '1px solid #bbf7d0',
        }}>{msg}</div>
      )}

      <div className="stats-row" style={{ marginBottom: 20 }}>
        <StatCard icon="📅" label="Total sessions" value={sessions.length} />
        <StatCard icon="👥" label="Students tracked" value={sessions[0]?.record_count ?? 0} />
        <StatCard icon="✓" label="Latest present" value={sessions[0]?.present_count ?? 0} accent="var(--success)" />
        <StatCard icon="⏱" label="Self check-ins" value={sessions.reduce((sum, s) => sum + (s.self_check_in_count || 0), 0)} accent="var(--brand)" />
      </div>

      {loading && (
        <div style={{ display: 'grid', placeItems: 'center', padding: 40 }}>
          <span className="spinner spinner-dark" style={{ width: 26, height: 26, borderWidth: 3 }} />
        </div>
      )}

      {!loading && sessions.length === 0 && (
        <EmptyState
          icon="📅"
          title="No attendance sessions yet"
          body="Create a session above, or add courses to the timetable — sessions open automatically at class time."
        />
      )}

      {!loading && sessions.length > 0 && (
        <div className="stagger" style={{ display: 'grid', gap: 10 }}>
          {sessions.map((s) => (
            <SessionCard
              key={s.id}
              session={s}
              isOpen={selectedId === s.id}
              onToggle={() => setSelectedId(selectedId === s.id ? null : s.id)}
              onSaved={(m) => { setMsg(m); load(); }}
              onError={(m) => setErr(m)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SessionCard({ session, isOpen, onToggle, onSaved, onError }) {
  const now = useNow(1000);

  const isSelfMode = session.self_check_in;
  const windowOpen = session.check_in_open;
  const windowEnded = session.check_in_closes_at
    ? new Date(session.check_in_closes_at).getTime() <= now
    : false;
  const remainingMs = session.check_in_closes_at
    ? new Date(session.check_in_closes_at).getTime() - now
    : 0;

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%', padding: '16px 20px',
          background: isOpen ? 'var(--slate-50)' : '#fff',
          border: 'none', cursor: 'pointer', textAlign: 'left',
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', gap: 12, flexWrap: 'wrap',
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{
            fontWeight: 700, fontSize: 15, marginBottom: 4,
            display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
          }}>
            {session.title}
            {session.cancelled && (
              <span className="badge" style={{
                fontSize: 10, background: 'var(--slate-100)',
                color: 'var(--slate-500)', fontWeight: 700,
                textDecoration: 'line-through',
              }}>CANCELLED</span>
            )}
            {isSelfMode && !session.cancelled && (
              <span className="badge" style={{
                fontSize: 10,
                background: windowOpen ? 'var(--success)' : 'var(--slate-100)',
                color: windowOpen ? '#fff' : 'var(--slate-600)',
                fontWeight: 700,
              }}>
                {windowOpen ? '● LIVE' : windowEnded ? '🔒 CLOSED' : 'self check-in'}
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {new Date(session.date).toLocaleDateString(undefined, {
              weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
            })}
            {session.course_name && ` · ${session.course_name}`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center', flexWrap: 'wrap' }}>
          {isSelfMode && session.record_count > 0 && (
            <span className="badge badge-neutral" style={{ fontSize: 11 }}>
              {session.self_check_in_count}/{session.record_count} self-checked
            </span>
          )}
          <span className="badge badge-success" style={{ fontSize: 11 }}>
            {session.present_count}/{session.record_count} present
          </span>
          {session.absent_count > 0 && (
            <span className="badge badge-danger" style={{ fontSize: 11 }}>
              {session.absent_count} absent
            </span>
          )}
          <span style={{ color: 'var(--slate-400)', fontSize: 12 }}>
            {isOpen ? '▲' : '▼'}
          </span>
        </div>
      </button>

      {isOpen && (
        <>
          {isSelfMode && !session.cancelled && (
            <div style={{
              padding: '12px 20px',
              background: windowOpen ? '#f0fdf4' : windowEnded ? '#fef3c7' : 'var(--slate-50)',
              borderTop: '1px solid var(--border)',
            }}>
              {windowOpen ? (
                <div style={{ fontSize: 13, color: 'var(--success)', fontWeight: 600 }}>
                  ● Check-in open · Closes in {formatCountdown(remainingMs)}
                </div>
              ) : windowEnded ? (
                <div style={{ fontSize: 13, color: 'var(--warning)', fontWeight: 600 }}>
                  🔒 Check-in closed · Admin can still correct records
                </div>
              ) : (
                <div style={{ fontSize: 13, color: 'var(--slate-600)' }}>
                  Check-in window not yet opened.
                </div>
              )}
            </div>
          )}

          <SessionEditor
            sessionId={session.id}
            onSaved={onSaved}
            onError={onError}
          />
        </>
      )}
    </div>
  );
}

function SessionEditor({ sessionId, onSaved, onError }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    api.get(`/attendance/sessions/${sessionId}/`)
      .then((d) => setRecords(d.records || []))
      .catch((e) => onError(e.message))
      .finally(() => setLoading(false));
  }, [sessionId]);

  function setStatus(userId, newStatus) {
    setRecords((prev) =>
      prev.map((r) => r.user_id === userId ? { ...r, status: newStatus } : r)
    );
    setDirty(true);
  }

  function markAll(status) {
    setRecords((prev) => prev.map((r) => ({ ...r, status })));
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    try {
      await api.post(`/attendance/sessions/${sessionId}/mark/`, {
        records: records.map((r) => ({
          user_id: r.user_id,
          status: r.status,
          note: r.note,
        })),
      });
      setDirty(false);
      onSaved('Attendance saved.');
    } catch (e) {
      onError(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <span className="spinner spinner-dark" style={{ width: 20, height: 20, borderWidth: 2 }} />
      </div>
    );
  }

  return (
    <div style={{ padding: '0 20px 20px', borderTop: '1px solid var(--border)' }}>
      <div style={{
        display: 'flex', gap: 8,
        marginTop: 16, marginBottom: 14,
        flexWrap: 'wrap', alignItems: 'center',
      }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
          Quick mark all:
        </span>
        <button
          onClick={() => markAll('present')}
          style={{
            padding: '5px 12px', fontSize: 12,
            borderRadius: 'var(--radius-pill)',
            background: 'var(--success-bg)', color: 'var(--success)',
            border: 'none', cursor: 'pointer', fontWeight: 600,
          }}
        >All present</button>
        <button
          onClick={() => markAll('absent')}
          style={{
            padding: '5px 12px', fontSize: 12,
            borderRadius: 'var(--radius-pill)',
            background: 'var(--danger-bg)', color: 'var(--danger)',
            border: 'none', cursor: 'pointer', fontWeight: 600,
          }}
        >All absent</button>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
          Your changes override self check-ins.
        </span>
      </div>

      <div style={{ display: 'grid', gap: 6 }}>
        {records.map((r) => {
          const isSelf = r.check_in_method === 'self';
          const meta = STATUS_META[r.status] || STATUS_META.absent;
          const avatarSrc = r.avatar_url
            ? `${apiUrl(r.avatar_url)}?token=${getToken()}`
            : null;
          const initials = (r.user_name || '?').slice(0, 2).toUpperCase();

          return (
            <div key={r.user_id} style={{
              display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', gap: 12,
              padding: '10px 12px',
              background: 'var(--slate-50)',
              borderRadius: 'var(--radius-sm)',
              flexWrap: 'wrap',
            }}>
              <div style={{
                display: 'flex', gap: 10, alignItems: 'center',
                flex: 1, minWidth: 0,
              }}>
                <RecordAvatar src={avatarSrc} initials={initials} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{r.user_name}</div>
                  {r.reference_number && (
                    <div style={{
                      fontSize: 11, color: 'var(--text-muted)',
                      fontFamily: 'var(--font-mono)',
                    }}>{r.reference_number}</div>
                  )}
                  {isSelf && r.marked_at && (
                    <div style={{
                      fontSize: 10, color: 'var(--success)',
                      fontWeight: 600, marginTop: 2,
                    }}>
                      ✓ Self check-in at{' '}
                      {new Date(r.marked_at).toLocaleTimeString([], {
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </div>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {Object.entries(STATUS_META).map(([key, m]) => {
                  const active = r.status === key;
                  return (
                    <button
                      key={key}
                      onClick={() => setStatus(r.user_id, key)}
                      style={{
                        padding: '5px 10px', fontSize: 11, fontWeight: 600,
                        borderRadius: 'var(--radius-pill)',
                        border: '1px solid',
                        borderColor: active ? m.color : 'var(--border)',
                        background: active ? m.bg : '#fff',
                        color: active ? m.color : 'var(--slate-500)',
                        cursor: 'pointer',
                      }}
                    >
                      {m.label}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{
        marginTop: 16, display: 'flex', gap: 8,
        alignItems: 'center', justifyContent: 'flex-end',
      }}>
        {dirty && (
          <span style={{ fontSize: 12, color: 'var(--warning)', fontWeight: 500 }}>
            Unsaved changes
          </span>
        )}
        <button
          onClick={save}
          disabled={!dirty || saving}
          className="btn-primary"
          style={{ padding: '9px 18px' }}
        >
          {saving ? 'Saving…' : 'Save attendance'}
        </button>
      </div>
    </div>
  );
}

function RecordAvatar({ src, initials }) {
  return (
    <div style={{
      width: 36, height: 36, borderRadius: '50%',
      background: src ? 'var(--slate-200)' : 'var(--brand)',
      color: '#fff',
      display: 'grid', placeItems: 'center',
      fontSize: 12, fontWeight: 700, textTransform: 'uppercase',
      overflow: 'hidden', flexShrink: 0,
    }}>
      {src ? (
        <img
          src={src} alt=""
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      ) : initials}
    </div>
  );
} 