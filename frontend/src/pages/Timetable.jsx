import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { PageHeader, EmptyState, InfoCard } from '../components/PageUI';
import { useAutoRefresh, AUTO_REFRESH_MS } from '../hooks/useAutoRefresh';

// ─────────────────────────────────────────────────────────────
// Weekdays only
// ─────────────────────────────────────────────────────────────
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

const LBL = { fontSize: 13, fontWeight: 500, color: 'var(--slate-700)', display: 'block' };
const FIELD = { width: '100%', marginTop: 4 };

const BLANK_FORM = {
  course_code: '',
  course_title: '',
  day_of_week: 0,
  start_time: '08:00',
  end_time: '10:00',
  room: '',
  lecturer: '',
  check_in_starts_minutes_before: 5,
  check_in_ends_minutes_after: 15,
  late_after_minutes: 10,
  latitude: '',
  longitude: '',
  geofence_radius_meters: 150,
  require_location: true,
};

// Per-course color palette — hash of course_code → stable hue
const COLORS = [
  { bg: '#dbeafe', border: '#93c5fd', text: '#1e40af', dot: '#3b82f6' },
  { bg: '#dcfce7', border: '#86efac', text: '#166534', dot: '#22c55e' },
  { bg: '#fef3c7', border: '#fcd34d', text: '#92400e', dot: '#f59e0b' },
  { bg: '#fce7f3', border: '#f9a8d4', text: '#9f1239', dot: '#ec4899' },
  { bg: '#ede9fe', border: '#c4b5fd', text: '#6d28d9', dot: '#8b5cf6' },
  { bg: '#cffafe', border: '#67e8f9', text: '#0e7490', dot: '#06b6d4' },
  { bg: '#fee2e2', border: '#fca5a5', text: '#991b1b', dot: '#ef4444' },
];

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
function computeTodayIndex() {
  const js = new Date().getDay();
  return js >= 1 && js <= 5 ? js - 1 : -1;
}

function dayName(i) {
  return DAYS[i] || `Day ${i}`;
}

function formatCoord(n) {
  if (n === null || n === undefined || n === '') return null;
  const num = Number(n);
  if (Number.isNaN(num)) return null;
  return num.toFixed(5);
}

function colorForCourse(code) {
  if (!code) return COLORS[0];
  let hash = 0;
  for (let i = 0; i < code.length; i += 1) {
    hash = (hash << 5) - hash + code.charCodeAt(i);
    hash |= 0;
  }
  return COLORS[Math.abs(hash) % COLORS.length];
}

function entryTimeline(entry, now, todayIdx) {
  if (entry.day_of_week !== todayIdx) return null;
  const [sh, sm] = entry.start_time.split(':').map(Number);
  const [eh, em] = entry.end_time.split(':').map(Number);
  const start = new Date(now);
  start.setHours(sh, sm, 0, 0);
  const end = new Date(now);
  end.setHours(eh, em, 0, 0);
  const windowOpen = new Date(
    start.getTime() - entry.check_in_starts_minutes_before * 60_000,
  );
  const windowClose = new Date(
    end.getTime() + entry.check_in_ends_minutes_after * 60_000,
  );
  return { start, end, windowOpen, windowClose };
}

function getStatus(entry, now, todayIdx) {
  const tl = entryTimeline(entry, now, todayIdx);
  if (!tl) return { kind: 'other-day' };
  if (now >= tl.end) return { kind: 'past' };
  if (now >= tl.start) {
    const minutesLeft = Math.max(1, Math.round((tl.end - now) / 60_000));
    return { kind: 'now', minutesLeft, tl };
  }
  const minutesToStart = Math.max(1, Math.round((tl.start - now) / 60_000));
  return {
    kind: 'upcoming',
    minutesToStart,
    checkInOpen: now >= tl.windowOpen && now < tl.windowClose,
    tl,
  };
}

function findNextClass(entries, now, todayIdx) {
  if (todayIdx === -1) return null;
  const todays = entries
    .filter((e) => e.day_of_week === todayIdx)
    .sort((a, b) => (a.start_time > b.start_time ? 1 : -1));

  for (const e of todays) {
    const tl = entryTimeline(e, now, todayIdx);
    if (tl && tl.end > now) {
      return {
        entry: e,
        status: getStatus(e, now, todayIdx),
        tl,
      };
    }
  }
  return null;
}

function shortTime(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour12} ${suffix}` : `${hour12}:${String(m).padStart(2, '0')} ${suffix}`;
}

// ─────────────────────────────────────────────────────────────
// Live clock — 1s tick for status labels
// ─────────────────────────────────────────────────────────────
function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

// ─────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────
export default function Timetable() {
  const { user } = useAuth();
  const isRep = user?.is_class_rep === true;

  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(BLANK_FORM);
  const [busy, setBusy] = useState(false);

  const now = useNow(1000);
  const todayIndex = computeTodayIndex();

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) { setLoading(true); setErr(''); }
    try {
      const d = await api.get('/attendance/timetable/');
      setEntries(d.results || []);
    } catch (e) {
      if (!silent) setErr(e.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useAutoRefresh(() => load({ silent: true }), AUTO_REFRESH_MS);

  // Auto-dismiss the success message
  useEffect(() => {
    if (!msg) return;
    const id = setTimeout(() => setMsg(''), 4000);
    return () => clearTimeout(id);
  }, [msg]);

  const byDay = useMemo(() => {
    const map = {};
    entries.forEach((e) => {
      if (!map[e.day_of_week]) map[e.day_of_week] = [];
      map[e.day_of_week].push(e);
    });
    Object.keys(map).forEach((k) => {
      map[k].sort((a, b) => (a.start_time > b.start_time ? 1 : -1));
    });
    return map;
  }, [entries]);

  const nextClass = useMemo(
    () => findNextClass(entries, now, todayIndex),
    [entries, now, todayIndex],
  );

  const dayTotals = useMemo(() => {
    return DAYS.map((_, i) => (byDay[i] || []).length);
  }, [byDay]);

  function openCreate() {
    setEditingId(null);
    setForm(BLANK_FORM);
    setShowForm(true);
    setErr('');
    setMsg('');
  }

  function openEdit(entry) {
    setEditingId(entry.id);
    setForm({
      course_code: entry.course_code,
      course_title: entry.course_title || '',
      day_of_week: entry.day_of_week,
      start_time: entry.start_time,
      end_time: entry.end_time,
      room: entry.room || '',
      lecturer: entry.lecturer || '',
      check_in_starts_minutes_before: entry.check_in_starts_minutes_before,
      check_in_ends_minutes_after: entry.check_in_ends_minutes_after,
      late_after_minutes: entry.late_after_minutes,
      latitude: entry.latitude ?? '',
      longitude: entry.longitude ?? '',
      geofence_radius_meters: entry.geofence_radius_meters ?? 150,
      require_location: entry.require_location !== false,
    });
    setShowForm(true);
    setErr('');
    setMsg('');
  }

  function closeForm() {
    if (busy) return;
    setShowForm(false);
    setEditingId(null);
    setForm(BLANK_FORM);
    setErr('');
  }

  async function submit(e) {
    e.preventDefault();
    setErr('');
    setMsg('');
    setBusy(true);
    try {
      const payload = {
        ...form,
        day_of_week: Number(form.day_of_week),
        check_in_starts_minutes_before: Number(form.check_in_starts_minutes_before),
        check_in_ends_minutes_after: Number(form.check_in_ends_minutes_after),
        late_after_minutes: Number(form.late_after_minutes),
        geofence_radius_meters: Number(form.geofence_radius_meters),
        latitude:
          form.latitude === '' || form.latitude === null
            ? null
            : Number(form.latitude),
        longitude:
          form.longitude === '' || form.longitude === null
            ? null
            : Number(form.longitude),
      };

      if (editingId) {
        await api.patch(`/attendance/timetable/${editingId}/`, payload);
        setMsg(`Updated ${form.course_code}.`);
      } else {
        await api.post('/attendance/timetable/', payload);
        setMsg(`Added ${form.course_code} to the timetable.`);
      }
      setShowForm(false);
      setEditingId(null);
      setForm(BLANK_FORM);
      await load({ silent: true });
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteEntry(entry) {
    if (
      !confirm(
        `Delete "${entry.course_code}" on ${dayName(entry.day_of_week)}?\n\n` +
          `Future attendance sessions for this course will also be removed. Existing records are preserved.`,
      )
    )
      return;

    setErr('');
    setMsg('');
    try {
      await api.del(`/attendance/timetable/${entry.id}/`);
      setMsg(`Removed ${entry.course_code} from the timetable.`);
      await load({ silent: true });
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Weekly schedule"
        title="Timetable"
        subtitle={
          isRep
            ? 'Set class times and classroom locations — attendance windows and GPS checks open automatically.'
            : 'Your weekly class schedule. Check-in opens automatically at each class time.'
        }
        actions={
          isRep && !showForm ? (
            <button
              onClick={openCreate}
              className="btn-primary"
              style={{
                padding: '9px 16px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              ＋ Add course
            </button>
          ) : null
        }
      />

      {!isRep && (
        <div style={{
          padding: '12px 16px', background: '#dbeafe', color: '#1e40af',
          borderRadius: 'var(--radius-sm)', fontSize: 13, marginBottom: 16,
          border: '1px solid #bfdbfe', display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span>ℹ</span>
          <span>
            <strong>Read-only.</strong> Only the class rep can manage the timetable.
          </span>
        </div>
      )}

      {msg && (
        <div style={{
          padding: '10px 14px', background: 'var(--success-bg)', color: 'var(--success)',
          borderRadius: 'var(--radius-sm)', fontSize: 14, marginBottom: 16,
          border: '1px solid #bbf7d0', display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span>✓</span><span>{msg}</span>
        </div>
      )}

      {err && !showForm && (
        <div role="alert" style={{
          padding: '10px 14px', background: 'var(--danger-bg)', color: 'var(--danger)',
          borderRadius: 'var(--radius-sm)', fontSize: 14, marginBottom: 16,
          border: '1px solid #fecaca',
        }}>{err}</div>
      )}

      {loading && (
        <div style={{ display: 'grid', placeItems: 'center', padding: 40 }}>
          <span className="spinner spinner-dark" style={{ width: 26, height: 26, borderWidth: 3 }} />
        </div>
      )}

      {!loading && entries.length === 0 && (
        <EmptyState
          icon="📅"
          title="No timetable yet"
          body={
            isRep
              ? 'Add your first course above to start auto-opening attendance windows.'
              : "Your course rep hasn't set up the timetable yet. Check back soon."
          }
        />
      )}

      {!loading && entries.length > 0 && (
        <div style={{ display: 'grid', gap: 20 }}>
          {/* ── Next class hero ────────────────────────── */}
          {nextClass && (
            <NextClassHero
              nextClass={nextClass}
              now={now}
              showCheckInLink
            />
          )}

          {/* ── Weekend banner (no classes today) ──────── */}
          {todayIndex === -1 && (
            <div style={{
              padding: '14px 18px',
              background: 'linear-gradient(135deg, #f8fafc 0%, #ffffff 100%)',
              border: '1px solid var(--border)',
              borderLeft: '3px solid var(--slate-400)',
              borderRadius: 'var(--radius)',
              display: 'flex', gap: 12, alignItems: 'center',
            }}>
              <span style={{ fontSize: 22 }}>🌤</span>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>No classes today</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  Enjoy the break — check back Monday.
                </div>
              </div>
            </div>
          )}

          {/* ── Week-at-a-glance strip ────────────────── */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
            gap: 8,
          }}>
            {DAYS.map((d, i) => {
              const isToday = i === todayIndex;
              const count = dayTotals[i];
              return (
                <div
                  key={d}
                  style={{
                    padding: '10px 12px',
                    background: isToday ? 'var(--brand)' : '#fff',
                    color: isToday ? '#fff' : 'var(--slate-700)',
                    border: `1px solid ${isToday ? 'var(--brand)' : 'var(--border)'}`,
                    borderRadius: 10,
                    textAlign: 'center',
                    minWidth: 0,
                  }}
                >
                  <div style={{
                    fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    opacity: isToday ? 0.85 : 0.6,
                  }}>
                    {d.slice(0, 3)}
                  </div>
                  <div style={{
                    fontSize: 18, fontWeight: 700, marginTop: 3,
                    fontVariantNumeric: 'tabular-nums',
                    opacity: count === 0 ? 0.35 : 1,
                  }}>
                    {count}
                  </div>
                  <div style={{
                    fontSize: 9,
                    opacity: isToday ? 0.75 : 0.5,
                    marginTop: 1,
                  }}>
                    {count === 0 ? 'free' : count === 1 ? 'class' : 'classes'}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Day cards ─────────────────────────────── */}
          <div style={{ display: 'grid', gap: 14 }}>
            {DAYS.map((dayLabel, idx) => {
              const dayEntries = byDay[idx] || [];
              const isToday = idx === todayIndex;

              return (
                <div
                  key={dayLabel}
                  style={{
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                    borderLeft: isToday
                      ? '3px solid var(--brand)'
                      : '1px solid var(--border)',
                    borderRadius: 'var(--radius)',
                    overflow: 'hidden',
                  }}
                >
                  <div style={{
                    padding: '12px 18px',
                    background: isToday ? 'var(--slate-50)' : '#fff',
                    borderBottom: dayEntries.length > 0 ? '1px solid var(--border)' : 'none',
                    display: 'flex', justifyContent: 'space-between',
                    alignItems: 'center', gap: 8, flexWrap: 'wrap',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{dayLabel}</span>
                      {isToday && (
                        <span className="badge badge-warning" style={{ fontSize: 10 }}>
                          TODAY
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {dayEntries.length === 0
                        ? 'No classes'
                        : `${dayEntries.length} class${dayEntries.length === 1 ? '' : 'es'}`}
                    </span>
                  </div>

                  {dayEntries.length === 0 ? (
                    <div style={{
                      padding: '14px 18px', fontSize: 13,
                      color: 'var(--text-muted)', fontStyle: 'italic',
                    }}>
                      No classes scheduled
                    </div>
                  ) : (
                    <div>
                      {dayEntries.map((e, i) => (
                        <EntryRow
                          key={e.id}
                          entry={e}
                          isFirst={i === 0}
                          isRep={isRep}
                          now={now}
                          todayIndex={todayIndex}
                          onEdit={() => openEdit(e)}
                          onDelete={() => deleteEntry(e)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {isRep && (
            <InfoCard title="How auto check-in works">
              <ul style={{
                margin: 0, paddingLeft: 18, fontSize: 13,
                color: 'var(--slate-600)', lineHeight: 1.7,
              }}>
                <li>Each course opens a check-in window <strong>5 minutes before</strong> class start time.</li>
                <li>Students tap <strong>"I'm here"</strong> on their own phone.</li>
                <li>If <strong>classroom coordinates</strong> are set, students must be within the geofence radius to check in.</li>
                <li>Check-in closes <strong>15 minutes after</strong> class ends.</li>
                <li>Late arrivals (after 10 minutes) are marked <strong>Late</strong>.</li>
                <li>Only the admin can correct attendance records after check-in.</li>
              </ul>
            </InfoCard>
          )}
        </div>
      )}

      {/* ── Form modal ───────────────────────────────── */}
      {showForm &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            style={{
              position: 'fixed', inset: 0,
              background: 'rgba(15, 23, 42, 0.55)',
              backdropFilter: 'blur(6px)',
              WebkitBackdropFilter: 'blur(6px)',
              zIndex: 9999,
              display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
              paddingTop: 'max(5vh, 32px)', paddingLeft: 16, paddingRight: 16,
              paddingBottom: 24, overflowY: 'auto',
              animation: 'ttFadeIn 200ms ease-out',
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget && !busy) closeForm();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && !busy) closeForm();
            }}
          >
            <div style={{
              background: '#fff',
              borderRadius: 20,
              width: '100%',
              maxWidth: 640,
              padding: '22px 22px 24px',
              boxShadow: '0 24px 60px rgba(15,23,42,0.28), 0 8px 20px rgba(15,23,42,0.12)',
              display: 'grid',
              gap: 16,
              animation: 'ttSlideDown 280ms cubic-bezier(0.2, 0.8, 0.2, 1)',
            }}>
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', gap: 8,
              }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em' }}>
                    {editingId ? `Edit ${form.course_code || 'class'}` : 'Add a course to the timetable'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    Attendance opens automatically at each class time.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeForm}
                  disabled={busy}
                  style={{
                    width: 32, height: 32, borderRadius: 8,
                    background: 'var(--slate-100)', border: 'none',
                    cursor: busy ? 'not-allowed' : 'pointer',
                    display: 'grid', placeItems: 'center',
                    fontSize: 14, color: 'var(--slate-600)', flexShrink: 0,
                  }}
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>

              <TimetableForm
                form={form}
                setForm={setForm}
                editing={!!editingId}
                busy={busy}
                err={err}
                onSubmit={submit}
                onCancel={closeForm}
              />
            </div>
            <style>{`
              @keyframes ttFadeIn { from { opacity: 0; } to { opacity: 1; } }
              @keyframes ttSlideDown {
                from { opacity: 0; transform: translateY(-16px); }
                to   { opacity: 1; transform: translateY(0); }
              }
            `}</style>
          </div>,
          document.body,
        )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Next-class hero
// ─────────────────────────────────────────────────────────────
function NextClassHero({ nextClass, showCheckInLink }) {
  const { entry, status } = nextClass;
  const color = colorForCourse(entry.course_code);
  const isNow = status.kind === 'now';
  const checkInOpen = isNow || status.checkInOpen;

  return (
    <div style={{
      padding: '20px 22px',
      borderRadius: 'var(--radius-lg, 14px)',
      border: `1px solid ${isNow ? '#86efac' : color.border}`,
      background: isNow
        ? 'linear-gradient(135deg, #f0fdf4 0%, #ffffff 100%)'
        : `linear-gradient(135deg, ${color.bg} 0%, #ffffff 100%)`,
      borderLeft: `4px solid ${isNow ? 'var(--success)' : color.dot}`,
      display: 'flex', justifyContent: 'space-between',
      alignItems: 'center', gap: 16, flexWrap: 'wrap',
    }}>
      <div style={{ minWidth: 0, flex: '1 1 260px' }}>
        <div style={{
          fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: isNow ? 'var(--success)' : color.text,
          marginBottom: 6,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          {isNow ? (
            <>
              <span style={{
                width: 8, height: 8, borderRadius: '50%',
                background: 'var(--success)',
                animation: 'ttPulse 2s ease-in-out infinite',
              }} />
              IN PROGRESS
            </>
          ) : (
            <>▶ NEXT CLASS</>
          )}
        </div>
        <div style={{
          fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em',
          lineHeight: 1.2, overflowWrap: 'anywhere',
        }}>
          <span style={{ fontFamily: 'var(--font-mono)' }}>{entry.course_code}</span>
          {entry.course_title && (
            <span style={{
              fontSize: 15, fontWeight: 500,
              color: 'var(--slate-600)', marginLeft: 8,
            }}>
              · {entry.course_title}
            </span>
          )}
        </div>
        <div style={{
          fontSize: 13, color: 'var(--slate-600)',
          marginTop: 8, display: 'flex', gap: 14, flexWrap: 'wrap',
        }}>
          <span>🕐 {shortTime(entry.start_time)} – {shortTime(entry.end_time)}</span>
          {entry.room && <span>📍 {entry.room}</span>}
          {entry.lecturer && <span>👤 {entry.lecturer}</span>}
        </div>
        <div style={{
          fontSize: 13, fontWeight: 600, marginTop: 10,
          color: isNow ? 'var(--success)' : color.text,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {isNow
            ? `Ends in ${status.minutesLeft} min`
            : `Starts in ${status.minutesToStart} min`}
        </div>
      </div>

      {showCheckInLink && checkInOpen && (
        <Link to="/attendance" style={{
          padding: '12px 22px',
          borderRadius: 'var(--radius-sm)',
          background: 'var(--success)',
          color: '#fff',
          fontSize: 14, fontWeight: 700,
          textDecoration: 'none',
          whiteSpace: 'nowrap',
          flexShrink: 0,
          boxShadow: '0 4px 14px rgba(34,197,94,0.3)',
        }}>
          Check in now →
        </Link>
      )}
      <style>{`
        @keyframes ttPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(34,197,94,0.6); }
          50%      { box-shadow: 0 0 0 6px rgba(34,197,94,0); }
        }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Entry row (inside a day card)
// ─────────────────────────────────────────────────────────────
function EntryRow({ entry, isFirst, isRep, now, todayIndex, onEdit, onDelete }) {
  const color = colorForCourse(entry.course_code);
  const status = getStatus(entry, now, todayIndex);
  const hasGps =
    entry.latitude !== null &&
    entry.latitude !== undefined &&
    entry.longitude !== null &&
    entry.longitude !== undefined;

  const isNow = status.kind === 'now';
  const isPast = status.kind === 'past';

  return (
    <div
      style={{
        padding: '14px 18px',
        borderTop: isFirst ? 'none' : '1px solid var(--border)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap',
        minWidth: 0,
        background: isNow ? 'rgba(34,197,94,0.04)' : 'transparent',
        opacity: isPast ? 0.65 : 1,
        transition: 'opacity 200ms, background 200ms',
      }}
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flex: '1 1 240px', minWidth: 0 }}>
        {/* Time chip */}
        <div style={{
          padding: '8px 10px',
          borderRadius: 8,
          background: color.bg,
          color: color.text,
          fontSize: 11,
          fontWeight: 700,
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '0.02em',
          whiteSpace: 'nowrap',
          flexShrink: 0,
          lineHeight: 1.35,
          textAlign: 'center',
          minWidth: 64,
        }}>
          <div>{entry.start_time}</div>
          <div style={{ opacity: 0.65, fontWeight: 500 }}>{entry.end_time}</div>
        </div>

        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{
            display: 'flex', gap: 8, alignItems: 'center',
            flexWrap: 'wrap', lineHeight: 1.35,
          }}>
            <span style={{
              fontSize: 14, fontWeight: 700,
              fontFamily: 'var(--font-mono)', letterSpacing: '0.02em',
              overflowWrap: 'anywhere',
            }}>
              {entry.course_code}
            </span>
            {entry.course_title && (
              <span style={{
                fontSize: 13, color: 'var(--slate-600)',
                overflowWrap: 'anywhere',
              }}>
                {entry.course_title}
              </span>
            )}
            {isNow && (
              <span className="badge badge-success" style={{
                fontSize: 10,
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}>
                <span style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: 'currentColor',
                }} />
                IN PROGRESS
              </span>
            )}
            {status.kind === 'upcoming' && status.checkInOpen && (
              <span className="badge badge-success" style={{ fontSize: 10 }}>
                Check-in open
              </span>
            )}
            {hasGps ? (
              <span className="badge badge-success" style={{ fontSize: 10 }}
                title={`GPS verified within ${entry.geofence_radius_meters}m`}>
                📍 GPS
              </span>
            ) : entry.require_location ? (
              <span className="badge badge-warning" style={{ fontSize: 10 }}
                title="Coordinates not set — location check disabled">
                📍 No coords
              </span>
            ) : (
              <span className="badge badge-neutral" style={{ fontSize: 10 }}
                title="GPS check disabled">
                📍 Off
              </span>
            )}
          </div>
          <div style={{
            fontSize: 12, color: 'var(--text-muted)',
            marginTop: 4, display: 'flex', gap: 10,
            flexWrap: 'wrap', overflowWrap: 'anywhere',
          }}>
            {entry.room && <span>📍 {entry.room}</span>}
            {entry.lecturer && <span>👤 {entry.lecturer}</span>}
            {hasGps && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                {formatCoord(entry.latitude)}, {formatCoord(entry.longitude)} · {entry.geofence_radius_meters}m
              </span>
            )}
          </div>
        </div>
      </div>

      {isRep && (
        <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>
          <button
            onClick={onEdit}
            style={{
              padding: '6px 12px', fontSize: 12,
              borderRadius: 'var(--radius-sm)',
            }}
          >
            Edit
          </button>
          <button
            onClick={onDelete}
            style={{
              padding: '6px 12px', fontSize: 12,
              borderRadius: 'var(--radius-sm)',
              color: 'var(--danger)', background: 'transparent',
              border: '1px solid var(--border)',
            }}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Form (rendered inside modal)
// ─────────────────────────────────────────────────────────────
function TimetableForm({ form, setForm, editing, busy, err, onSubmit, onCancel }) {
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState('');
  const [locAccuracy, setLocAccuracy] = useState(null);

  const set = (k) => (e) => {
    const v =
      e.target.type === 'number'
        ? Number(e.target.value)
        : e.target.type === 'checkbox'
        ? e.target.checked
        : e.target.value;
    setForm({ ...form, [k]: v });
  };

  function useMyLocation() {
    setLocating(true);
    setLocError('');
    setLocAccuracy(null);

    if (!navigator.geolocation) {
      setLocError('Geolocation is not supported by this browser.');
      setLocating(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((prev) => ({
          ...prev,
          latitude: pos.coords.latitude.toFixed(6),
          longitude: pos.coords.longitude.toFixed(6),
        }));
        setLocAccuracy(Math.round(pos.coords.accuracy));
        setLocating(false);
      },
      (err) => {
        const m =
          err.code === err.PERMISSION_DENIED
            ? 'Location permission denied. Allow it in your browser settings and try again.'
            : err.code === err.POSITION_UNAVAILABLE
            ? 'Location unavailable. Try again in an open area or near a window.'
            : err.code === err.TIMEOUT
            ? 'Location timed out. Try again.'
            : err.message || 'Could not get location.';
        setLocError(m);
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }

  function clearLocation() {
    setForm((prev) => ({ ...prev, latitude: '', longitude: '' }));
    setLocAccuracy(null);
    setLocError('');
  }

  const hasCoords =
    form.latitude !== '' &&
    form.latitude !== null &&
    form.longitude !== '' &&
    form.longitude !== null;

  return (
    <form onSubmit={onSubmit} style={{ display: 'grid', gap: 14 }}>
      {/* Basic course info */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 10 }}>
        <label style={LBL}>
          Course code *
          <input
            value={form.course_code}
            onChange={set('course_code')}
            required
            placeholder="e.g. CSC301"
            style={{ ...FIELD, fontFamily: 'var(--font-mono)' }}
          />
        </label>
        <label style={LBL}>
          Course title
          <input
            value={form.course_title}
            onChange={set('course_title')}
            placeholder="e.g. Data Structures"
            style={FIELD}
          />
        </label>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr) minmax(0, 1fr)', gap: 10 }}>
        <label style={LBL}>
          Day *
          <select value={form.day_of_week} onChange={set('day_of_week')} required style={FIELD}>
            {DAYS.map((d, i) => (
              <option key={i} value={i}>{d}</option>
            ))}
          </select>
        </label>
        <label style={LBL}>
          Start *
          <input type="time" value={form.start_time} onChange={set('start_time')} required style={FIELD} />
        </label>
        <label style={LBL}>
          End *
          <input type="time" value={form.end_time} onChange={set('end_time')} required style={FIELD} />
        </label>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 10 }}>
        <label style={LBL}>
          Room
          <input value={form.room} onChange={set('room')} placeholder="e.g. Lab 2" style={FIELD} />
        </label>
        <label style={LBL}>
          Lecturer
          <input value={form.lecturer} onChange={set('lecturer')} placeholder="e.g. Dr. Mensah" style={FIELD} />
        </label>
      </div>

      {/* Check-in window */}
      <details style={{
        padding: 12, background: 'var(--slate-50)',
        borderRadius: 10, border: '1px solid var(--border)',
      }}>
        <summary style={{ fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--slate-700)' }}>
          Check-in window settings
        </summary>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, marginTop: 12 }}>
          <label style={LBL}>
            Opens (min before)
            <input type="number" min={0} max={120}
              value={form.check_in_starts_minutes_before}
              onChange={set('check_in_starts_minutes_before')}
              style={FIELD} />
          </label>
          <label style={LBL}>
            Closes (min after end)
            <input type="number" min={0} max={240}
              value={form.check_in_ends_minutes_after}
              onChange={set('check_in_ends_minutes_after')}
              style={FIELD} />
          </label>
          <label style={LBL}>
            Late after (min)
            <input type="number" min={0} max={120}
              value={form.late_after_minutes}
              onChange={set('late_after_minutes')}
              style={FIELD} />
          </label>
        </div>
      </details>

      {/* Classroom location */}
      <details
        open={hasCoords || editing}
        style={{
          padding: 12, background: 'var(--slate-50)',
          borderRadius: 10, border: '1px solid var(--border)',
        }}
      >
        <summary style={{ fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--slate-700)' }}>
          Classroom location (GPS)
          {hasCoords && (
            <span className="badge badge-success" style={{ fontSize: 10, marginLeft: 8 }}>set</span>
          )}
          {!hasCoords && form.require_location && (
            <span className="badge badge-warning" style={{ fontSize: 10, marginLeft: 8 }}>not set</span>
          )}
        </summary>

        <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
          <label style={{
            display: 'flex', alignItems: 'center', gap: 10,
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>
            <input type="checkbox" checked={form.require_location}
              onChange={set('require_location')}
              style={{ width: 18, height: 18 }} />
            Require GPS verification for check-in
          </label>

          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, lineHeight: 1.55 }}>
            {form.require_location
              ? hasCoords
                ? 'Students must be within the radius below to check in. Outside check-ins are rejected.'
                : 'No coordinates set yet. GPS is currently NOT enforced — students can check in from anywhere. Click "Use my current location" while standing in the classroom.'
              : 'GPS check is disabled for this course. Students can check in from anywhere.'}
          </p>

          {form.require_location && (
            <>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <button type="button" onClick={useMyLocation} disabled={locating}
                  className="btn-primary" style={{ padding: '8px 14px', fontSize: 13 }}>
                  {locating ? '📍 Getting location…' : '📍 Use my current location'}
                </button>
                {hasCoords && (
                  <button type="button" onClick={clearLocation} style={{
                    padding: '8px 14px', fontSize: 13,
                    background: '#fff', border: '1px solid var(--border-strong)',
                    color: 'var(--slate-700)', borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer',
                  }}>Clear</button>
                )}
              </div>

              {locError && (
                <div style={{
                  padding: '8px 12px', background: 'var(--danger-bg)',
                  color: 'var(--danger)', borderRadius: 8, fontSize: 12,
                }}>{locError}</div>
              )}

              {locAccuracy !== null && (
                <div style={{
                  padding: '8px 12px',
                  background: locAccuracy <= 50 ? 'var(--success-bg)' : locAccuracy <= 150 ? 'var(--warning-bg)' : 'var(--danger-bg)',
                  color: locAccuracy <= 50 ? 'var(--success)' : locAccuracy <= 150 ? 'var(--warning)' : 'var(--danger)',
                  borderRadius: 8, fontSize: 12,
                }}>
                  Location accuracy: ±{locAccuracy}m —{' '}
                  {locAccuracy <= 50 ? 'excellent' : locAccuracy <= 150 ? 'good' : 'poor — try again near a window'}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
                <label style={LBL}>
                  Latitude
                  <input value={form.latitude} onChange={set('latitude')} placeholder="5.650500"
                    style={{ ...FIELD, fontFamily: 'var(--font-mono)', fontSize: 13 }} />
                </label>
                <label style={LBL}>
                  Longitude
                  <input value={form.longitude} onChange={set('longitude')} placeholder="-0.187000"
                    style={{ ...FIELD, fontFamily: 'var(--font-mono)', fontSize: 13 }} />
                </label>
                <label style={LBL}>
                  Radius (m)
                  <input type="number" min={20} max={1000}
                    value={form.geofence_radius_meters}
                    onChange={set('geofence_radius_meters')}
                    style={FIELD} />
                </label>
              </div>

              <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
                150m is a safe default for indoor GPS. If students in the back of the room can't check in, increase it to 200–250m.
              </p>
            </>
          )}
        </div>
      </details>

      {err && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{err}</div>}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <button type="button" onClick={onCancel} disabled={busy} style={{ padding: '10px 18px', fontSize: 14 }}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={busy} style={{ padding: '10px 22px', fontSize: 14 }}>
          {busy ? 'Saving…' : editing ? 'Save changes' : 'Add to timetable'}
        </button>
      </div>
    </form>
  );
} 