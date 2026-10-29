import { useEffect, useState } from 'react';
import { announcementsApi } from '../api/resources';
import { getToken } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { PageHeader, InfoCard, EmptyState } from '../components/PageUI';
import { AudioSection } from '../components/AudioSection';

export default function Announcements() {
  const { user } = useAuth();
  const canPost = user?.role === 'rep' || user?.role === 'admin';

  const [items, setItems] = useState([]);
  const [form, setForm] = useState({
    title: '', body: '', course_name: '', pinned: false,
  });
  const [audioFile, setAudioFile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const d = await announcementsApi.list();
      setItems(d.results || d || []);
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function submit(e) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const payload = {
        title: form.title,
        body: form.body,
        course_name: form.course_name,
        pinned: form.pinned,
      };

      if (audioFile) {
        const fd = new FormData();
        Object.entries(payload).forEach(([k, v]) => {
          fd.append(k, typeof v === 'boolean' ? String(v) : v);
        });
        fd.append('audio', audioFile);
        await announcementsApi.create(fd);
      } else {
        await announcementsApi.create(payload);
      }

      setForm({ title: '', body: '', course_name: '', pinned: false });
      setAudioFile(null);
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  const pinned = items.filter((a) => a.pinned).length;
  const withAudio = items.filter((a) => a.audio_url).length;

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Class feed"
        title="Announcements"
        subtitle="Deadlines, class updates, and reminders from your course rep."
      />

      <div className="split-grid">
        <div style={{ display: 'grid', gap: 20 }}>
          {canPost && (
            <form onSubmit={submit} className="card" style={{
              padding: 20, display: 'grid', gap: 12,
              borderLeft: '3px solid var(--brand)',
            }}>
              <h3 style={{ fontSize: 14, fontWeight: 600 }}>Post an announcement</h3>

              <input
                placeholder="Title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
                style={{ width: '100%' }}
              />

              <textarea
                placeholder="What does the class need to know?"
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                required
                rows={3}
                style={{ width: '100%' }}
              />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'center' }}>
                <input
                  placeholder="Course (optional)"
                  value={form.course_name}
                  onChange={(e) => setForm({ ...form, course_name: e.target.value })}
                />
                <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="checkbox"
                    checked={form.pinned}
                    onChange={(e) => setForm({ ...form, pinned: e.target.checked })}
                  />
                  Pin to top
                </label>
              </div>

              <div>
                <div style={{
                  fontSize: 13, fontWeight: 500,
                  color: 'var(--slate-700)', marginBottom: 6,
                }}>
                  Audio (optional)
                </div>
                <AudioSection
                  value={audioFile}
                  onChange={setAudioFile}
                  disabled={busy}
                />
              </div>

              <button
                type="submit"
                className="btn-primary"
                disabled={busy}
                style={{ justifySelf: 'start', padding: '9px 18px' }}
              >
                {busy ? 'Posting…' : 'Publish'}
              </button>
            </form>
          )}

          {err && (
            <div style={{
              padding: '10px 14px', background: 'var(--danger-bg)',
              color: 'var(--danger)', borderRadius: 'var(--radius-sm)', fontSize: 14,
            }}>{err}</div>
          )}

          {loading && (
            <div style={{ display: 'grid', placeItems: 'center', padding: 40 }}>
              <span className="spinner spinner-dark" style={{ width: 26, height: 26, borderWidth: 3 }} />
            </div>
          )}

          {!loading && items.length === 0 && (
            <EmptyState
              icon="📣"
              title="No announcements yet"
              body={canPost
                ? 'You can post the first one above — text, or record a voice message.'
                : 'Check back later — your course rep will post updates here.'}
            />
          )}

          {!loading && items.length > 0 && (
            <div className="stagger" style={{ display: 'grid', gap: 12 }}>
              {items.map((a) => (
                <article key={a.id} className="card" style={{
                  padding: 20,
                  borderLeft: a.pinned
                    ? '3px solid var(--warning)'
                    : '1px solid var(--border)',
                }}>
                  <div style={{
                    display: 'flex', justifyContent: 'space-between',
                    alignItems: 'baseline', gap: 12, flexWrap: 'wrap',
                  }}>
                    <h3 style={{ fontSize: 16, lineHeight: 1.35 }}>
                      {a.pinned && <span style={{ color: 'var(--warning)' }}>📌 </span>}
                      {a.title}
                      {a.audio_url && (
                        <span className="badge badge-neutral" style={{
                          marginLeft: 8, fontSize: 10, verticalAlign: 'middle',
                        }}>🎙 audio</span>
                      )}
                    </h3>
                    <span style={{
                      fontSize: 12, color: 'var(--text-muted)',
                      whiteSpace: 'nowrap',
                    }}>
                      {new Date(a.created_at).toLocaleDateString()}
                    </span>
                  </div>

                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                    {a.author_name}{a.course_name && ` · ${a.course_name}`}
                  </p>

                  <p style={{
                    marginTop: 12, fontSize: 14,
                    color: 'var(--slate-700)', whiteSpace: 'pre-wrap', lineHeight: 1.6,
                  }}>
                    {a.body}
                  </p>

                  {a.audio_url && (
                    <div style={{ marginTop: 14 }}>
                      <audio
                        src={`${a.audio_url}?token=${getToken()}`}
                        controls
                        preload="none"
                        style={{ width: '100%' }}
                      />
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>

        <aside style={{ display: 'grid', gap: 16 }}>
          <InfoCard title="At a glance">
            <div style={{ display: 'grid', gap: 12 }}>
              <StatRow label="Total announcements" value={items.length} />
              <StatRow label="Pinned" value={pinned} muted={pinned === 0} />
              <StatRow label="With audio" value={withAudio} muted={withAudio === 0} />
              {items[0] && (
                <StatRow
                  label="Most recent"
                  value={new Date(items[0].created_at).toLocaleDateString()}
                />
              )}
            </div>
          </InfoCard>

          {canPost && (
            <InfoCard title="Recording audio">
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--slate-600)', lineHeight: 1.7 }}>
                <li>Click <strong>Record audio</strong> — the browser asks for microphone access.</li>
                <li>Speak clearly, then click <strong>Stop recording</strong>.</li>
                <li>Preview before publishing. Re-record if needed.</li>
                <li>Max 10 MB. Accepts webm, mp4, m4a, mp3, ogg, wav.</li>
              </ul>
            </InfoCard>
          )}

          <InfoCard title="About this feed">
            <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.55, margin: 0 }}>
              {canPost
                ? 'Only course reps and admins can post here. Students see updates in real time.'
                : 'Announcements are posted by your course rep. Pinned items appear at the top of the feed.'}
            </p>
          </InfoCard>
        </aside>
      </div>
    </div>
  );
}

function StatRow({ label, value, muted }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between',
      alignItems: 'baseline',
    }}>
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</span>
      <span style={{
        fontSize: 14, fontWeight: 600,
        color: muted ? 'var(--slate-400)' : 'var(--text)',
      }}>
        {value}
      </span>
    </div>
  );
} 