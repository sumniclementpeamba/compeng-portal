import { useEffect, useState } from 'react';
import { resourcesApi } from '../api/resources';
import { api, getToken } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { PageHeader, StatCard, EmptyState } from '../components/PageUI';

const ACTION_META = {
  'resource.created':          { icon: '📤', verb: 'Published',                accent: 'var(--brand)' },
  'resource.approved':         { icon: '✅', verb: 'Approved',                 accent: 'var(--success)' },
  'resource.rejected':         { icon: '❌', verb: 'Rejected',                 accent: 'var(--danger)' },
  'resource.version_uploaded': { icon: '🔄', verb: 'Uploaded a new version of', accent: 'var(--brand-500)' },
  'member.role_changed':       { icon: '👤', verb: 'Changed role of',          accent: '#7c3aed' },
};

function actionMeta(action) {
  return ACTION_META[action] || { icon: '•', verb: action, accent: 'var(--slate-500)' };
}

export default function Management() {
  const [tab, setTab] = useState('pending');

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Moderation"
        title="Management"
        subtitle="Review contributions, inspect the audit trail, and see who's in the class."
      />

      <div className="manage-tabs">
        <TabButton active={tab === 'pending'} onClick={() => setTab('pending')}>
          Pending approvals
        </TabButton>
        <TabButton active={tab === 'audit'} onClick={() => setTab('audit')}>
          Audit log
        </TabButton>
        <TabButton active={tab === 'members'} onClick={() => setTab('members')}>
          Members
        </TabButton>
      </div>

      {tab === 'pending' && <PendingPanel />}
      {tab === 'audit' && <AuditPanel />}
      {tab === 'members' && <MembersPanel />}
    </div>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '10px 16px',
        background: 'transparent',
        border: 'none',
        borderBottom: `2px solid ${active ? 'var(--brand)' : 'transparent'}`,
        color: active ? 'var(--brand)' : 'var(--text-muted)',
        fontWeight: 600,
        fontSize: 14,
        cursor: 'pointer',
        marginBottom: -1,
        transition: 'all 140ms ease',
        flexShrink: 0,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  );
}

// ── Pending approvals ─────────────────────────────────
function PendingPanel() {
  const [pending, setPending] = useState([]);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [noteById, setNoteById] = useState({});
  const [busyId, setBusyId] = useState(null);

  async function load() {
    setErr('');
    try {
      const d = await resourcesApi.list({ status: 'pending' });
      setPending(d.results || []);
    } catch (e) {
      setErr(`Failed to load pending: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function decide(id, decision) {
    setErr('');
    setMsg('');
    setBusyId(id);

    const removed = pending.find((r) => r.id === id);
    setPending((list) => list.filter((r) => r.id !== id));

    try {
      await resourcesApi.review(id, decision, noteById[id] || '');
      setMsg(
        decision === 'approved'
          ? `Approved "${removed?.title}" — now visible to the class.`
          : `Rejected "${removed?.title}".`
      );
      const d = await resourcesApi.list({ status: 'pending' });
      setPending(d.results || []);
    } catch (e) {
      if (removed) setPending((list) => [removed, ...list]);
      setErr(`Could not ${decision}: ${e.message}`);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="stats-row" style={{ marginBottom: 20 }}>
        <StatCard
          icon="⏳"
          label="Awaiting review"
          value={pending.length}
          accent="var(--warning)"
          highlight={pending.length > 0}
        />
        <StatCard
          icon="👥"
          label="Contributors"
          value={new Set(pending.map((r) => r.uploaded_by)).size}
        />
        <StatCard icon="📚" label="Total pending" value={pending.length} />
      </div>

      <div style={{ marginBottom: 12 }}>
        <button onClick={load} disabled={loading} style={{ padding: '7px 14px', fontSize: 13 }}>
          ↻ Refresh
        </button>
      </div>

      {err && (
        <div role="alert" style={{
          padding: '12px 16px', background: 'var(--danger-bg)',
          color: 'var(--danger)', borderRadius: 'var(--radius-sm)',
          fontSize: 14, marginBottom: 16, border: '1px solid #fecaca',
        }}>
          <strong>Error:</strong> {err}
        </div>
      )}

      {msg && (
        <div style={{
          padding: '12px 16px', background: 'var(--success-bg)',
          color: 'var(--success)', borderRadius: 'var(--radius-sm)',
          fontSize: 14, marginBottom: 16, border: '1px solid #bbf7d0',
        }}>{msg}</div>
      )}

      {loading && (
        <div style={{ display: 'grid', placeItems: 'center', padding: 40 }}>
          <span className="spinner spinner-dark" style={{ width: 26, height: 26, borderWidth: 3 }} />
        </div>
      )}

      {!loading && pending.length === 0 && !err && (
        <EmptyState
          icon="✅"
          title="All caught up"
          body="No pending submissions right now."
        />
      )}

      {!loading && pending.length > 0 && (
        <div className="stagger" style={{ display: 'grid', gap: 12 }}>
          {pending.map((r) => (
            <div key={r.id} className="card" style={{ padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                <h3 style={{ fontSize: 16 }}>{r.title}</h3>
                <span className="badge badge-warning">pending</span>
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                {r.course_name} · {r.resource_type.replace('_', ' ')} · by {r.uploaded_by_name} · {new Date(r.created_at).toLocaleString()}
              </p>
              {r.description && (
                <p style={{
                  marginTop: 12, fontSize: 14, color: 'var(--slate-700)',
                  padding: '10px 14px', background: 'var(--slate-50)',
                  borderRadius: 'var(--radius-sm)', lineHeight: 1.55,
                }}>{r.description}</p>
              )}
              <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
                <input
                  placeholder="Review note (optional)"
                  value={noteById[r.id] || ''}
                  onChange={(e) => setNoteById({ ...noteById, [r.id]: e.target.value })}
                  disabled={busyId === r.id}
                />
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    onClick={() => decide(r.id, 'approved')}
                    className="btn-success"
                    disabled={busyId !== null}
                    style={{ padding: '8px 16px' }}
                  >
                    {busyId === r.id ? 'Approving…' : '✓ Approve'}
                  </button>
                  <button
                    onClick={() => decide(r.id, 'rejected')}
                    className="btn-danger"
                    disabled={busyId !== null}
                    style={{ padding: '8px 16px' }}
                  >
                    ✕ Reject
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Audit log ─────────────────────────────────────────
function AuditPanel() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [filter, setFilter] = useState('');

  async function load() {
    setLoading(true);
    setErr('');
    try {
      const qs = filter ? `?action=${encodeURIComponent(filter)}` : '';
      const d = await api.get(`/audit-logs/${qs}`);
      setEntries(d.results || []);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [filter]);

  const totals = entries.reduce((acc, e) => {
    acc[e.action] = (acc[e.action] || 0) + 1;
    return acc;
  }, {});

  return (
    <div>
      <div className="stats-row" style={{ marginBottom: 20 }}>
        <StatCard icon="✅" label="Approvals" value={totals['resource.approved'] || 0} accent="var(--success)" />
        <StatCard icon="❌" label="Rejections" value={totals['resource.rejected'] || 0} accent="var(--danger)" />
        <StatCard icon="📤" label="Direct publishes" value={totals['resource.created'] || 0} accent="var(--brand)" />
        <StatCard icon="🔄" label="Version uploads" value={totals['resource.version_uploaded'] || 0} accent="var(--brand-500)" />
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <FilterChip active={!filter} onClick={() => setFilter('')}>All</FilterChip>
        <FilterChip active={filter === 'resource.approved'} onClick={() => setFilter('resource.approved')}>Approved</FilterChip>
        <FilterChip active={filter === 'resource.rejected'} onClick={() => setFilter('resource.rejected')}>Rejected</FilterChip>
        <FilterChip active={filter === 'resource.created'} onClick={() => setFilter('resource.created')}>Published</FilterChip>
        <FilterChip active={filter === 'resource.version_uploaded'} onClick={() => setFilter('resource.version_uploaded')}>Version uploads</FilterChip>
        <FilterChip active={filter === 'member.role_changed'} onClick={() => setFilter('member.role_changed')}>Role changes</FilterChip>
        <button
          onClick={load}
          disabled={loading}
          style={{ marginLeft: 'auto', padding: '6px 14px', fontSize: 13 }}
        >
          ↻ Refresh
        </button>
      </div>

      {err && (
        <div role="alert" style={{
          padding: '12px 16px', background: 'var(--danger-bg)',
          color: 'var(--danger)', borderRadius: 'var(--radius-sm)',
          fontSize: 14, marginBottom: 16, border: '1px solid #fecaca',
        }}>
          <strong>Error:</strong> {err}
        </div>
      )}

      {loading && (
        <div style={{ display: 'grid', placeItems: 'center', padding: 40 }}>
          <span className="spinner spinner-dark" style={{ width: 26, height: 26, borderWidth: 3 }} />
        </div>
      )}

      {!loading && !err && entries.length === 0 && (
        <EmptyState
          icon="📋"
          title="No activity yet"
          body="Approve, reject, or publish a resource and it will appear here."
        />
      )}

      {!loading && entries.length > 0 && (
        <div className="stagger" style={{ display: 'grid', gap: 8 }}>
          {entries.map((e) => <AuditRow key={e.id} entry={e} />)}
        </div>
      )}
    </div>
  );
}

function AuditRow({ entry }) {
  const meta = actionMeta(entry.action);
  const title = entry.details?.title || `#${entry.target_id}`;
  const note = entry.details?.note;
  const version = entry.details?.version;
  const oldRole = entry.details?.old_role;
  const newRole = entry.details?.new_role;

  return (
    <div className="card" style={{ padding: '14px 16px' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: `${meta.accent}15`,
          display: 'grid', placeItems: 'center',
          fontSize: 18, flexShrink: 0,
        }}>
          {meta.icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, lineHeight: 1.4 }}>
            <strong style={{ color: 'var(--text)' }}>{entry.actor_name}</strong>{' '}
            <span style={{ color: 'var(--slate-600)' }}>{meta.verb}</span>{' '}
            <strong style={{ color: 'var(--text)' }}>{title}</strong>
            {version && (
              <span style={{
                marginLeft: 6, fontSize: 11,
                padding: '1px 6px', borderRadius: 4,
                background: 'var(--slate-100)',
                color: 'var(--slate-600)',
                fontWeight: 600,
              }}>
                v{version}
              </span>
            )}
            {oldRole && newRole && (
              <span style={{ marginLeft: 6, fontSize: 12, color: 'var(--text-muted)' }}>
                ({oldRole} → {newRole})
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
            {new Date(entry.created_at).toLocaleString()}
          </div>
          {note && (
            <div style={{
              marginTop: 8, padding: '8px 12px',
              background: 'var(--slate-50)',
              borderLeft: '2px solid var(--slate-300)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 13, color: 'var(--slate-700)',
              lineHeight: 1.55,
              fontStyle: 'italic',
            }}>
              "{note}"
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Members directory ─────────────────────────────────
function MembersPanel() {
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'admin';

  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [q, setQ] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [busyId, setBusyId] = useState(null);

  async function load() {
    setLoading(true);
    setErr('');
    try {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (roleFilter) params.set('role', roleFilter);
      const qs = params.toString();
      const d = await api.get(`/members/${qs ? '?' + qs : ''}`);
      setMembers(d.results || []);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [roleFilter]);
  // eslint-disable-next-line react-hooks/exhaustive-deps

  async function changeRole(member, newRole) {
    setErr('');
    setMsg('');
    setBusyId(member.id);
    try {
      await api.post(`/members/${member.id}/role/`, { role: newRole });
      setMsg(
        newRole === 'rep'
          ? `${member.display_name} is now a Course Rep.`
          : `${member.display_name} is now a Student.`
      );
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusyId(null);
    }
  }

  const totals = {
    total: members.length,
    students: members.filter((m) => m.role === 'student').length,
    reps: members.filter((m) => m.role === 'rep').length,
    admins: members.filter((m) => m.role === 'admin').length,
  };

  return (
    <div>
      <div className="stats-row" style={{ marginBottom: 20 }}>
        <StatCard icon="👥" label="Total members" value={totals.total} accent="var(--brand)" />
        <StatCard icon="🎓" label="Students" value={totals.students} accent="var(--slate-500)" />
        <StatCard icon="🎯" label="Course reps" value={totals.reps} accent="var(--warning)" />
        <StatCard icon="🛡️" label="Admins" value={totals.admins} accent="var(--danger)" />
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); load(); }}
        style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}
      >
        <input
          placeholder="Search by name, username, or email…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ flex: 1, minWidth: 200 }}
        />
        <button type="submit" className="btn-primary" style={{ padding: '8px 16px' }}>
          Search
        </button>
      </form>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <FilterChip active={!roleFilter} onClick={() => setRoleFilter('')}>All roles</FilterChip>
        <FilterChip active={roleFilter === 'student'} onClick={() => setRoleFilter('student')}>Students</FilterChip>
        <FilterChip active={roleFilter === 'rep'} onClick={() => setRoleFilter('rep')}>Course reps</FilterChip>
        <FilterChip active={roleFilter === 'admin'} onClick={() => setRoleFilter('admin')}>Admins</FilterChip>
      </div>

      {err && (
        <div role="alert" style={{
          padding: '12px 16px', background: 'var(--danger-bg)',
          color: 'var(--danger)', borderRadius: 'var(--radius-sm)',
          fontSize: 14, marginBottom: 16, border: '1px solid #fecaca',
        }}>
          <strong>Error:</strong> {err}
        </div>
      )}

      {msg && (
        <div style={{
          padding: '12px 16px', background: 'var(--success-bg)',
          color: 'var(--success)', borderRadius: 'var(--radius-sm)',
          fontSize: 14, marginBottom: 16, border: '1px solid #bbf7d0',
        }}>{msg}</div>
      )}

      {loading && (
        <div style={{ display: 'grid', placeItems: 'center', padding: 40 }}>
          <span className="spinner spinner-dark" style={{ width: 26, height: 26, borderWidth: 3 }} />
        </div>
      )}

      {!loading && !err && members.length === 0 && (
        <EmptyState
          icon="👥"
          title="No members match"
          body="Try clearing the search or role filter."
        />
      )}

      {!loading && members.length > 0 && (
        <div className="stagger" style={{
          display: 'grid',
          gap: 12,
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
        }}>
          {members.map((m) => (
            <MemberCard
              key={m.id}
              member={m}
              currentUserId={currentUser?.id}
              canManageRoles={isAdmin}
              onChangeRole={changeRole}
              busy={busyId === m.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MemberCard({
  member, currentUserId, canManageRoles, onChangeRole, busy,
}) {
  const displayName = member.display_name || member.username;
  const initials = displayName.slice(0, 2).toUpperCase();
  const avatarSrc = member.avatar_url
    ? `${member.avatar_url}?token=${getToken()}`
    : null;

  const roleBadge =
    member.role === 'admin' ? 'badge-danger'
    : member.role === 'rep' ? 'badge-warning'
    : 'badge-neutral';

  const roleLabel =
    member.role === 'admin' ? 'Administrator'
    : member.role === 'rep' ? 'Course Rep'
    : 'Student';

  const isSelf = member.id === currentUserId;
  const isSuperuser = member.role === 'admin';
  const actionable = canManageRoles && !isSelf && !isSuperuser;

  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div style={{
          width: 52, height: 52, borderRadius: '50%',
          background: avatarSrc ? 'var(--slate-100)' : 'var(--brand)',
          color: '#fff',
          display: 'grid', placeItems: 'center',
          fontSize: 18, fontWeight: 700, textTransform: 'uppercase',
          overflow: 'hidden', flexShrink: 0,
        }}>
          {avatarSrc ? (
            <img
              src={avatarSrc}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          ) : initials}
        </div>

        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{
            fontWeight: 700, fontSize: 15,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {displayName}
            {isSelf && (
              <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6, fontWeight: 400 }}>
                (you)
              </span>
            )}
          </div>
          <div style={{
            fontSize: 12, color: 'var(--text-muted)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            marginTop: 1,
          }}>
            @{member.username}
          </div>
          <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span className={`badge ${roleBadge}`} style={{ fontSize: 10 }}>
              {roleLabel}
            </span>
            {member.level && (
              <span className="badge badge-neutral" style={{ fontSize: 10 }}>
                Level {member.level}
              </span>
            )}
          </div>
        </div>
      </div>

      <div style={{
        marginTop: 14, paddingTop: 12,
        borderTop: '1px solid var(--border)',
        display: 'grid', gap: 6, fontSize: 12,
      }}>
        {member.email && (
          <div style={{
            display: 'flex', gap: 6, alignItems: 'center',
            color: 'var(--slate-600)',
            overflow: 'hidden',
          }}>
            <span style={{ flexShrink: 0 }}>✉</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {member.email}
            </span>
          </div>
        )}
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', gap: 8, color: 'var(--text-muted)',
        }}>
          <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span>📤</span>
            <span>{member.uploads_count} uploaded</span>
          </span>
          {member.pending_count > 0 && (
            <span style={{
              fontSize: 10, padding: '1px 6px', borderRadius: 4,
              background: 'var(--warning-bg)', color: 'var(--warning)',
              fontWeight: 600,
            }}>
              {member.pending_count} pending
            </span>
          )}
        </div>
        {member.joined_at && (
          <div style={{ color: 'var(--text-muted)' }}>
            🕐 Joined {new Date(member.joined_at).toLocaleDateString()}
          </div>
        )}
      </div>

      {actionable && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          {member.role === 'student' ? (
            <button
              onClick={() => onChangeRole(member, 'rep')}
              disabled={busy}
              className="btn-primary"
              style={{ width: '100%', padding: '8px 12px', fontSize: 13 }}
            >
              {busy ? 'Promoting…' : '🎯 Promote to Course Rep'}
            </button>
          ) : member.role === 'rep' ? (
            <button
              onClick={() => onChangeRole(member, 'student')}
              disabled={busy}
              style={{
                width: '100%', padding: '8px 12px', fontSize: 13,
                background: '#fff', border: '1px solid var(--border-strong)',
                color: 'var(--slate-700)',
              }}
            >
              {busy ? 'Demoting…' : '↩ Demote to Student'}
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}

function FilterChip({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '5px 12px',
        borderRadius: 'var(--radius-pill)',
        background: active ? 'var(--brand)' : 'var(--slate-100)',
        color: active ? '#fff' : 'var(--slate-700)',
        border: '1px solid',
        borderColor: active ? 'var(--brand)' : 'var(--border)',
        fontSize: 12,
        fontWeight: 500,
        cursor: 'pointer',
        transition: 'all 140ms ease',
      }}
    >
      {children}
    </button>
  );
} 