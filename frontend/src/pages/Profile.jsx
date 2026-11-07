import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api, apiUrl, getToken } from '../api/client';
import { PageHeader, InfoCard } from '../components/PageUI';
import FaceEnrollment from '../components/FaceEnrollment';

const LABEL = { fontSize: 13, fontWeight: 500, color: 'var(--slate-700)', display: 'block' };
const FIELD = { width: '100%', marginTop: 4 };

// ═════════════════════════════════════════════════════════════
// Inline SVG icons — no emoji, perfectly centered everywhere
// ═════════════════════════════════════════════════════════════
const ICONS = {
  user: (
    <>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </>
  ),
  gradCap: (
    <>
      <path d="M22 10 12 5 2 10l10 5 10-5z" />
      <path d="M6 12v5c3 3 9 3 12 0v-5" />
      <path d="M22 10v6" />
    </>
  ),
  phone: (
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
  ),
  mail: (
    <>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-10 5L2 7" />
    </>
  ),
  building: (
    <>
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <path d="M9 22v-4h6v4" />
      <path d="M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </>
  ),
  check: (
    <path d="M20 6 9 17l-5-5" />
  ),
  plus: (
    <>
      <path d="M12 5v14M5 12h14" />
    </>
  ),
  key: (
    <>
      <path d="M15 2a7 7 0 0 1 0 14 7 7 0 0 1-6-3.5L2 19v3h3v-3h3v-3l3.5-3.5A7 7 0 0 1 15 2z" />
      <circle cx="16" cy="8" r="1" />
    </>
  ),
  shield: (
    <>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </>
  ),
  star: (
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" />
    </>
  ),
};

function Icon({ name, size = 16, strokeWidth = 1.8, ...rest }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {ICONS[name]}
    </svg>
  );
}

// ═════════════════════════════════════════════════════════════
// Page-level styles — entrance animations, avatar ring, hover
// ═════════════════════════════════════════════════════════════
const STYLES = `
  @keyframes profile-card-in {
    from { opacity: 0; transform: translateY(14px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  @keyframes avatar-ring-rotate {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }

  @keyframes completeness-fill {
    from { width: 0%; }
  }

  @keyframes pulse-dot {
    0%, 100% { box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.5); }
    50%      { box-shadow: 0 0 0 6px rgba(37, 99, 235, 0); }
  }

  @keyframes copy-flash {
    0%   { background: var(--success-bg); transform: scale(1.08); }
    100% { background: var(--success-bg); transform: scale(1); }
  }

  .profile-card {
    animation: profile-card-in 500ms cubic-bezier(0.2, 0.8, 0.2, 1) var(--delay, 0ms) both;
  }

  .profile-card:hover {
    box-shadow: 0 12px 32px rgba(15, 23, 42, 0.08);
    transition: box-shadow 240ms ease;
  }

  .profile-avatar-ring {
    animation: avatar-ring-rotate 12s linear infinite;
    will-change: transform;
  }

  .profile-icon-box {
    width: 36px;
    height: 36px;
    border-radius: 10px;
    display: grid;
    place-items: center;
    flex-shrink: 0;
  }

  .profile-field-row {
    display: flex;
    gap: 14px;
    align-items: flex-start;
    padding: 14px 12px;
    border-radius: 10px;
    transition: background 160ms ease;
  }

  .profile-field-row:hover {
    background: var(--slate-50);
  }

  .profile-copy-btn {
    display: inline-grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: #fff;
    cursor: pointer;
    color: var(--slate-600);
    transition: all 140ms ease;
    flex-shrink: 0;
  }

  .profile-copy-btn:hover {
    background: var(--slate-50);
    border-color: var(--border-strong);
    color: var(--text);
  }

  .profile-copy-btn.copied {
    background: var(--success-bg);
    border-color: #bbf7d0;
    color: var(--success);
    animation: copy-flash 400ms ease;
  }

  .profile-add-link {
    background: transparent;
    border: none;
    padding: 0;
    font-size: 13px;
    font-weight: 600;
    color: var(--warning);
    cursor: pointer;
    transition: opacity 140ms;
    display: inline-flex;
    align-items: center;
    gap: 3px;
  }

  .profile-add-link:hover {
    opacity: 0.75;
  }

  .profile-completeness-pill {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 5px 12px;
    border-radius: 999px;
    background: #fff;
    color: #92400e;
    border: 1px solid #fcd34d;
    font-size: 11.5px;
    font-weight: 600;
    cursor: pointer;
    transition: all 160ms ease;
  }

  .profile-completeness-pill:hover {
    background: #fef3c7;
    transform: translateY(-1px);
  }

  .profile-skeleton {
    animation: profile-card-in 400ms ease var(--delay, 0ms) both;
  }

  @media (max-width: 640px) {
    .profile-field-row { padding: 12px 8px; gap: 12px; }
    .profile-icon-box { width: 32px; height: 32px; border-radius: 8px; }
  }

  @media (prefers-reduced-motion: reduce) {
    .profile-card,
    .profile-avatar-ring,
    .profile-completeness-fill,
    .profile-copy-btn.copied {
      animation: none !important;
    }
  }
`;

// ═════════════════════════════════════════════════════════════
// MAIN PAGE
// ═════════════════════════════════════════════════════════════
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
    index_number: user?.index_number || '',
    phone_number: user?.phone_number || '',
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
    user.role === 'admin' ? 'badge-danger'
    : user.role === 'rep' ? 'badge-warning'
    : 'badge-neutral';
  const roleLabel =
    user.role === 'admin' ? 'Administrator'
    : user.role === 'rep' ? 'Course Representative'
    : 'Student';

  const serverAvatarSrc = user.avatar_url
    ? `${apiUrl(user.avatar_url)}?token=${getToken()}&v=${avatarVersion}`
    : null;

  const hasName = !!(user.first_name || '').trim();
  const hasPhone = !!(user.phone_number || '').trim();
  const hasIndex = !!(user.index_number || '').trim();
  const filledCount = [hasName, hasPhone, hasIndex].filter(Boolean).length;
  const completenessPct = Math.round((filledCount / 3) * 100);
  const profileComplete = filledCount === 3;

  function openFilePicker() { fileInputRef.current?.click(); }

  function handleFileSelect(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) { setErr('Avatar must be under 2 MB.'); return; }
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
      index_number: user.index_number || '',
      phone_number: user.phone_number || '',
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
      if (trimmedName && trimmedName !== user.first_name) fd.append('first_name', trimmedName);
      if ((form.email || '') !== (user.email || '')) fd.append('email', form.email || '');
      if ((form.level || '') !== (user.level || '')) fd.append('level', form.level || '');
      const trimmedIndex = (form.index_number || '').trim();
      if (trimmedIndex !== (user.index_number || '')) fd.append('index_number', trimmedIndex);
      const trimmedPhone = (form.phone_number || '').trim();
      if (trimmedPhone !== (user.phone_number || '')) fd.append('phone_number', trimmedPhone);
      if (newAvatar) fd.append('avatar', newAvatar);
      if (removeAvatar) fd.append('avatar_clear', 'true');

      await api.patch('/me/', fd);
      await refresh();

      if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
      setNewAvatar(null);
      setAvatarPreviewUrl(null);
      setRemoveAvatar(false);
      setEditing(false);
      setAvatarVersion((v) => v + 1);
      setImgFailed(false);
      setMsg('Profile updated successfully.');
      setTimeout(() => setMsg(''), 4000);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  const editingAvatarSrc = avatarPreviewUrl
    ? avatarPreviewUrl
    : removeAvatar
    ? null
    : serverAvatarSrc;

  return (
    <div className="animate-fade-up">
      <style>{STYLES}</style>

      <PageHeader
        eyebrow="Account"
        title="Profile"
        subtitle="Your identity, credentials, and contact details."
        actions={
          !editing ? (
            <button
              onClick={() => setEditing(true)}
              className="btn-primary"
              style={{ padding: '9px 18px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              {profileComplete ? 'Edit profile' : 'Complete profile'}
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
        <div style={{
          padding: '12px 16px', background: 'var(--success-bg)', color: 'var(--success)',
          borderRadius: 10, fontSize: 13.5, marginBottom: 16,
          border: '1px solid #bbf7d0',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <Icon name="check" size={16} />
          <span>{msg}</span>
        </div>
      )}
      {err && (
        <div role="alert" style={{
          padding: '12px 16px', background: 'var(--danger-bg)', color: 'var(--danger)',
          borderRadius: 10, fontSize: 13.5, marginBottom: 16,
          border: '1px solid #fecaca',
        }}>
          {err}
        </div>
      )}

      <div style={{ display: 'grid', gap: 20 }}>
        <ProfileHero
          user={user}
          displayName={displayName}
          initials={initials}
          roleLabel={roleLabel}
          roleBadge={roleBadge}
          hasName={hasName}
          hasPhone={hasPhone}
          hasIndex={hasIndex}
          completenessPct={completenessPct}
          profileComplete={profileComplete}
          editing={editing}
          avatarSrc={editing ? editingAvatarSrc : serverAvatarSrc}
          imgFailed={imgFailed}
          onImageError={() => setImgFailed(true)}
          onEdit={() => setEditing(true)}
          editingSlot={editing ? (
            <div style={{ display: 'grid', gap: 6, justifyItems: 'center' }}>
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
                style={{ padding: '6px 14px', fontSize: 12, borderRadius: 8 }}
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
                    padding: '4px 8px', fontSize: 11,
                    color: 'var(--danger)', background: 'transparent',
                    border: 'none', cursor: 'pointer',
                  }}
                >
                  Remove photo
                </button>
              )}
            </div>
          ) : null}
        />

        <div className="split-grid">
          <div style={{ display: 'grid', gap: 20 }}>
            <CredentialsCard
              user={user}
              onEdit={() => setEditing(true)}
              delay={100}
            />
            <div className="profile-card" style={{ '--delay': '180ms' }}>
              <FaceEnrollment />
            </div>
            <PersonalDetailsCard
              user={user}
              editing={editing}
              form={form}
              setForm={setForm}
              onSubmit={save}
              busy={busy}
              onEdit={() => setEditing(true)}
              delay={260}
            />
          </div>

          <aside style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
            <div className="profile-card" style={{ '--delay': '340ms' }}>
              <SignInCard user={user} />
            </div>
            <div className="profile-card" style={{ '--delay': '420ms' }}>
              <RolesCard currentRole={user.role} />
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}


// ═════════════════════════════════════════════════════════════
// HERO — animated gradient ring, completeness progress bar
// ═════════════════════════════════════════════════════════════
function ProfileHero({
  user, displayName, initials, roleLabel, roleBadge,
  hasName, hasPhone, hasIndex, completenessPct, profileComplete,
  avatarSrc, imgFailed, onImageError, onEdit, editingSlot,
}) {
  return (
    <div
      className="card profile-card"
      style={{
        padding: 'clamp(20px, 4vw, 32px)',
        overflow: 'hidden',
        position: 'relative',
        '--delay': '0ms',
      }}
    >
      {/* Corner glow */}
      <div aria-hidden="true" style={{
        position: 'absolute', top: -80, right: -80,
        width: 240, height: 240, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(37,99,235,0.14), transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 'clamp(16px, 3vw, 28px)',
        flexWrap: 'wrap',
        position: 'relative',
      }}>
        {/* Avatar with rotating gradient ring */}
        <div style={{ display: 'grid', gap: 12, justifyItems: 'center', flexShrink: 0 }}>
          <div style={{ position: 'relative', width: 116, height: 116 }}>
            {/* Rotating gradient ring (behind) */}
            <div
              aria-hidden="true"
              className="profile-avatar-ring"
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: '50%',
                background: 'conic-gradient(from 0deg, #3b82f6, #06b6d4, #8b5cf6, #3b82f6)',
                boxShadow: '0 16px 40px rgba(37,99,235,0.20)',
              }}
            />
            {/* White gap */}
            <div style={{
              position: 'absolute', inset: 4,
              borderRadius: '50%',
              background: '#fff',
            }} />
            {/* Avatar */}
            <div style={{
              position: 'absolute', inset: 6,
              borderRadius: '50%',
              overflow: 'hidden',
            }}>
              <AvatarDisplay
                src={avatarSrc}
                initials={initials}
                size={104}
                onImageError={onImageError}
                imgFailed={imgFailed}
              />
            </div>
          </div>
          {editingSlot}
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
            <h1 style={{
              fontSize: 'clamp(22px, 3vw, 28px)',
              fontWeight: 700,
              letterSpacing: '-0.025em',
              margin: 0,
              lineHeight: 1.15,
              overflowWrap: 'anywhere',
            }}>
              {displayName}
            </h1>
            <span className={`badge ${roleBadge}`} style={{ fontSize: 11 }}>
              {roleLabel}
            </span>
          </div>

          <div style={{
            display: 'flex', gap: 16, flexWrap: 'wrap',
            alignItems: 'center', fontSize: 13,
            color: 'var(--text-muted)', marginBottom: 18,
          }}>
            {user.reference_number && (
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontWeight: 600,
                color: 'var(--slate-700)',
                letterSpacing: '0.02em',
              }}>
                {user.reference_number}
              </span>
            )}
            {user.level && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Icon name="gradCap" size={13} />
                Level {user.level}
              </span>
            )}
          </div>

          {/* Completeness — progress bar + state */}
          {profileComplete ? (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '8px 14px', borderRadius: 10,
              background: 'var(--success-bg)', color: 'var(--success)',
              border: '1px solid #bbf7d0',
              fontSize: 12.5, fontWeight: 600,
            }}>
              <span style={{
                width: 18, height: 18, borderRadius: '50%',
                background: 'var(--success)', color: '#fff',
                display: 'grid', placeItems: 'center',
              }}>
                <Icon name="check" size={11} strokeWidth={3} />
              </span>
              Profile complete — face enrollment unlocked
            </div>
          ) : (
            <div style={{
              padding: '12px 14px',
              background: 'var(--warning-bg)',
              border: '1px solid #fde68a',
              borderRadius: 10,
              display: 'grid',
              gap: 10,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: '#92400e' }}>
                  Profile completeness
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#92400e', fontVariantNumeric: 'tabular-nums' }}>
                  {filledCountOf({ hasName, hasPhone, hasIndex })} / 3
                </span>
              </div>

              <div style={{
                height: 5, borderRadius: 3,
                background: 'rgba(180, 83, 9, 0.15)',
                overflow: 'hidden',
              }}>
                <div
                  className="profile-completeness-fill"
                  style={{
                    height: '100%',
                    width: `${completenessPct}%`,
                    background: 'linear-gradient(90deg, #f59e0b, #f97316)',
                    borderRadius: 3,
                    animation: 'completeness-fill 900ms cubic-bezier(0.2, 0.8, 0.2, 1)',
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {!hasName && <Pill label="Name" onClick={onEdit} />}
                {!hasPhone && <Pill label="Phone" onClick={onEdit} />}
                {!hasIndex && <Pill label="Index" onClick={onEdit} />}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function filledCountOf({ hasName, hasPhone, hasIndex }) {
  return [hasName, hasPhone, hasIndex].filter(Boolean).length;
}

function Pill({ label, onClick }) {
  return (
    <button type="button" onClick={onClick} className="profile-completeness-pill">
      <Icon name="plus" size={11} strokeWidth={2.5} />
      {label}
    </button>
  );
}

function AvatarDisplay({ src, initials, size = 104, onImageError, imgFailed }) {
  const showImg = src && !imgFailed;
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: showImg ? 'var(--slate-100)' : 'var(--brand)', color: '#fff',
      display: 'grid', placeItems: 'center',
      fontSize: size * 0.34, fontWeight: 700, textTransform: 'uppercase',
      overflow: 'hidden',
    }}>
      {showImg ? (
        <img
          src={src}
          alt=""
          onError={onImageError}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      ) : initials}
    </div>
  );
}


// ═════════════════════════════════════════════════════════════
// CREDENTIALS
// ═════════════════════════════════════════════════════════════
function CredentialsCard({ user, onEdit, delay = 0 }) {
  const [copied, setCopied] = useState(false);
  function copyRef() {
    if (!user.reference_number) return;
    navigator.clipboard.writeText(user.reference_number).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div
      className="card profile-card"
      style={{
        padding: 'clamp(18px, 3vw, 24px)',
        background: 'linear-gradient(180deg, #eff6ff 0%, #ffffff 70%)',
        borderLeft: '3px solid var(--brand)',
        '--delay': `${delay}ms`,
      }}
    >
      <div style={{
        fontSize: 11, textTransform: 'uppercase',
        letterSpacing: '0.08em', color: 'var(--brand)',
        fontWeight: 700, marginBottom: 4,
      }}>
        Your credentials
      </div>
      <p style={{
        fontSize: 12, color: 'var(--slate-600)',
        marginBottom: 18, lineHeight: 1.55,
      }}>
        Use your reference number with the class password to sign in from any device.
      </p>

      {/* Reference band */}
      <div style={{
        padding: '16px 16px',
        background: '#fff',
        border: '1px solid var(--border)',
        borderRadius: 12,
      }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 160 }}>
            <div style={{
              fontSize: 10.5, textTransform: 'uppercase',
              letterSpacing: '0.06em', color: 'var(--text-muted)',
              fontWeight: 600, marginBottom: 6,
            }}>
              Reference number
            </div>
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'clamp(18px, 3vw, 22px)',
              fontWeight: 700,
              letterSpacing: '0.03em',
              color: 'var(--text)',
              overflowWrap: 'anywhere',
              lineHeight: 1.2,
            }}>
              {user.reference_number || '—'}
            </div>
          </div>
          {user.reference_number && (
            <button
              type="button"
              onClick={copyRef}
              className={`profile-copy-btn${copied ? ' copied' : ''}`}
              title="Copy reference number"
              aria-label="Copy reference number"
            >
              <Icon name={copied ? 'check' : 'copy'} size={15} />
            </button>
          )}
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10, lineHeight: 1.5 }}>
          Managed by your course rep — contact them to change it.
        </p>
      </div>

      {/* Index + Phone — responsive 2-col that stacks under 420px */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: 10,
        marginTop: 10,
      }}>
        <CompactField
          icon="gradCap"
          label="Index number"
          value={user.index_number}
          mono
          onEdit={onEdit}
        />
        <CompactField
          icon="phone"
          label="Phone"
          value={user.phone_number}
          onEdit={onEdit}
        />
      </div>

      <div style={{
        marginTop: 16, padding: '10px 12px',
        background: '#fff', border: '1px dashed var(--border-strong)',
        borderRadius: 10,
        fontSize: 12, color: 'var(--slate-600)', lineHeight: 1.55,
        display: 'flex', gap: 10, alignItems: 'flex-start',
      }}>
        <Icon name="key" size={14} style={{ flexShrink: 0, marginTop: 1, color: 'var(--slate-500)' }} />
        <div>
          <strong>Forgot your password?</strong> All students share the same class
          password. Ask your course rep if you need it again.
        </div>
      </div>
    </div>
  );
}

function CompactField({ icon, label, value, mono, onEdit }) {
  return (
    <div style={{
      padding: '12px 14px',
      background: '#fff',
      border: '1px solid var(--border)',
      borderRadius: 10,
      minWidth: 0,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        fontSize: 10, textTransform: 'uppercase',
        letterSpacing: '0.06em', color: 'var(--text-muted)',
        fontWeight: 600, marginBottom: 6,
      }}>
        <Icon name={icon} size={11} />
        <span>{label}</span>
      </div>
      {value ? (
        <div style={{
          fontFamily: mono ? 'var(--font-mono)' : 'inherit',
          fontSize: 13, fontWeight: 600, color: 'var(--text)',
          overflowWrap: 'anywhere', wordBreak: 'break-word',
          lineHeight: 1.35,
        }}>
          {value}
        </div>
      ) : (
        <button
          type="button"
          onClick={onEdit}
          className="profile-add-link"
        >
          <Icon name="plus" size={12} strokeWidth={2.5} />
          Add
        </button>
      )}
    </div>
  );
}


// ═════════════════════════════════════════════════════════════
// PERSONAL DETAILS
// ═════════════════════════════════════════════════════════════
function PersonalDetailsCard({ user, editing, form, setForm, onSubmit, busy, onEdit, delay = 0 }) {
  if (editing) {
    return (
      <form
        id="profile-form"
        onSubmit={onSubmit}
        className="card profile-card"
        style={{
          padding: 'clamp(18px, 3vw, 24px)',
          display: 'grid', gap: 14,
          '--delay': `${delay}ms`,
        }}
      >
        <h2 style={{
          fontSize: 13, textTransform: 'uppercase',
          letterSpacing: '0.08em', color: 'var(--text-muted)',
          fontWeight: 600, margin: 0,
        }}>
          Personal details
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
          Index number
          <input
            value={form.index_number}
            onChange={(e) => setForm({ ...form, index_number: e.target.value })}
            maxLength={30}
            style={{ ...FIELD, fontFamily: 'var(--font-mono)', letterSpacing: '0.02em' }}
            placeholder="e.g. UEB1109726"
          />
          <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginTop: 4 }}>
            Your university index number. Leave blank if you don't have one yet.
          </span>
        </label>

        <label style={LABEL}>
          Phone number
          <input
            type="tel"
            value={form.phone_number}
            onChange={(e) => setForm({ ...form, phone_number: e.target.value })}
            maxLength={30}
            style={{ ...FIELD, fontFamily: 'var(--font-mono)', letterSpacing: '0.02em' }}
            placeholder="e.g. 0531496803"
          />
          <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginTop: 4 }}>
            Used by the course rep to contact you. Leave blank if you prefer not to share.
          </span>
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

        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
          Your reference number is managed by the course rep — contact them if it needs to change.
        </p>
      </form>
    );
  }

  return (
    <div
      className="card profile-card"
      style={{
        padding: 'clamp(18px, 3vw, 24px)',
        '--delay': `${delay}ms`,
      }}
    >
      <h2 style={{
        fontSize: 13, textTransform: 'uppercase',
        letterSpacing: '0.08em', color: 'var(--text-muted)',
        fontWeight: 600, margin: '0 0 8px',
      }}>
        Personal details
      </h2>

      <FieldRow icon="user" label="Full name"
        value={user.first_name || ''} onEdit={onEdit} />
      <FieldRow icon="gradCap" label="Index number" mono
        value={user.index_number || ''} onEdit={onEdit} />
      <FieldRow icon="phone" label="Phone number" mono
        value={user.phone_number || ''} onEdit={onEdit}
        hint="Used by your course rep to contact you." />
      <FieldRow icon="mail" label="Email"
        value={user.email || ''} onEdit={onEdit} />
      <FieldRow icon="building" label="Level"
        value={user.level || ''} onEdit={onEdit} last />
    </div>
  );
}

function FieldRow({ icon, label, value, mono, hint, onEdit, last }) {
  return (
    <div
      className="profile-field-row"
      style={{ borderBottom: last ? 'none' : '1px solid var(--border)', borderRadius: last ? '0 0 10px 10px' : '10px 10px 0 0' }}
    >
      <div
        className="profile-icon-box"
        style={{
          background: 'var(--slate-100)',
          color: 'var(--slate-600)',
        }}
      >
        <Icon name={icon} size={16} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 11, textTransform: 'uppercase',
          letterSpacing: '0.06em', color: 'var(--text-muted)',
          fontWeight: 600, marginBottom: 3,
        }}>
          {label}
        </div>
        {value ? (
          <div style={{
            fontSize: 14, fontWeight: 500, color: 'var(--text)',
            fontFamily: mono ? 'var(--font-mono)' : 'inherit',
            overflowWrap: 'anywhere', wordBreak: 'break-word',
            lineHeight: 1.4,
          }}>
            {value}
          </div>
        ) : (
          <button
            type="button"
            onClick={onEdit}
            className="profile-add-link"
          >
            <Icon name="plus" size={12} strokeWidth={2.5} />
            Add
          </button>
        )}
        {hint && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.5 }}>
            {hint}
          </div>
        )}
      </div>
    </div>
  );
}


// ═════════════════════════════════════════════════════════════
// SIDEBAR
// ═════════════════════════════════════════════════════════════
function SignInCard({ user }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(user.username).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <InfoCard title="Sign-in ID">
      <div style={{
        display: 'flex',
        gap: 8,
        alignItems: 'center',
        flexWrap: 'wrap',
        padding: '10px 10px 10px 14px',
        background: 'var(--slate-100)',
        borderRadius: 10,
        minWidth: 0,
      }}>
        <code style={{
          flex: 1,
          minWidth: 0,
          fontSize: 13,
          color: 'var(--slate-700)',
          fontWeight: 500,
          wordBreak: 'break-all',
          lineHeight: 1.5,
          overflowWrap: 'anywhere',
        }}>
          {user.username}
        </code>
        <button
          type="button"
          onClick={copy}
          className={`profile-copy-btn${copied ? ' copied' : ''}`}
          title="Copy sign-in ID"
          aria-label="Copy sign-in ID"
        >
          <Icon name={copied ? 'check' : 'copy'} size={15} />
        </button>
      </div>
      <p style={{
        fontSize: 12, color: 'var(--text-muted)',
        marginTop: 10, lineHeight: 1.55,
      }}>
        You can sign in with your <strong>reference number</strong> or this ID.
      </p>
    </InfoCard>
  );
}

function RolesCard({ currentRole }) {
  const roles = [
    { key: 'student', label: 'Student', desc: 'Browse, download, upload for review', icon: 'user' },
    { key: 'rep',     label: 'Rep',     desc: 'Plus approve uploads, post announcements', icon: 'star' },
    { key: 'admin',   label: 'Admin',   desc: 'Plus full backend access', icon: 'shield' },
  ];

  return (
    <InfoCard title="Your role">
      <div style={{ display: 'grid', gap: 6 }}>
        {roles.map((r) => {
          const active = r.key === currentRole;
          return (
            <div
              key={r.key}
              style={{
                display: 'flex', gap: 10, alignItems: 'flex-start',
                padding: '10px 12px',
                background: active ? 'var(--brand)' : 'var(--slate-50)',
                color: active ? '#fff' : 'var(--slate-600)',
                borderRadius: 10,
                transition: 'all 160ms ease',
                position: 'relative',
              }}
            >
              <div style={{
                display: 'grid', placeItems: 'center',
                width: 20, height: 20, marginTop: 1, flexShrink: 0,
              }}>
                <Icon
                  name={r.icon}
                  size={14}
                  strokeWidth={2}
                  style={{ opacity: active ? 1 : 0.55 }}
                />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontWeight: 600, fontSize: 12.5,
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  {r.label}
                  {active && (
                    <span style={{
                      width: 6, height: 6, borderRadius: '50%',
                      background: '#fff',
                      animation: 'pulse-dot 2s ease-in-out infinite',
                    }} />
                  )}
                </div>
                <div style={{ opacity: active ? 0.9 : 0.85, fontSize: 11.5, marginTop: 2 }}>
                  {r.desc}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </InfoCard>
  );
} 