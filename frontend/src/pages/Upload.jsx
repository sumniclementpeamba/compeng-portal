import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { resourcesApi } from '../api/resources';
import { useAuth } from '../context/AuthContext';
import { PageHeader, InfoCard } from '../components/PageUI';

const LABEL = { fontSize: 13, fontWeight: 500, color: 'var(--slate-700)', display: 'block' };

export default function Upload() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isPublisher = user?.role === 'rep' || user?.role === 'admin';

  const [form, setForm] = useState({
    title: '', description: '', course_name: '', semester: '',
    resource_type: 'note', file: null,
  });
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) =>
    setForm({ ...form, [k]: k === 'file' ? e.target.files[0] : e.target.value });

  async function submit(e) {
    e.preventDefault();
    setErr('');
    setMsg('');

    if (!form.file) {
      setErr('Please choose a file to upload.');
      return;
    }

    setBusy(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => {
        if (v !== null && v !== '') fd.append(k, v);
      });
      await resourcesApi.create(fd);
      setMsg(
        isPublisher
          ? 'Published — now visible to the class.'
          : 'Uploaded — pending moderator review.'
      );
      setTimeout(() => navigate('/resources'), 1400);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Contribute"
        title="Upload a resource"
        subtitle={isPublisher
          ? 'As course rep, your uploads go live immediately — no review needed.'
          : 'Your contribution will be reviewed by a moderator before it appears in the library.'}
      />

      <div className="split-grid">
        <form onSubmit={submit} className="card" style={{ padding: 24, display: 'grid', gap: 14 }}>
          <label style={LABEL}>
            Title *
            <input
              value={form.title}
              onChange={set('title')}
              required
              style={{ width: '100%', marginTop: 4 }}
              placeholder="e.g. CSC301 Lecture 3 — Graphs"
            />
          </label>

          <label style={LABEL}>
            Description
            <textarea
              value={form.description}
              onChange={set('description')}
              rows={3}
              style={{ width: '100%', marginTop: 4 }}
              placeholder="What's inside? Topics covered, exam relevance…"
            />
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
            <label style={LABEL}>
              Course *
              <input
                value={form.course_name}
                onChange={set('course_name')}
                required
                style={{ width: '100%', marginTop: 4 }}
                placeholder="CSC301"
              />
            </label>
            <label style={LABEL}>
              Semester
              <input
                value={form.semester}
                onChange={set('semester')}
                style={{ width: '100%', marginTop: 4 }}
                placeholder="2025-S1"
              />
            </label>
          </div>

          <label style={LABEL}>
            Resource type
            <select
              value={form.resource_type}
              onChange={set('resource_type')}
              style={{ width: '100%', marginTop: 4 }}
            >
              {['note','slide','past_question','assignment','lab','project','textbook','other']
                .map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
            </select>
          </label>

          <label style={LABEL}>
            File *
            <input
              type="file"
              onChange={set('file')}
              required
              style={{ width: '100%', marginTop: 4, padding: 8 }}
            />
            <span style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
              PDF, DOCX, PPTX, ZIP, images, code files. Max 50 MB.
            </span>
          </label>

          {err && (
            <div role="alert" style={{
              padding: '10px 12px', background: 'var(--danger-bg)',
              color: 'var(--danger)', borderRadius: 'var(--radius-sm)',
              fontSize: 13, border: '1px solid #fecaca',
            }}>{err}</div>
          )}

          {msg && (
            <div style={{
              padding: '10px 12px', background: 'var(--success-bg)',
              color: 'var(--success)', borderRadius: 'var(--radius-sm)',
              fontSize: 13, border: '1px solid #bbf7d0',
            }}>{msg}</div>
          )}

          <button
            type="submit"
            className="btn-primary"
            disabled={busy}
            style={{ padding: '11px 16px', fontSize: 15 }}
          >
            {busy ? 'Uploading…' : isPublisher ? 'Publish resource' : 'Submit for review'}
          </button>
        </form>

        <aside style={{ display: 'grid', gap: 16 }}>
          {isPublisher && (
            <div style={{
              padding: '12px 16px', background: '#dbeafe', color: '#1e40af',
              borderRadius: 'var(--radius)', fontSize: 13, border: '1px solid #bfdbfe',
            }}>
              <strong style={{ display: 'block', marginBottom: 4 }}>Publisher mode</strong>
              Your uploads go live instantly — no review queue.
            </div>
          )}

          <InfoCard title="Tips for a good upload">
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--slate-600)', lineHeight: 1.7 }}>
              <li>Give the file a clear title — the course and topic.</li>
              <li>Add the semester so old notes don't confuse anyone.</li>
              <li>Choose the correct type: note, past question, lab, etc.</li>
              <li>A short description helps classmates know what's inside.</li>
            </ul>
          </InfoCard>

          <InfoCard title="Accepted formats">
            <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>
              PDF · DOC/DOCX · PPT/PPTX · XLS/XLSX · ZIP/RAR · Images · Source code · TXT/MD · CSV
            </p>
          </InfoCard>
        </aside>
      </div>
    </div>
  );
} 