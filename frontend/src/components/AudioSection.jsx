import { useEffect, useMemo, useRef, useState } from 'react';

const PREFERRED_MIMES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
];

function pickMime() {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const m of PREFERRED_MIMES) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return '';
}

function fmtTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function fmtBytes(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function AudioSection({ value, onChange, disabled }) {
  const [recording, setRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState('');
  const [supported, setSupported] = useState(false);

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const streamRef = useRef(null);
  const mimeRef = useRef('');

  useEffect(() => {
    const mime = pickMime();
    mimeRef.current = mime;
    setSupported(mime !== null);
    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const previewUrl = useMemo(
    () => (value ? URL.createObjectURL(value) : null),
    [value]
  );
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  async function start() {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const opts = mimeRef.current ? { mimeType: mimeRef.current } : {};
      const mr = new MediaRecorder(stream, opts);
      mediaRecorderRef.current = mr;
      chunksRef.current = [];

      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      mr.onstop = () => {
        const type = mimeRef.current || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type });
        const ext = type.includes('mp4') ? 'm4a'
          : type.includes('ogg') ? 'ogg'
          : 'webm';
        const file = new File([blob], `recording-${Date.now()}.${ext}`, { type });
        onChange(file);
        stream.getTracks().forEach((t) => t.stop());
      };

      mr.start();
      setRecording(true);
      setDuration(0);
      timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
    } catch (e) {
      setError(e.message || 'Microphone access denied.');
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    }
  }

  function stop() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setRecording(false);
  }

  if (value) {
    return (
      <div style={{ display: 'grid', gap: 10 }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', gap: 8, padding: '10px 12px',
          background: 'var(--slate-50)', borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border)',
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontSize: 13, fontWeight: 500,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {value.name}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              {fmtBytes(value.size)}
            </div>
          </div>
          <button
            type="button"
            onClick={() => onChange(null)}
            disabled={disabled}
            style={{
              background: 'transparent', border: 'none',
              color: 'var(--danger)', fontSize: 13, cursor: 'pointer',
            }}
          >
            Remove
          </button>
        </div>
        <audio src={previewUrl} controls style={{ width: '100%' }} />
      </div>
    );
  }

  if (recording) {
    return (
      <div style={{ display: 'grid', gap: 10 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 16px', background: 'var(--danger-bg)',
          borderRadius: 'var(--radius-sm)', border: '1px solid #fecaca',
        }}>
          <div style={{
            width: 10, height: 10, borderRadius: '50%',
            background: 'var(--danger)',
          }} />
          <span style={{
            fontWeight: 600, color: 'var(--danger)',
            fontVariantNumeric: 'tabular-nums',
          }}>
            Recording {fmtTime(duration)}
          </span>
        </div>
        <button
          type="button"
          onClick={stop}
          className="btn-danger"
          style={{ padding: '9px 16px' }}
        >
          ⏹ Stop recording
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {supported && (
        <button
          type="button"
          onClick={start}
          disabled={disabled}
          style={{
            padding: '10px 16px',
            borderRadius: 'var(--radius-sm)',
            border: '1px dashed var(--border-strong)',
            background: '#fff',
            cursor: disabled ? 'not-allowed' : 'pointer',
            fontSize: 14,
            fontWeight: 500,
            color: 'var(--text)',
          }}
        >
          🎙️ Record audio
        </button>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        <span style={{
          fontSize: 11, color: 'var(--text-muted)',
          textTransform: 'uppercase', letterSpacing: '0.06em',
        }}>
          or upload a file
        </span>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      </div>

      <input
        type="file"
        accept="audio/*,audio/webm,audio/mp4,audio/mpeg,audio/ogg,audio/wav,audio/x-m4a"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onChange(f);
          e.target.value = '';
        }}
        disabled={disabled}
        style={{ width: '100%', padding: 8 }}
      />

      {error && (
        <div style={{ color: 'var(--danger)', fontSize: 12 }}>{error}</div>
      )}
    </div>
  );
}