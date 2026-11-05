import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api/client';
import FaceCapture from './FaceCapture';

const FaceEnrollStyles = () => (
  <style>{`
    @keyframes faceEnrollFadeIn {
      from { opacity: 0; } to { opacity: 1; }
    }
    @keyframes faceEnrollSlideDown {
      from { opacity: 0; transform: translateY(-16px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes faceEnrollPopIn {
      0% { opacity: 0; transform: scale(0.7); }
      60% { opacity: 1; transform: scale(1.08); }
      100% { opacity: 1; transform: scale(1); }
    }
  `}</style>
);

export default function FaceEnrollment() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [modalStep, setModalStep] = useState('camera');
  const [capturedBlob, setCapturedBlob] = useState(null);
  const [capturedUrl, setCapturedUrl] = useState(null);
  const [captureKey, setCaptureKey] = useState(0);

  const capturedUrlRef = useRef(null);
  useEffect(() => { capturedUrlRef.current = capturedUrl; }, [capturedUrl]);
  useEffect(() => () => {
    if (capturedUrlRef.current) URL.revokeObjectURL(capturedUrlRef.current);
  }, []);

  async function load() {
    try {
      const s = await api.get('/me/face/status/');
      setStatus(s);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function openModal() {
    setErr('');
    setModalStep('camera');
    setCapturedBlob(null);
    if (capturedUrl) URL.revokeObjectURL(capturedUrl);
    setCapturedUrl(null);
    setCaptureKey((k) => k + 1);
    setModalOpen(true);
  }

  function closeModal() {
    if (busy || modalStep === 'uploading' || modalStep === 'success') return;
    setModalOpen(false);
    setTimeout(() => {
      setModalStep('camera');
      if (capturedUrl) URL.revokeObjectURL(capturedUrl);
      setCapturedUrl(null);
      setCapturedBlob(null);
      setErr('');
    }, 250);
  }

  function handleCapture(blob) {
    setCapturedBlob(blob);
    if (capturedUrl) URL.revokeObjectURL(capturedUrl);
    setCapturedUrl(URL.createObjectURL(blob));
    setModalStep('confirm');
  }

  function retake() {
    if (capturedUrl) URL.revokeObjectURL(capturedUrl);
    setCapturedUrl(null);
    setCapturedBlob(null);
    setModalStep('camera');
    setCaptureKey((k) => k + 1);
  }

  async function confirmAndUpload() {
    if (!capturedBlob || busy) return;
    setBusy(true);
    setModalStep('uploading');
    setErr('');

    try {
      const fd = new FormData();
      fd.append('photo', capturedBlob, 'face.jpg');
      fd.append('consent', 'true');
      await api.post('/me/face/enroll/', fd);

      setModalStep('success');
      setTimeout(async () => {
        await load();
        setModalOpen(false);
        setConsent(false);
        setMsg('Face enrolled — you can now check in with face verification.');
        setTimeout(() => setMsg(''), 5000);
      }, 1200);
    } catch (e) {
      // Detect the "closed by admin" case explicitly
      const isClosed =
        e?.status === 403 && e?.data?.reason === 'enrollment_closed';

      const detail = isClosed
        ? 'Face enrollment is currently closed by the course admin. '
          + 'They will open it when it is time to enrol. '
          + 'You can still check in if you are already enrolled.'
        : e?.data?.detail ||
          (e?.status === 400 && e?.data?.reason === 'no_face' &&
            'No face detected in the photo. Try better lighting and centre your face.') ||
          e?.message ||
          'Could not enroll your face. Please try again.';

      setErr(detail);
      setModalStep('confirm');
      // If they got closed mid-flow, refresh status so the card updates
      if (isClosed) load();
    } finally {
      setBusy(false);
    }
  }

  async function removeFace() {
    if (!confirm('Remove your face data? You will need to re-enroll to use face check-in.')) return;
    setBusy(true); setErr(''); setMsg('');
    try {
      await api.post('/me/face/', {});
      setMsg('Face data removed.');
      await load();
      setTimeout(() => setMsg(''), 4000);
    } catch (e) {
      setErr(e?.data?.detail || e?.message || 'Could not remove face data.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="card" style={{ padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="spinner spinner-dark" style={{ width: 20, height: 20, borderWidth: 2 }} />
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading face verification…</span>
        </div>
      </div>
    );
  }

  const enrolled = status?.enrolled === true;
  const enrollmentOpen = status?.enrollment_open !== false; // fail-open if missing
  const enrolledDate = status?.enrolled_at
    ? new Date(status.enrolled_at).toLocaleDateString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric',
      })
    : null;

  // Closed-for-new-enrollees state
  const showClosedForNew = !enrolled && !enrollmentOpen;

  return (
    <>
      <FaceEnrollStyles />

      <div
        className="card"
        style={{
          padding: 0,
          overflow: 'hidden',
          borderLeft: enrolled
            ? '3px solid var(--success)'
            : showClosedForNew
            ? '3px solid var(--slate-400)'
            : '3px solid var(--brand)',
          background: enrolled
            ? 'linear-gradient(180deg, #f0fdf4 0%, #ffffff 60%)'
            : showClosedForNew
            ? 'linear-gradient(180deg, #f8fafc 0%, #ffffff 60%)'
            : 'linear-gradient(180deg, #eff6ff 0%, #ffffff 60%)',
        }}
      >
        <div style={{ padding: '20px 20px 0', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <div
            style={{
              width: 48, height: 48, borderRadius: 14,
              background: enrolled
                ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)'
                : showClosedForNew
                ? 'linear-gradient(135deg, #94a3b8 0%, #64748b 100%)'
                : 'linear-gradient(135deg, var(--brand) 0%, var(--brand-600, #1d4ed8) 100%)',
              display: 'grid', placeItems: 'center', fontSize: 22,
              flexShrink: 0, color: '#fff', fontWeight: 700,
            }}
          >
            {enrolled ? '✓' : showClosedForNew ? '🔒' : '🧑'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, letterSpacing: '-0.01em' }}>
                Face verification
              </h3>
              {enrolled ? (
                <span className="badge badge-success" style={{ fontSize: 10 }}>✓ Enrolled</span>
              ) : showClosedForNew ? (
                <span className="badge badge-neutral" style={{ fontSize: 10 }}>🔒 Closed</span>
              ) : (
                <span className="badge badge-warning" style={{ fontSize: 10 }}>⚠ Not set up</span>
              )}
            </div>
            <p style={{ fontSize: 13, color: 'var(--slate-600)', margin: 0, lineHeight: 1.55 }}>
              {enrolled
                ? `Your face is enrolled${enrolledDate ? ` since ${enrolledDate}` : ''}. It's used only to confirm it's you when checking in.`
                : showClosedForNew
                ? 'Face enrollment is currently closed by your course admin. They will open it when it is time for the class to enrol.'
                : "Enrol a photo of your face so the system can confirm it's really you when you check in to class."}
            </p>
          </div>
        </div>

        <div style={{ padding: 20 }}>
          {msg && (
            <div style={{
              padding: '10px 14px', background: 'var(--success-bg)', color: 'var(--success)',
              borderRadius: 10, fontSize: 13, marginBottom: 14,
              border: '1px solid #bbf7d0', display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ flexShrink: 0 }}>✓</span><span>{msg}</span>
            </div>
          )}

          {err && !modalOpen && (
            <div role="alert" style={{
              padding: '10px 14px', background: 'var(--danger-bg)', color: 'var(--danger)',
              borderRadius: 10, fontSize: 13, marginBottom: 14, border: '1px solid #fecaca',
            }}>{err}</div>
          )}

          {enrolled ? (
            <div style={{ display: 'grid', gap: 12 }}>
              <div style={{
                padding: '12px 14px', background: 'var(--slate-50)', borderRadius: 10,
                fontSize: 12, color: 'var(--slate-700)', lineHeight: 1.6,
                display: 'grid', gap: 8,
              }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <span>📷</span>
                  <span>Check-in opens your camera and captures with a countdown.</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <span>🔒</span>
                  <span>Photos are stored securely. Only you and your rep can review flagged check-ins.</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <span>🔄</span>
                  <span>Changed appearance? Re-enrol to keep verification accurate.</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={openModal}
                  disabled={busy || !enrollmentOpen}
                  className="btn-primary"
                  style={{ padding: '9px 16px', opacity: !enrollmentOpen ? 0.5 : 1, cursor: !enrollmentOpen ? 'not-allowed' : 'pointer' }}
                  title={!enrollmentOpen ? 'Admin has closed enrollment' : undefined}
                >
                  ↻ Re-enroll face
                </button>
                <button
                  type="button"
                  onClick={removeFace}
                  disabled={busy}
                  style={{
                    padding: '9px 16px', background: '#fff',
                    border: '1px solid #fecaca', color: 'var(--danger)',
                    borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 500,
                    cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1,
                  }}
                >
                  Remove my face data
                </button>
              </div>
              {!enrollmentOpen && (
                <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
                  Enrollment is closed — you can still check in with your existing face. Re-enrolment
                  will be available when the admin opens enrollment again.
                </p>
              )}
            </div>
          ) : showClosedForNew ? (
            <div style={{
              padding: '14px 16px', background: '#fff',
              border: '1px dashed var(--border-strong)', borderRadius: 10,
              fontSize: 13, color: 'var(--slate-700)', lineHeight: 1.55,
            }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 20, flexShrink: 0 }}>ℹ️</span>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>Enrollment is closed</div>
                  Your course admin controls when face enrollment is open. They will open it when
                  it is time for the class to enrol — you'll see a "Start enrollment" button here
                  when that happens.
                </div>
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 14 }}>
              <div style={{
                padding: '14px 16px', background: '#fff',
                border: '1px solid var(--border)', borderRadius: 10, display: 'grid', gap: 10,
              }}>
                <div style={{
                  fontSize: 11, fontWeight: 700, color: 'var(--slate-700)',
                  textTransform: 'uppercase', letterSpacing: '0.06em',
                }}>How it works</div>
                <div style={{
                  display: 'grid', gap: 10, fontSize: 13,
                  color: 'var(--slate-700)', lineHeight: 1.55,
                }}>
                  {[
                    'Open the camera and centre your face',
                    'We capture automatically once your face is steady',
                    "Confirm the photo — that's it, you're enrolled",
                  ].map((step, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <span style={{
                        width: 22, height: 22, borderRadius: '50%',
                        background: 'var(--brand)', color: '#fff',
                        display: 'grid', placeItems: 'center',
                        fontSize: 11, fontWeight: 700, flexShrink: 0,
                      }}>{idx + 1}</span>
                      <span style={{ paddingTop: 2 }}>{step}</span>
                    </div>
                  ))}
                </div>
              </div>

              <label style={{
                display: 'flex', gap: 10, alignItems: 'flex-start',
                padding: '12px 14px',
                background: consent ? 'var(--success-bg)' : 'var(--slate-50)',
                border: `1px solid ${consent ? '#bbf7d0' : 'var(--border)'}`,
                borderRadius: 10, cursor: 'pointer', fontSize: 13, lineHeight: 1.5,
                color: 'var(--slate-700)', transition: 'all 150ms ease',
              }}>
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  style={{ marginTop: 3, flexShrink: 0 }}
                />
                <span>
                  <strong style={{ color: 'var(--text)' }}>I consent</strong> to my face being used
                  for attendance verification. My data is stored securely and can be removed at any time.
                </span>
              </label>

              <button
                type="button"
                onClick={openModal}
                disabled={!consent}
                className="btn-primary"
                style={{
                  padding: '11px 18px', fontSize: 14, fontWeight: 600,
                  opacity: consent ? 1 : 0.5,
                  cursor: consent ? 'pointer' : 'not-allowed',
                  justifySelf: 'start',
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                }}
              >
                📷 Start enrollment
              </button>
            </div>
          )}
        </div>
      </div>

      {modalOpen && createPortal(
        <div
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(15, 23, 42, 0.55)',
            backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
            zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
            paddingTop: 'max(5vh, 32px)', paddingLeft: 16, paddingRight: 16,
            paddingBottom: 24, overflowY: 'auto',
            animation: 'faceEnrollFadeIn 200ms ease-out',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div style={{
            background: '#fff', borderRadius: 20, width: '100%', maxWidth: 440,
            padding: '20px 20px 22px',
            boxShadow: '0 24px 60px rgba(15,23,42,0.28), 0 8px 20px rgba(15,23,42,0.12)',
            display: 'grid', gap: 16,
            animation: 'faceEnrollSlideDown 280ms cubic-bezier(0.2, 0.8, 0.2, 1)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: modalStep === 'success'
                    ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)'
                    : 'linear-gradient(135deg, var(--brand) 0%, var(--brand-600, #1d4ed8) 100%)',
                  display: 'grid', placeItems: 'center', fontSize: 18,
                  color: '#fff', fontWeight: 700, flexShrink: 0,
                }}>
                  {modalStep === 'success' ? '✓' : '🧑'}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em' }}>
                    {modalStep === 'success' ? 'Face enrolled' : 'Enrol your face'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>
                    {modalStep === 'camera' && 'Hold steady — we capture automatically'}
                    {modalStep === 'confirm' && 'Check the photo looks like you'}
                    {modalStep === 'uploading' && 'Saving your face data…'}
                    {modalStep === 'success' && "You can now check in with your face"}
                  </div>
                </div>
              </div>
              {modalStep !== 'uploading' && modalStep !== 'success' && (
                <button
                  onClick={closeModal}
                  style={{
                    width: 32, height: 32, borderRadius: 8,
                    background: 'var(--slate-100)', border: 'none',
                    cursor: 'pointer', display: 'grid', placeItems: 'center',
                    fontSize: 14, color: 'var(--slate-600)', flexShrink: 0,
                  }}
                  aria-label="Close"
                >✕</button>
              )}
            </div>

            {modalStep === 'camera' && (
              <FaceCapture
                key={captureKey}
                autoStart={true}
                onCapture={handleCapture}
                disabled={false}
              />
            )}

            {modalStep === 'confirm' && capturedUrl && (
              <div style={{ display: 'grid', gap: 12 }}>
                <div style={{
                  position: 'relative', width: '100%', aspectRatio: '4 / 3',
                  background: '#000', borderRadius: 'var(--radius)', overflow: 'hidden',
                }}>
                  <img
                    src={capturedUrl}
                    alt="Enrollment photo preview"
                    style={{
                      width: '100%', height: '100%', objectFit: 'cover',
                      transform: 'scaleX(-1)',
                    }}
                  />
                  <div style={{
                    position: 'absolute', bottom: 10, left: 10,
                    padding: '4px 10px', borderRadius: 999,
                    background: 'rgba(0,0,0,0.7)', color: '#fff',
                    fontSize: 11, fontWeight: 600,
                  }}>Preview</div>
                </div>
                {err && (
                  <div role="alert" style={{
                    padding: '10px 12px', background: 'var(--danger-bg)', color: 'var(--danger)',
                    borderRadius: 10, fontSize: 13, lineHeight: 1.5, border: '1px solid #fecaca',
                  }}>{err}</div>
                )}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={confirmAndUpload}
                    disabled={busy}
                    className="btn-primary"
                    style={{
                      padding: '11px 18px', fontSize: 14, fontWeight: 600,
                      flex: '1 1 auto', minWidth: 140,
                    }}
                  >✓ Use this photo</button>
                  <button
                    type="button"
                    onClick={retake}
                    disabled={busy}
                    style={{
                      padding: '11px 18px', fontSize: 14, fontWeight: 500,
                      borderRadius: 'var(--radius-sm)', background: '#fff',
                      border: '1px solid var(--border-strong)', color: 'var(--slate-700)',
                      cursor: busy ? 'not-allowed' : 'pointer',
                    }}
                  >↻ Retake</button>
                </div>
              </div>
            )}

            {modalStep === 'uploading' && (
              <div style={{ padding: '44px 20px', display: 'grid', placeItems: 'center', gap: 14 }}>
                <span className="spinner spinner-dark" style={{ width: 32, height: 32, borderWidth: 3 }} />
                <div style={{ fontSize: 13, color: 'var(--slate-600)', textAlign: 'center' }}>
                  Extracting face embedding…
                </div>
              </div>
            )}

            {modalStep === 'success' && (
              <div style={{
                padding: '32px 20px', display: 'grid', placeItems: 'center',
                gap: 12, textAlign: 'center',
              }}>
                <div style={{
                  width: 64, height: 64, borderRadius: '50%',
                  background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                  display: 'grid', placeItems: 'center', fontSize: 32,
                  color: '#fff', boxShadow: '0 8px 24px rgba(34,197,94,0.3)',
                  animation: 'faceEnrollPopIn 400ms cubic-bezier(0.2, 0.8, 0.2, 1)',
                }}>✓</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--success)' }}>
                  Face enrolled successfully
                </div>
                <div style={{
                  fontSize: 13, color: 'var(--slate-600)',
                  lineHeight: 1.5, maxWidth: 280,
                }}>
                  Next time you check in to class, your camera will verify it's you.
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
} 