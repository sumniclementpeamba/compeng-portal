import { useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api, getToken } from '../api/client';
import { PageHeader, InfoCard } from '../components/PageUI';

const LABEL = { fontSize: 13, fontWeight: 500, color: 'var(--slate-700)', display: 'block' };
const FIELD = { width: '100%', marginTop: 4 };

export default function Profile() {
  const { user, refresh } = useAuth();
  const [editing, setEditing] = useState(false);
  const [avatarVersion, setAvatarVersion] = useState(0);
  const [imgFailed, setImgFailed] = useState(false);
  const fileInputRef = useRef(null);

  const [form, setForm] = useState({
    first_name: user?.first_name || '',
    email: user?.email || '',
    level: user?.level || '',
  });
  const [newAvatar, setNewAvatar] = useState(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  if (!user) return null;

  const displayName = user.first_name || user.username;
  const initials = displayName.slice(0, 2).toUpperCase();
  const roleBadge =
    user.role === 'admin'
      ? 'badge-danger'
      : user.role === 'rep'
      ? 'badge-warning'
      : 'badge-neutral';

  // Avatar source for display
  const serverAvatarSrc = user.avatar_url
    ? `${user.avatar_url}?token=${getToken()}&v=${avatarVersion}`
    : null;

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  function handleFileSelect(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) {
      setErr('Avatar must be under 2 MB.');
      return;
    }
    if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
    setNewAvatar(f);
    setAvatarPreviewUrl(URL.createObjectURL(f));
    setRemoveAvatar(false);
    setErr('');
    e.target.value = '';
  }

  function cancelEdit() {
    setEditing(false);
    setForm({
      first_name: user.first_name || '',
      email: user.email || '',
      level: user.level || '',
    });
    if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
    setNewAvatar(null);
    setAvatarPreviewUrl(null);
    setRemoveAvatar(false);
    setErr('');
    setMsg('');
  }

  async function save(e) {
    e.preventDefault();
    setErr('');
    setMsg('');
    setBusy(true);
    try {
      const fd = new FormData();

      const trimmedName = form.first_name.trim();
      if (trimmedName && trimmedName !== user.first_name) {
        fd.append('first_name', trimmedName);
      }
      if ((form.email || '') !== (user.email || '')) {
        fd.append('email', form.email || '');
      }
      if ((form.level || '') !== (user.level || '')) {
        fd.append('level', form.level || '');
      }
      if (newAvatar) {
        fd.append('avatar', newAvatar);
      }
      if (removeAvatar) {
        fd.append('avatar_clear', 'true');
      }

      await api.patch('/me/', fd);
      await refresh();

      // Reset edit state
      if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
      setNewAvatar(null);
      setAvatarPreviewUrl(null);
      setRemoveAvatar(false);
      setEditing(false);
      setAvatarVersion((v) => v + 1);
      setImgFailed(false);
      setMsg('Profile updated successfully.');
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  // Determine which avatar preview to render while editing
  const editingAvatarSrc = avatarPreviewUrl
    ? avatarPreviewUrl
    : removeAvatar
    ? null
    : serverAvatarSrc;

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Account"
        title="Profile"
        subtitle="Your details as they appear to the class."
        actions={
          !editing ? (
            <button
              onClick={() => setEditing(true)}
              className="btn-primary"
              style={{ padding: '9px 18px' }}
            >
              Edit profile
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={cancelEdit}
                disabled={busy}
                style={{ padding: '9px 16px' }}
              >
                Cancel
              </button>
              <button
                type="submit"
                form="profile-form"
                className="btn-primary"
                disabled={busy}
                style={{ padding: '9px 16px' }}
              >
                {busy ? 'Saving…' : 'Save changes'}
              </button>
            </>
          )
        }
      />

      {msg && !editing && (
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

      {err && (
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

      <div className="split-grid">
        <div style={{ display: 'grid', gap: 20 }}>
          {/* ── Hero card: avatar + name ─────────────── */}
          <div className="card" style={{ padding: 24 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 20,
                flexWrap: 'wrap',
              }}
            >
              <AvatarDisplay
                src={editing ? editingAvatarSrc : serverAvatarSrc}
                initials={initials}
                size={96}
                onImageError={() => setImgFailed(true)}
                imgFailed={imgFailed}
              />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 700,
                    letterSpacing: '-0.02em',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {displayName}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: 'var(--text-muted)',
                    marginTop: 2,
                  }}
                >
                  {user.role === 'admin'
                    ? 'Administrator'
                    : user.role === 'rep'
                    ? 'Course Representative'
                    : 'Student'}
                </div>
                <span className={`badge ${roleBadge}`} style={{ marginTop: 8 }}>
                  {user.role}
                </span>
              </div>
              {editing && (
                <div style={{ display: 'grid', gap: 6 }}>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    onChange={handleFileSelect}
                    style={{ display: 'none' }}
                  />
                  <button
                    type="button"
                    onClick={openFilePicker}
                    className="btn-primary"
                    style={{ padding: '8px 14px', fontSize: 13 }}
                  >
                    Change photo
                  </button>
                  {(serverAvatarSrc || newAvatar) && !removeAvatar && (
                    <button
                      type="button"
                      onClick={() => {
                        if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
                        setNewAvatar(null);
                        setAvatarPreviewUrl(null);
                        setRemoveAvatar(true);
                      }}
                      style={{
                        padding: '6px 12px',
                        fontSize: 12,
                        color: 'var(--danger)',
                        background: 'transparent',
                        border: 'none',
                      }}
                    >
                      Remove photo
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ── Account details (view / edit) ────────── */}
          {editing ? (
            <form
              id="profile-form"
              onSubmit={save}
              className="card"
              style={{ padding: 24, display: 'grid', gap: 14 }}
            >
              <h2
                style={{
                  fontSize: 13,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: 'var(--text-muted)',
                  fontWeight: 600,
                  margin: 0,
                }}
              >
                Account details
              </h2>

              <label style={LABEL}>
                Full name *
                <input
                  value={form.first_name}
                  onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                  required
                  style={FIELD}
                  placeholder="e.g. Sandra Sarkodie"
                />
              </label>

              <label style={LABEL}>
                Email
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  style={FIELD}
                  placeholder="you@example.com"
                />
              </label>

              <label style={LABEL}>
                Level
                <input
                  value={form.level}
                  onChange={(e) => setForm({ ...form, level: e.target.value })}
                  style={FIELD}
                  placeholder="300"
                />
              </label>

              <p
                style={{
                  fontSize: 12,
                  color: 'var(--text-muted)',
                  margin: 0,
                }}
              >
                Your sign-in ID stays the same even if you change your name.
              </p>
            </form>
          ) : (
            <div className="card" style={{ padding: 24 }}>
              <h2
                style={{
                  fontSize: 13,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: 'var(--text-muted)',
                  marginBottom: 16,
                  fontWeight: 600,
                }}
              >
                Account details
              </h2>
              <dl
                style={{
                  display: 'grid',
                  gridTemplateColumns: '140px 1fr',
                  gap: 12,
                  margin: 0,
                }}
              >
                <DetailRow label="Full name" value={user.first_name || '—'} />
                <DetailRow label="Email" value={user.email || '—'} />
                <DetailRow label="Level" value={user.level || '—'} />
              </dl>
            </div>
          )}
        </div>

        <aside style={{ display: 'grid', gap: 16 }}>
          <InfoCard title="Sign-in ID">
            <code
              style={{
                display: 'block',
                padding: '10px 12px',
                background: 'var(--slate-100)',
                borderRadius: 'var(--radius-sm)',
                fontSize: 13,
                color: 'var(--slate-700)',
                wordBreak: 'break-all',
              }}
            >
              {user.username}
            </code>
            <p
              style={{
                fontSize: 12,
                color: 'var(--text-muted)',
                marginTop: 10,
                lineHeight: 1.55,
              }}
            >
              You can sign in with either your <strong>full name</strong> or this ID.
            </p>
          </InfoCard>

          <InfoCard title="About roles">
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
                <strong>Student</strong> — browse, download, upload for review
              </li>
              <li>
                <strong>Rep</strong> — plus approve uploads, post announcements
              </li>
              <li>
                <strong>Admin</strong> — plus full backend access
              </li>
            </ul>
          </InfoCard>
        </aside>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────

function AvatarDisplay({ src, initials, size = 96, onImageError, imgFailed }) {
  const showImg = src && !imgFailed;
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: showImg ? 'var(--slate-100)' : 'var(--brand)',
        color: '#fff',
        display: 'grid',
        placeItems: 'center',
        fontSize: size * 0.32,
        fontWeight: 700,
        textTransform: 'uppercase',
        overflow: 'hidden',
        flexShrink: 0,
        border: '3px solid #fff',
        boxShadow: '0 4px 14px rgba(15,23,42,0.12)',
      }}
    >
      {showImg ? (
        <img
          src={src}
          alt=""
          onError={onImageError}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
          }}
        />
      ) : (
        initials
      )}
    </div>
  );
}

function DetailRow({ label, value }) {
  return (
    <>
      <dt
        style={{
          fontSize: 13,
          color: 'var(--text-muted)',
          fontWeight: 500,
        }}
      >
        {label}
      </dt>
      <dd style={{ margin: 0, fontSize: 14 }}>{value}</dd>
    </>
  );
} 