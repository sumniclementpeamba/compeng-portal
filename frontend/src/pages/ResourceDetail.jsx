import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  downloadResourceFile,
  downloadVersionFile,
  viewResourceFile,
} from '../api/client';
import { resourcesApi } from '../api/resources';
import { useAuth } from '../context/AuthContext';
import { getOffline, removeOffline, saveOffline } from '../offline/db';
import { InfoCard } from '../components/PageUI';

export default function ResourceDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const canManage = user?.role === 'rep' || user?.role === 'admin';

  const [r, setR] = useState(null);
  const [versions, setVersions] = useState([]);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploadingVersion, setUploadingVersion] = useState(false);

  // Moderation state
  const [reviewNote, setReviewNote] = useState('');
  const [deciding, setDeciding] = useState(null); // 'approved' | 'rejected' | null

  const fileInputRef = useRef(null);

  async function refresh() {
    const [resource, vers] = await Promise.all([
      resourcesApi.get(id),
      resourcesApi.versions(id).catch(() => []),
    ]);
    setR(resource);
    setVersions(Array.isArray(vers) ? vers : []);
  }

  useEffect(() => {
    refresh().catch((e) => setErr(e.message));
    getOffline(id).then((item) => setSaved(!!item));
  }, [id]);

  async function decide(decision) {
    setErr('');
    setMsg('');
    setDeciding(decision);
    try {
      await resourcesApi.review(id, decision, reviewNote);
      await refresh();
      setReviewNote('');
      setMsg(
        decision === 'approved'
          ? 'Approved — now visible to every class member.'
          : 'Rejected — hidden from the class.'
      );
    } catch (e) {
      setErr(`Could not ${decision}: ${e.message}`);
    } finally {
      setDeciding(null);
    }
  }

  async function openInBrowser() {
    const tab = window.open('about:blank', '_blank');
    setViewing(true);
    setMsg('');
    try {
      const blob = await viewResourceFile(id);
      const url = URL.createObjectURL(blob);
      if (tab && !tab.closed) tab.location.href = url;
      else {
        const a = document.createElement('a');
        a.href = url;
        a.download = r.file_name || `${r.title}.bin`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setMsg('Preview popup was blocked — file downloaded instead.');
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      if (tab && !tab.closed) tab.close();
      setErr(e.message);
    } finally {
      setViewing(false);
    }
  }

  async function download() {
    setBusy(true);
    try {
      const blob = await downloadResourceFile(id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = r.file_name || `${r.title}.bin`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  async function save() {
    setBusy(true);
    setMsg('Downloading for offline use…');
    try {
      const blob = await downloadResourceFile(id);
      await saveOffline(r, blob);
      setSaved(true);
      setMsg('');
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  async function remove() {
    await removeOffline(id);
    setSaved(false);
    setMsg('Removed from this device.');
  }

  async function downloadVersion(version) {
    try {
      const blob = await downloadVersionFile(version.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = version.file_name || `${r.title}-v${version.version_number}.bin`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) { setErr(e.message); }
  }

  async function handleVersionUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingVersion(true);
    setMsg('Uploading new version…');
    try {
      const fd = new FormData();
      fd.append('file', file);
      await resourcesApi.uploadVersion(id, fd);
      await refresh();
      setMsg('New version uploaded successfully.');
      e.target.value = '';
    } catch (err) { setErr(err.message); }
    finally { setUploadingVersion(false); }
  }

  if (!r) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', padding: 60 }}>
        <span className="spinner spinner-dark" style={{ width: 28, height: 28, borderWidth: 3 }} />
      </div>
    );
  }

  const statusBadge =
    r.status === 'approved' ? 'badge-success'
    : r.status === 'rejected' ? 'badge-danger'
    : 'badge-warning';
  const showStatusBadge = canManage || r.status !== 'approved';

  // Show moderation card only when there's something to decide
  const needsReview = canManage && r.status !== 'approved';

  return (
    <div className="animate-fade-up">
      <Link to="/resources" style={{ fontSize: 13, display: 'inline-block', marginBottom: 16 }}>
        ← Back to resources
      </Link>

      <div className="split-grid">
        <div style={{ display: 'grid', gap: 20 }}>
          {/* ── Hero card ──────────────────────────── */}
          <div className="card" style={{ padding: 24 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
              {showStatusBadge && <span className={`badge ${statusBadge}`}>{r.status}</span>}
              <span className="badge badge-neutral">{r.resource_type.replace('_', ' ')}</span>
              <span className="badge badge-neutral">v{r.version}</span>
            </div>

            <h1 style={{ fontSize: 26, letterSpacing: '-0.02em', lineHeight: 1.25 }}>
              {r.title}
            </h1>

            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: 16,
              fontSize: 13, color: 'var(--text-muted)', marginTop: 14,
            }}>
              <span>📚 {r.course_name}</span>
              {r.semester && <span>📅 {r.semester}</span>}
              <span>👤 {r.uploaded_by_name}</span>
              <span>🕐 {new Date(r.created_at).toLocaleDateString()}</span>
            </div>

            <div style={{
              display: 'flex', gap: 8, flexWrap: 'wrap',
              marginTop: 22, paddingTop: 20, borderTop: '1px solid var(--border)',
            }}>
              <button
                onClick={openInBrowser}
                disabled={viewing || busy}
                className="btn-primary"
                style={{ padding: '10px 18px' }}
              >
                {viewing ? 'Opening…' : 'Open'}
              </button>
              <button
                onClick={download}
                disabled={busy || viewing}
                style={{ padding: '10px 18px' }}
              >
                {busy ? 'Preparing…' : 'Download'}
              </button>
              {r.status === 'approved' && !saved && (
                <button
                  onClick={save}
                  disabled={busy || viewing}
                  style={{ padding: '10px 18px' }}
                >
                  Save for offline
                </button>
              )}
              {saved && (
                <button
                  onClick={remove}
                  style={{ padding: '10px 18px', color: 'var(--danger)' }}
                >
                  Remove from offline
                </button>
              )}
              {saved && (
                <span className="badge badge-success" style={{ alignSelf: 'center' }}>
                  Saved on this device
                </span>
              )}
            </div>
          </div>

          {/* ── Success / error banners ────────────── */}
          {msg && (
            <div style={{
              padding: '12px 16px',
              background: 'var(--success-bg)',
              color: 'var(--success)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 14,
              border: '1px solid #bbf7d0',
            }}>{msg}</div>
          )}
          {err && (
            <div role="alert" style={{
              padding: '12px 16px',
              background: 'var(--danger-bg)',
              color: 'var(--danger)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 14,
              border: '1px solid #fecaca',
            }}>{err}</div>
          )}

          {r.description && (
            <div className="card" style={{ padding: 24 }}>
              <h2 style={{
                fontSize: 13, textTransform: 'uppercase',
                letterSpacing: '0.08em', color: 'var(--text-muted)',
                marginBottom: 12, fontWeight: 600,
              }}>Description</h2>
              <p style={{
                whiteSpace: 'pre-wrap', fontSize: 14,
                color: 'var(--slate-700)', lineHeight: 1.65,
              }}>{r.description}</p>
            </div>
          )}
        </div>

        <aside style={{ display: 'grid', gap: 16 }}>
          {/* ── Moderation card — only for pending/rejected ── */}
          {needsReview && (
            <div className="card" style={{
              padding: 20,
              borderLeft: '3px solid var(--warning)',
              background: 'linear-gradient(180deg, #fffbeb 0%, #ffffff 60%)',
            }}>
              <h3 style={{
                fontSize: 13, fontWeight: 600,
                color: '#92400e', marginBottom: 4,
              }}>
                {r.status === 'pending' ? '⏳ Awaiting your review' : '⚠ Previously rejected'}
              </h3>
              <p style={{
                fontSize: 12, color: 'var(--slate-600)',
                marginBottom: 14, lineHeight: 1.55,
              }}>
                {r.status === 'pending'
                  ? 'This upload is hidden from the class until you approve it.'
                  : 'This submission was rejected. You can approve it now to make it visible.'}
              </p>

              <label style={{
                display: 'block', fontSize: 12,
                fontWeight: 500, color: 'var(--slate-700)',
                marginBottom: 6,
              }}>
                Review note (optional)
              </label>
              <input
                placeholder="Why is this approved or rejected?"
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
                disabled={deciding !== null}
                style={{ width: '100%', marginBottom: 12 }}
              />

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => decide('approved')}
                  className="btn-success"
                  disabled={deciding !== null}
                  style={{ flex: 1, padding: '9px 12px' }}
                >
                  {deciding === 'approved' ? 'Approving…' : '✓ Approve'}
                </button>
                <button
                  onClick={() => decide('rejected')}
                  className="btn-danger"
                  disabled={deciding !== null}
                  style={{ flex: 1, padding: '9px 12px' }}
                >
                  {deciding === 'rejected' ? 'Rejecting…' : '✕ Reject'}
                </button>
              </div>

              <p style={{
                fontSize: 11, color: 'var(--text-muted)',
                marginTop: 12, lineHeight: 1.5,
              }}>
                Approved resources become visible to every class member immediately.
              </p>
            </div>
          )}

          {versions.length > 0 && (
            <InfoCard title={`Version history (${versions.length})`}>
              <div style={{ display: 'grid', gap: 0 }}>
                {versions.map((v, idx) => (
                  <div key={v.id} style={{
                    padding: '10px 0',
                    borderTop: idx === 0 ? 'none' : '1px solid var(--border)',
                  }}>
                    <div style={{
                      display: 'flex', gap: 8, alignItems: 'center',
                      flexWrap: 'wrap', marginBottom: 4,
                    }}>
                      <strong style={{ fontSize: 13 }}>v{v.version_number}</strong>
                      {v.is_current && <span className="badge badge-success" style={{ fontSize: 10 }}>current</span>}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {v.uploaded_by_name} · {new Date(v.created_at).toLocaleDateString()}
                    </div>
                    <button
                      onClick={() => downloadVersion(v)}
                      style={{
                        marginTop: 6, padding: '4px 10px',
                        fontSize: 11, borderRadius: 'var(--radius-sm)',
                      }}
                    >
                      Download
                    </button>
                  </div>
                ))}
              </div>
            </InfoCard>
          )}

          {canManage && (
            <InfoCard title="Manage">
              <p style={{
                fontSize: 12, color: 'var(--text-muted)',
                lineHeight: 1.55, margin: '0 0 10px',
              }}>
                Replace the current file with v{r.version + 1}. Older versions stay downloadable.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleVersionUpload}
                disabled={uploadingVersion}
                style={{ display: 'none' }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingVersion}
                className="btn-primary"
                style={{ width: '100%', padding: '9px 16px' }}
              >
                {uploadingVersion ? 'Uploading…' : 'Upload new version'}
              </button>
            </InfoCard>
          )}

          <InfoCard title="About">
            <p style={{
              fontSize: 12, color: 'var(--text-muted)',
              lineHeight: 1.6, margin: 0,
            }}>
              <strong>Open</strong> previews PDFs, images, and text in a new tab.
              Other formats will download.
            </p>
          </InfoCard>
        </aside>
      </div>
    </div>
  );
} 