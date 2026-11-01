import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { PageHeader, EmptyState, InfoCard } from '../components/PageUI';

// ─────────────────────────────────────────────────────────────
// Weekdays only
// ─────────────────────────────────────────────────────────────
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

const LBL = {
  fontSize: 13,
  fontWeight: 500,
  color: 'var(--slate-700)',
  display: 'block',
};

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
  // GPS
  latitude: '',
  longitude: '',
  geofence_radius_meters: 150,
  require_location: true,
};

function computeTodayIndex() {
  const js = new Date().getDay();
  return js >= 1 && js <= 5 ? js - 1 : -1;
}

function dayName(dayIndex) {
  return DAYS[dayIndex] || `Day ${dayIndex}`;
}

function formatCoord(n) {
  if (n === null || n === undefined || n === '') return null;
  const num = Number(n);
  if (Number.isNaN(num)) return null;
  return num.toFixed(5);
}

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

  const todayIndex = computeTodayIndex();

  async function load() {
    setLoading(true);
    setErr('');
    try {
      const d = await api.get('/attendance/timetable/');
      setEntries(d.results || []);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const byDay = useMemo(() => {
    const map = {};
    entries.forEach((e) => {
      if (!map[e.day_of_week]) map[e.day_of_week] = [];
      map[e.day_of_week].push(e);
    });
    Object.keys(map).forEach((key) => {
      map[key].sort((a, b) => (a.start_time > b.start_time ? 1 : -1));
    });
    return map;
  }, [entries]);

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
        check_in_starts_minutes_before: Number(
          form.check_in_starts_minutes_before
        ),
        check_in_ends_minutes_after: Number(
          form.check_in_ends_minutes_after
        ),
        late_after_minutes: Number(form.late_after_minutes),
        geofence_radius_meters: Number(form.geofence_radius_meters),
        // Send null explicitly if the rep left coordinates blank —
        // clears the geofence for that course.
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
      closeForm();
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteEntry(entry) {
    if (
      !confirm(
        `Delete "${entry.course_code}" on ${dayName(entry.day_of_week)}? ` +
          `Existing attendance sessions for this course are preserved.`
      )
    )
      return;

    setErr('');
    setMsg('');
    try {
      await api.del(`/attendance/timetable/${entry.id}/`);
      setMsg(`Removed ${entry.course_code} from the timetable.`);
      await load();
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
              style={{ padding: '9px 16px' }}
            >
              ＋ Add course
            </button>
          ) : null
        }
      />

      {!isRep && (
        <div
          style={{
            padding: '12px 16px',
            background: '#dbeafe',
            color: '#1e40af',
            borderRadius: 'var(--radius-sm)',
            fontSize: 13,
            marginBottom: 16,
            border: '1px solid #bfdbfe',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span>ℹ</span>
          <span>
            <strong>Read-only.</strong> Only the class rep can manage the
            timetable.
          </span>
        </div>
      )}

      {msg && !showForm && (
        <div
          style={{
            padding: '10px 14px',
            background: 'var(--success-bg)',
            color: 'var(--success)',
            borderRadius: 'var(--radius-sm)',
            fontSize: 14,
            marginBottom: 16,
            border: '1px solid #bbf7d0',
          }}
        >
          {msg}
        </div>
      )}

      {err && !showForm && (
        <div
          role="alert"
          style={{
            padding: '10px 14px',
            background: 'var(--danger-bg)',
            color: 'var(--danger)',
            borderRadius: 'var(--radius-sm)',
            fontSize: 14,
            marginBottom: 16,
            border: '1px solid #fecaca',
          }}
        >
          {err}
        </div>
      )}

      {showForm && (
        <TimetableForm
          form={form}
          setForm={setForm}
          editing={!!editingId}
          busy={busy}
          err={err}
          onSubmit={submit}
          onCancel={closeForm}
        />
      )}

      {loading && (
        <div style={{ display: 'grid', placeItems: 'center', padding: 40 }}>
          <span
            className="spinner spinner-dark"
            style={{ width: 26, height: 26, borderWidth: 3 }}
          />
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
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'grid', gap: 16 }}>
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
                  <div
                    style={{
                      padding: '12px 18px',
                      background: isToday ? 'var(--slate-50)' : '#fff',
                      borderBottom:
                        dayEntries.length > 0
                          ? '1px solid var(--border)'
                          : 'none',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 8,
                      flexWrap: 'wrap',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      <span style={{ fontWeight: 700, fontSize: 14 }}>
                        {dayLabel}
                      </span>
                      {isToday && (
                        <span
                          className="badge badge-warning"
                          style={{ fontSize: 10 }}
                        >
                          TODAY
                        </span>
                      )}
                    </div>
                    <span
                      style={{ fontSize: 12, color: 'var(--text-muted)' }}
                    >
                      {dayEntries.length === 0
                        ? 'No classes'
                        : `${dayEntries.length} class${
                            dayEntries.length === 1 ? '' : 'es'
                          }`}
                    </span>
                  </div>

                  {dayEntries.length === 0 ? (
                    <div
                      style={{
                        padding: '14px 18px',
                        fontSize: 13,
                        color: 'var(--text-muted)',
                        fontStyle: 'italic',
                      }}
                    >
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
        </div>
      )}

      {isRep && entries.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <InfoCard title="How auto check-in works">
            <ul
              style={{
                margin: 0,
                paddingLeft: 18,
                fontSize: 13,
                color: 'var(--slate-600)',
                lineHeight: 1.7,
              }}
            >
              <li>
                Each course opens a check-in window{' '}
                <strong>5 minutes before</strong> class start time.
              </li>
              <li>
                Students tap <strong>"I'm here"</strong> on their own phone.
              </li>
              <li>
                If <strong>classroom coordinates</strong> are set, students
                must be within the geofence radius to check in.
              </li>
              <li>
                Check-in closes <strong>15 minutes after</strong> class ends.
              </li>
              <li>
                Late arrivals (after 10 minutes) are marked{' '}
                <strong>Late</strong>.
              </li>
              <li>
                Only the admin can correct attendance records after check-in.
              </li>
            </ul>
          </InfoCard>
        </div>
      )}
    </div>
  );
}

function EntryRow({ entry, isFirst, isRep, onEdit, onDelete }) {
  const hasGps =
    entry.latitude !== null &&
    entry.latitude !== undefined &&
    entry.longitude !== null &&
    entry.longitude !== undefined;

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
      }}
    >
      <div style={{ minWidth: 0, flex: '1 1 240px' }}>
        <div
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            flexWrap: 'wrap',
            lineHeight: 1.35,
          }}
        >
          <span
            style={{
              fontSize: 14,
              fontWeight: 700,
              fontFamily: 'var(--font-mono)',
              letterSpacing: '0.02em',
              overflowWrap: 'anywhere',
            }}
          >
            {entry.course_code}
          </span>
          {entry.course_title && (
            <span
              style={{
                fontSize: 13,
                color: 'var(--slate-600)',
                overflowWrap: 'anywhere',
              }}
            >
              {entry.course_title}
            </span>
          )}
          {hasGps ? (
            <span
              className="badge badge-success"
              style={{ fontSize: 10 }}
              title={`GPS verified within ${entry.geofence_radius_meters}m`}
            >
              📍 GPS on
            </span>
          ) : entry.require_location ? (
            <span
              className="badge badge-warning"
              style={{ fontSize: 10 }}
              title="Coordinates not set — location check is disabled for this course"
            >
              📍 No coords
            </span>
          ) : (
            <span
              className="badge badge-neutral"
              style={{ fontSize: 10 }}
              title="GPS check disabled"
            >
              📍 Off
            </span>
          )}
        </div>
        <div
          style={{
            fontSize: 12,
            color: 'var(--text-muted)',
            marginTop: 4,
            display: 'flex',
            gap: 10,
            flexWrap: 'wrap',
            overflowWrap: 'anywhere',
          }}
        >
          <span style={{ whiteSpace: 'nowrap' }}>
            🕐 {entry.start_time} – {entry.end_time}
          </span>
          {entry.room && <span>📍 {entry.room}</span>}
          {entry.lecturer && <span>👤 {entry.lecturer}</span>}
          {hasGps && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
              {formatCoord(entry.latitude)}, {formatCoord(entry.longitude)} ·{' '}
              {entry.geofence_radius_meters}m
            </span>
          )}
        </div>
      </div>

      {isRep && (
        <div
          style={{
            display: 'flex',
            gap: 6,
            flexShrink: 0,
            flexWrap: 'wrap',
          }}
        >
          <button
            onClick={onEdit}
            style={{
              padding: '6px 12px',
              fontSize: 12,
              borderRadius: 'var(--radius-sm)',
            }}
          >
            Edit
          </button>
          <button
            onClick={onDelete}
            style={{
              padding: '6px 12px',
              fontSize: 12,
              borderRadius: 'var(--radius-sm)',
              color: 'var(--danger)',
              background: 'transparent',
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
        const msg =
          err.code === err.PERMISSION_DENIED
            ? 'Location permission denied. Allow it in your browser settings and try again.'
            : err.code === err.POSITION_UNAVAILABLE
            ? 'Location unavailable. Try again in an open area or near a window.'
            : err.code === err.TIMEOUT
            ? 'Location timed out. Try again.'
            : err.message || 'Could not get location.';
        setLocError(msg);
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  function clearLocation() {
    setForm((prev) => ({
      ...prev,
      latitude: '',
      longitude: '',
    }));
    setLocAccuracy(null);
    setLocError('');
  }

  const hasCoords =
    form.latitude !== '' &&
    form.latitude !== null &&
    form.longitude !== '' &&
    form.longitude !== null;

  return (
    <form
      onSubmit={onSubmit}
      className="card"
      style={{
        padding: 20,
        marginBottom: 24,
        display: 'grid',
        gap: 14,
        borderLeft: '3px solid var(--brand)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <h3 style={{ fontSize: 15, fontWeight: 700 }}>
          {editing ? `Edit ${form.course_code}` : 'Add a course to the timetable'}
        </h3>
        <button
          type="button"
          onClick={onCancel}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: 13,
            padding: 0,
          }}
        >
          Cancel ✕
        </button>
      </div>

      {/* Basic course info */}
      <div
        style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}
      >
        <label style={LBL}>
          Course code *
          <input
            value={form.course_code}
            onChange={set('course_code')}
            required
            placeholder="e.g. CSC301"
            style={{
              width: '100%',
              marginTop: 4,
              fontFamily: 'var(--font-mono)',
            }}
          />
        </label>
        <label style={LBL}>
          Course title
          <input
            value={form.course_title}
            onChange={set('course_title')}
            placeholder="e.g. Data Structures"
            style={{ width: '100%', marginTop: 4 }}
          />
        </label>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: 10,
        }}
      >
        <label style={LBL}>
          Day *
          <select
            value={form.day_of_week}
            onChange={set('day_of_week')}
            required
            style={{ width: '100%', marginTop: 4 }}
          >
            {DAYS.map((d, i) => (
              <option key={i} value={i}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label style={LBL}>
          Start time *
          <input
            type="time"
            value={form.start_time}
            onChange={set('start_time')}
            required
            style={{ width: '100%', marginTop: 4 }}
          />
        </label>
        <label style={LBL}>
          End time *
          <input
            type="time"
            value={form.end_time}
            onChange={set('end_time')}
            required
            style={{ width: '100%', marginTop: 4 }}
          />
        </label>
      </div>

      <div
        style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}
      >
        <label style={LBL}>
          Room
          <input
            value={form.room}
            onChange={set('room')}
            placeholder="e.g. Lab 2"
            style={{ width: '100%', marginTop: 4 }}
          />
        </label>
        <label style={LBL}>
          Lecturer
          <input
            value={form.lecturer}
            onChange={set('lecturer')}
            placeholder="e.g. Dr. Mensah"
            style={{ width: '100%', marginTop: 4 }}
          />
        </label>
      </div>

      {/* Check-in window settings */}
      <details
        style={{
          padding: 12,
          background: 'var(--slate-50)',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border)',
        }}
      >
        <summary
          style={{
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            color: 'var(--slate-700)',
          }}
        >
          Check-in window settings
        </summary>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: 10,
            marginTop: 12,
          }}
        >
          <label style={LBL}>
            Opens (min before)
            <input
              type="number"
              min={0}
              max={120}
              value={form.check_in_starts_minutes_before}
              onChange={set('check_in_starts_minutes_before')}
              style={{ width: '100%', marginTop: 4 }}
            />
          </label>
          <label style={LBL}>
            Closes (min after end)
            <input
              type="number"
              min={0}
              max={240}
              value={form.check_in_ends_minutes_after}
              onChange={set('check_in_ends_minutes_after')}
              style={{ width: '100%', marginTop: 4 }}
            />
          </label>
          <label style={LBL}>
            Late after (min)
            <input
              type="number"
              min={0}
              max={120}
              value={form.late_after_minutes}
              onChange={set('late_after_minutes')}
              style={{ width: '100%', marginTop: 4 }}
            />
          </label>
        </div>
      </details>

      {/* Classroom location (GPS) */}
      <details
        open={hasCoords || editing}
        style={{
          padding: 12,
          background: 'var(--slate-50)',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border)',
        }}
      >
        <summary
          style={{
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            color: 'var(--slate-700)',
          }}
        >
          Classroom location (GPS)
          {hasCoords && (
            <span
              className="badge badge-success"
              style={{ fontSize: 10, marginLeft: 8 }}
            >
              set
            </span>
          )}
          {!hasCoords && form.require_location && (
            <span
              className="badge badge-warning"
              style={{ fontSize: 10, marginLeft: 8 }}
            >
              not set
            </span>
          )}
        </summary>

        <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={form.require_location}
              onChange={set('require_location')}
              style={{ width: 18, height: 18 }}
            />
            Require GPS verification for check-in
          </label>
          <p
            style={{
              fontSize: 12,
              color: 'var(--text-muted)',
              margin: 0,
              lineHeight: 1.55,
            }}
          >
            {form.require_location
              ? hasCoords
                ? 'Students must be within the radius below to check in. Outside check-ins are rejected.'
                : 'No coordinates set yet. GPS is currently NOT enforced — students can check in from anywhere. Click "Use my current location" below while standing in the classroom.'
              : 'GPS check is disabled for this course. Students can check in from anywhere.'}
          </p>

          {form.require_location && (
            <>
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  flexWrap: 'wrap',
                  alignItems: 'center',
                }}
              >
                <button
                  type="button"
                  onClick={useMyLocation}
                  disabled={locating}
                  className="btn-primary"
                  style={{ padding: '8px 14px', fontSize: 13 }}
                >
                  {locating ? '📍 Getting location…' : '📍 Use my current location'}
                </button>
                {hasCoords && (
                  <button
                    type="button"
                    onClick={clearLocation}
                    style={{
                      padding: '8px 14px',
                      fontSize: 13,
                      background: '#fff',
                      border: '1px solid var(--border-strong)',
                      color: 'var(--slate-700)',
                      borderRadius: 'var(--radius-sm)',
                      cursor: 'pointer',
                    }}
                  >
                    Clear
                  </button>
                )}
              </div>

              {locError && (
                <div
                  style={{
                    padding: '8px 12px',
                    background: 'var(--danger-bg)',
                    color: 'var(--danger)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: 12,
                  }}
                >
                  {locError}
                </div>
              )}

              {locAccuracy !== null && (
                <div
                  style={{
                    padding: '8px 12px',
                    background:
                      locAccuracy <= 50
                        ? 'var(--success-bg)'
                        : locAccuracy <= 150
                        ? 'var(--warning-bg)'
                        : 'var(--danger-bg)',
                    color:
                      locAccuracy <= 50
                        ? 'var(--success)'
                        : locAccuracy <= 150
                        ? 'var(--warning)'
                        : 'var(--danger)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: 12,
                  }}
                >
                  Location accuracy: ±{locAccuracy}m —{' '}
                  {locAccuracy <= 50
                    ? 'excellent'
                    : locAccuracy <= 150
                    ? 'good'
                    : 'poor — try again near a window'}
                </div>
              )}

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr',
                  gap: 10,
                }}
              >
                <label style={LBL}>
                  Latitude
                  <input
                    value={form.latitude}
                    onChange={set('latitude')}
                    placeholder="5.650500"
                    style={{
                      width: '100%',
                      marginTop: 4,
                      fontFamily: 'var(--font-mono)',
                      fontSize: 13,
                    }}
                  />
                </label>
                <label style={LBL}>
                  Longitude
                  <input
                    value={form.longitude}
                    onChange={set('longitude')}
                    placeholder="-0.187000"
                    style={{
                      width: '100%',
                      marginTop: 4,
                      fontFamily: 'var(--font-mono)',
                      fontSize: 13,
                    }}
                  />
                </label>
                <label style={LBL}>
                  Radius (m)
                  <input
                    type="number"
                    min={20}
                    max={1000}
                    value={form.geofence_radius_meters}
                    onChange={set('geofence_radius_meters')}
                    style={{ width: '100%', marginTop: 4 }}
                  />
                </label>
              </div>

              <p
                style={{
                  fontSize: 11,
                  color: 'var(--text-muted)',
                  margin: 0,
                  lineHeight: 1.5,
                }}
              >
                150m is a safe default for indoor GPS. If students in the
                back of the room can't check in, increase it to 200–250m.
              </p>
            </>
          )}
        </div>
      </details>

      {err && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{err}</div>}

      <button
        type="submit"
        className="btn-primary"
        disabled={busy}
        style={{ justifySelf: 'start', padding: '10px 20px', fontSize: 14 }}
      >
        {busy ? 'Saving…' : editing ? 'Save changes' : 'Add to timetable'}
      </button>
    </form>
  );
} 