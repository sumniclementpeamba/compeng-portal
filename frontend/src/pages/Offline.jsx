import { useEffect, useState } from 'react';
import { listOffline, removeOffline } from '../offline/db';
import { PageHeader, StatCard, EmptyState, InfoCard } from '../components/PageUI';

export default function Offline() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setItems(await listOffline());
    setLoading(false);
  }
  useEffect(() => { refresh(); }, []);

  function open(item) {
    const url = URL.createObjectURL(item.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = item.meta.file_name || `${item.meta.title}.bin`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  function fmtSize(bytes) {
    if (!bytes) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  const totalSize = items.reduce((sum, i) => sum + (i.blob?.size || 0), 0);

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="On this device"
        title="Offline materials"
        subtitle="Saved files you can open without an internet connection."
      />

      {loading && (
        <div style={{ display: 'grid', placeItems: 'center', padding: 40 }}>
          <span className="spinner spinner-dark" style={{ width: 26, height: 26, borderWidth: 3 }} />
        </div>
      )}

      {!loading && items.length === 0 && (
        <EmptyState
          icon="📥"
          title="No offline materials yet"
          body="Open a resource and click 'Save for offline' to access it without internet."
          actionLabel="Browse resources"
          actionHref="/resources"
        />
      )}

      {!loading && items.length > 0 && (
        <>
          <div className="stats-row" style={{ marginBottom: 20 }}>
            <StatCard icon="📁" label="Saved files" value={items.length} />
            <StatCard icon="💾" label="Storage used" value={fmtSize(totalSize)} accent="var(--success)" />
          </div>

          <div className="split-grid">
            <div className="stagger" style={{ display: 'grid', gap: 10 }}>
              {items.map((i) => (
                <div key={i.id} className="card" style={{
                  padding: 16,
                  display: 'flex', justifyContent: 'space-between',
                  alignItems: 'center', gap: 12, flexWrap: 'wrap',
                }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>{i.meta.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                      {i.meta.course_name} · v{i.meta.version} · {fmtSize(i.blob?.size)} · saved {new Date(i.savedAt).toLocaleDateString()}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => open(i)} className="btn-primary" style={{ padding: '7px 14px' }}>
                      Open
                    </button>
                    <button
                      onClick={async () => { await removeOffline(i.id); refresh(); }}
                      style={{ padding: '7px 14px', color: 'var(--danger)' }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <aside>
              <InfoCard title="How offline works">
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--slate-600)', lineHeight: 1.7 }}>
                  <li>Files are stored on this device only, not on the server.</li>
                  <li>Clearing your browser data will remove them.</li>
                  <li>Switching devices means starting fresh on the new one.</li>
                  <li>You can still add files while offline — they'll sync when online.</li>
                </ul>
              </InfoCard>
            </aside>
          </div>
        </>
      )}
    </div>
  );
} 