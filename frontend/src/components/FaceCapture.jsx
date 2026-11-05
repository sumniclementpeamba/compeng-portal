import { useCallback, useEffect, useRef, useState } from 'react';

const COUNTDOWN_SECONDS = 3;
const READY_DELAY_MS = 800;
const RETRY_DELAY_MS = 1800;

export default function FaceCapture({ onCapture, disabled, autoStart = true }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const countdownTimerRef = useRef(null);
  const capturedRef = useRef(false);
  const startingRef = useRef(false);
  const mountedRef = useRef(true);
  const retryRef = useRef(null);
  const startCameraRef = useRef(null);

  const [phase, setPhase] = useState('starting');
  const [status, setStatus] = useState('Opening camera…');
  const [countdown, setCountdown] = useState(null);
  const [err, setErr] = useState('');
  const [previewUrl, setPreviewUrl] = useState(null);

  const stopCamera = useCallback(() => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    if (retryRef.current) {
      clearTimeout(retryRef.current);
      retryRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopCamera();
      setPreviewUrl((u) => {
        if (u) URL.revokeObjectURL(u);
        return null;
      });
    };
  }, [stopCamera]);

  const doCapture = useCallback(async () => {
    if (capturedRef.current) return;
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!v || !c || !v.videoWidth || !v.videoHeight) return;

    capturedRef.current = true;

    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }

    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);

    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9));
    if (!blob) { capturedRef.current = false; return; }
    if (!mountedRef.current) return;

    stopCamera();
    setPhase('verifying');
    setCountdown(null);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(blob);
    });

    try {
      await onCapture(blob);
    } catch (e) {
      if (!mountedRef.current) return;
      setErr(e?.message || 'Verification failed. Please try again.');

      retryRef.current = setTimeout(() => {
        if (!mountedRef.current) return;
        setPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return null;
        });
        setErr('');
        setPhase('starting');
        capturedRef.current = false;
        startingRef.current = false;
        startCameraRef.current?.();
      }, RETRY_DELAY_MS);
    }
  }, [onCapture, stopCamera]);

  const startCountdown = useCallback(() => {
    if (capturedRef.current) return;
    setStatus('Look at the camera');
    setCountdown(COUNTDOWN_SECONDS);

    let remaining = COUNTDOWN_SECONDS;
    countdownTimerRef.current = setInterval(() => {
      if (!mountedRef.current || capturedRef.current) {
        clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
        return;
      }
      remaining -= 1;
      setCountdown(remaining);
      if (remaining <= 0) {
        clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
        doCapture();
      }
    }, 1000);
  }, [doCapture]);

  const startCamera = useCallback(async () => {
    if (startingRef.current || streamRef.current) return;
    startingRef.current = true;

    setErr('');
    setCountdown(null);
    setStatus('Opening camera…');
    capturedRef.current = false;
    setPhase('starting');

    // ── Secure-context pre-flight ─────────────────────────
    // Browsers only expose camera on HTTPS or localhost.
    // Detect this up-front with a clear message instead of
    // letting getUserMedia throw a cryptic TypeError.
    if (!window.isSecureContext) {
      const host = window.location.host;
      setErr(
        `Camera needs a secure connection. You're on http://${host}. ` +
        `Use the HTTPS link (Vercel deploy or a tunnel like cloudflared) — ` +
        `camera will not work over plain HTTP on a network IP.`
      );
      setPhase('error');
      startingRef.current = false;
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setErr('This browser does not support camera access. Try Chrome or Safari.');
      setPhase('error');
      startingRef.current = false;
      return;
    }

    try {
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
          audio: false,
        });
      } catch (e) {
        const msg =
          e.name === 'NotAllowedError'
            ? 'Camera permission denied. Allow it in browser settings and try again.'
            : e.name === 'NotReadableError'
            ? 'Camera is in use by another app (Zoom, FaceTime, Teams). Close it and retry.'
            : e.name === 'NotFoundError'
            ? 'No camera found on this device.'
            : e.name === 'OverconstrainedError'
            ? 'This camera cannot satisfy the required resolution. Try another device.'
            : `Could not open the camera (${e.name}).`;
        if (!mountedRef.current) return;
        setErr(msg);
        setPhase('error');
        startingRef.current = false;
        return;
      }

      if (!mountedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;

      const v = videoRef.current;
      if (!v) {
        setErr('Video element not ready.');
        setPhase('error');
        startingRef.current = false;
        stopCamera();
        return;
      }
      v.srcObject = stream;

      try {
        await v.play();
      } catch (e) {
        setErr(
          e.name === 'NotAllowedError'
            ? 'Autoplay was blocked. Click once anywhere, then try again.'
            : `Video failed to start (${e.name}).`,
        );
        setPhase('error');
        startingRef.current = false;
        stopCamera();
        return;
      }

      await new Promise((resolve) => {
        if (v.readyState >= 2 && v.videoWidth > 0) { resolve(); return; }
        const done = () => { v.removeEventListener('loadeddata', done); resolve(); };
        v.addEventListener('loadeddata', done);
        setTimeout(done, 2000);
      });

      if (!mountedRef.current) return;

      setPhase('live');
      setStatus('Get ready…');
      startingRef.current = false;

      setTimeout(() => {
        if (mountedRef.current && !capturedRef.current && streamRef.current) {
          startCountdown();
        }
      }, READY_DELAY_MS);
    } catch (e) {
      console.error('[FaceCapture] error:', e);
      if (!mountedRef.current) return;
      setErr(`Could not start camera (${e.name || 'error'}).`);
      setPhase('error');
      startingRef.current = false;
      stopCamera();
    }
  }, [startCountdown, stopCamera]);

  startCameraRef.current = startCamera;

  useEffect(() => {
    if (!autoStart || disabled) return;
    const t = setTimeout(() => {
      if (mountedRef.current) startCamera();
    }, 80);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  function captureManually() { doCapture(); }
  function retry() {
    setErr('');
    setPhase('starting');
    startingRef.current = false;
    startCamera();
  }

  const showVideo = phase === 'live' || phase === 'verifying';

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '4 / 3',
          background: '#000',
          borderRadius: 'var(--radius)',
          overflow: 'hidden',
        }}
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: 'scaleX(-1)',
            background: '#000',
            opacity: showVideo ? 1 : 0,
          }}
        />

        {previewUrl && phase === 'verifying' && (
          <img
            src={previewUrl}
            alt="Captured"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              transform: 'scaleX(-1)',
            }}
          />
        )}

        {phase === 'starting' && (
          <div style={{
            position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
            background: 'rgba(0,0,0,0.75)', color: '#fff', textAlign: 'center', padding: 20,
          }}>
            <div>
              <div className="spinner" style={{ width: 28, height: 28, borderWidth: 3, margin: '0 auto 12px' }} />
              <div style={{ fontSize: 13 }}>{status}</div>
            </div>
          </div>
        )}

        {phase === 'live' && (
          <>
            <div style={{
              position: 'absolute', top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '50%', aspectRatio: '1',
              border: `3px dashed ${countdown !== null ? 'var(--success)' : 'rgba(255,255,255,0.55)'}`,
              borderRadius: '50%', pointerEvents: 'none',
              transition: 'border-color 200ms ease',
            }} />
            <div style={{
              position: 'absolute', top: 12, left: 12, right: 12,
              display: 'flex', justifyContent: 'center', pointerEvents: 'none',
            }}>
              <div style={{
                padding: '6px 14px', borderRadius: 999,
                background: countdown !== null ? 'var(--success)' : 'rgba(0,0,0,0.65)',
                color: '#fff', fontSize: 12, fontWeight: 600,
                boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
              }}>
                {countdown !== null ? '● Look at the camera' : '● Get ready'}
              </div>
            </div>
            {countdown !== null && countdown > 0 && (
              <div style={{
                position: 'absolute', top: '50%', left: '50%',
                transform: 'translate(-50%, -50%)',
                fontSize: 96, fontWeight: 800, color: '#fff',
                textShadow: '0 4px 24px rgba(0,0,0,0.7)',
                pointerEvents: 'none', lineHeight: 1,
                fontVariantNumeric: 'tabular-nums',
              }}>
                {countdown}
              </div>
            )}
          </>
        )}

        {phase === 'error' && (
          <div style={{
            position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
            background: '#000', padding: 20, textAlign: 'center',
          }}>
            <div>
              <div style={{ fontSize: 36 }}>⚠️</div>
              <p style={{ fontSize: 13, color: '#fca5a5', marginTop: 8, lineHeight: 1.5 }}>
                {err}
              </p>
            </div>
          </div>
        )}
      </div>

      {phase === 'live' && (
        <div style={{
          fontSize: 13, fontWeight: 500, textAlign: 'center',
          minHeight: 20, color: 'var(--slate-700)',
        }}>
          {status}
        </div>
      )}

      {err && phase !== 'error' && phase !== 'verifying' && (
        <div style={{ fontSize: 13, color: 'var(--danger)', textAlign: 'center', minHeight: 20 }}>
          {err}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        {phase === 'live' && (
          <button
            type="button"
            onClick={captureManually}
            disabled={disabled}
            className="btn-primary"
            style={{ padding: '9px 16px' }}
          >
            📸 Capture now
          </button>
        )}
        {phase === 'error' && window.isSecureContext && (
          <button
            type="button"
            onClick={retry}
            className="btn-primary"
            style={{ padding: '9px 16px' }}
          >
            Try again
          </button>
        )}
      </div>

      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  );
} 