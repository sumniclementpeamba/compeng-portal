import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { resourcesApi } from '../api/resources';
import { useAuth } from '../context/AuthContext';

const TYPE_ICONS = {
  note: '📝',
  slide: '📊',
  past_question: '📜',
  assignment: '📋',
  lab: '🧪',
  project: '🛠️',
  textbook: '📚',
  other: '📁',
};

const RESOURCE_TYPES = [
  'note', 'slide', 'past_question', 'assignment',
  'lab', 'project', 'textbook', 'other',
];

const EMPTY_FILTERS = {
  q: '',
  course_name: '',
  semester: '',
  resource_type: '',
};

export default function Resources() {
  const { user } = useAuth();
  const canManage = user?.role === 'rep' || user?.role === 'admin';

  const [searchParams, setSearchParams] = useSearchParams();

  const [filters, setFilters] = useState(() => ({
    q: searchParams.get('q') || '',
    course_name: searchParams.get('course') || '',
    semester: searchParams.get('semester') || '',
    resource_type: searchParams.get('type') || '',
  }));

  // On mobile, the filter panel is collapsed by default —
  // but auto-expand if the URL already carries filters
  // (e.g. arriving from a dashboard "Browse by course" tile).
  const [showMobileFilters, setShowMobileFilters] = useState(() => {
    return !!(
      searchParams.get('course') ||
      searchParams.get('semester') ||
      searchParams.get('type')
    );
  });

  const [data, setData] = useState({ results: [] });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [submitted, setSubmitted] = useState(false);

  async function load(nextFilters) {
    setLoading(true);
    setErr('');
    try {
      const result = await resourcesApi.list(nextFilters);
      setData(result);
      setSubmitted(true);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyFilters(e) {
    if (e) e.preventDefault();

    const params = {};
    if (filters.q) params.q = filters.q;
    if (filters.course_name) params.course = filters.course_name;
    if (filters.semester) params.semester = filters.semester;
    if (filters.resource_type) params.type = filters.resource_type;
    setSearchParams(params, { replace: true });

    load(filters);
  }

  function clearFilters() {
    setFilters(EMPTY_FILTERS);
    setSearchParams({}, { replace: true });
    load(EMPTY_FILTERS);
    setShowMobileFilters(false);
  }

  const hasActiveFilters =
    filters.q ||
    filters.course_name ||
    filters.semester ||
    filters.resource_type;

  // Count only the "extra" filters — the search query has its own
  // visual presence, so we don't count it in the toggle badge.
  const extraFilterCount =
    (filters.course_name ? 1 : 0) +
    (filters.semester ? 1 : 0) +
    (filters.resource_type ? 1 : 0);

  return (
    <div className="animate-fade-up">
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 24 }}>All resources</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 4 }}>
          Search and filter the entire class collection.
        </p>
      </div>

      <form onSubmit={applyFilters} className="resources-filter">
        {/* Search input — always visible */}
        <input
          className="resources-filter-search"
          placeholder="Search title, course…"
          value={filters.q}
          onChange={(e) => setFilters({ ...filters, q: e.target.value })}
        />

        {/* Mobile-only: filter toggle */}
        <button
          type="button"
          className="resources-filter-toggle"
          onClick={() => setShowMobileFilters((v) => !v)}
          aria-expanded={showMobileFilters}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>⚙ Filters</span>
            {extraFilterCount > 0 && (
              <span
                style={{
                  fontSize: 11,
                  padding: '1px 7px',
                  borderRadius: 999,
                  background: 'var(--brand)',
                  color: '#fff',
                  fontWeight: 600,
                  lineHeight: 1.5,
                }}
              >
                {extraFilterCount}
              </span>
            )}
          </span>
          <span
            className={`resources-filter-chevron${showMobileFilters ? ' open' : ''}`}
          >
            ▾
          </span>
        </button>

        {/* The extra filters — flat on desktop, expandable on mobile */}
        <div
          className={`resources-filter-fields${showMobileFilters ? ' open' : ''}`}
        >
          <input
            placeholder="Course"
            value={filters.course_name}
            onChange={(e) =>
              setFilters({ ...filters, course_name: e.target.value })
            }
          />
          <input
            placeholder="Semester"
            value={filters.semester}
            onChange={(e) =>
              setFilters({ ...filters, semester: e.target.value })
            }
          />
          <select
            value={filters.resource_type}
            onChange={(e) =>
              setFilters({ ...filters, resource_type: e.target.value })
            }
          >
            <option value="">All types</option>
            {RESOURCE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replace('_', ' ')}
              </option>
            ))}
          </select>
          <button type="submit" className="btn-primary">
            Search
          </button>
        </div>
      </form>

      {/* Active filter chips */}
      {hasActiveFilters && (
        <div
          style={{
            display: 'flex',
            gap: 6,
            flexWrap: 'wrap',
            alignItems: 'center',
            marginBottom: 16,
          }}
        >
          <span
            style={{
              fontSize: 12,
              color: 'var(--text-muted)',
              fontWeight: 500,
            }}
          >
            Filters:
          </span>
          {filters.q && (
            <FilterChip
              label={`"${filters.q}"`}
              onClear={() => {
                const next = { ...filters, q: '' };
                setFilters(next);
                applyFilters();
              }}
            />
          )}
          {filters.course_name && (
            <FilterChip
              label={filters.course_name}
              onClear={() => {
                const next = { ...filters, course_name: '' };
                setFilters(next);
                applyFilters();
              }}
            />
          )}
          {filters.semester && (
            <FilterChip
              label={filters.semester}
              onClear={() => {
                const next = { ...filters, semester: '' };
                setFilters(next);
                applyFilters();
              }}
            />
          )}
          {filters.resource_type && (
            <FilterChip
              label={filters.resource_type.replace('_', ' ')}
              onClear={() => {
                const next = { ...filters, resource_type: '' };
                setFilters(next);
                applyFilters();
              }}
            />
          )}
          <button
            type="button"
            onClick={clearFilters}
            style={{
              padding: '4px 10px',
              borderRadius: 'var(--radius-pill)',
              background: 'transparent',
              border: '1px solid var(--border-strong)',
              fontSize: 12,
              cursor: 'pointer',
              color: 'var(--text-muted)',
            }}
          >
            Clear all
          </button>
        </div>
      )}

      {err && (
        <div
          style={{
            padding: '10px 14px',
            background: 'var(--danger-bg)',
            color: 'var(--danger)',
            borderRadius: 'var(--radius-sm)',
            fontSize: 14,
            marginBottom: 16,
          }}
        >
          {err}
        </div>
      )}

      {loading && (
        <div style={{ display: 'grid', placeItems: 'center', padding: 40 }}>
          <span
            className="spinner spinner-dark"
            style={{ width: 26, height: 26, borderWidth: 3 }}
          />
        </div>
      )}

      {!loading && submitted && data.results?.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🔍</div>
          <p style={{ fontWeight: 600 }}>No resources match your search</p>
          <p
            style={{
              color: 'var(--text-muted)',
              fontSize: 14,
              marginTop: 4,
            }}
          >
            Try clearing filters or upload the resource yourself.
          </p>
          <div
            style={{
              display: 'flex',
              gap: 8,
              justifyContent: 'center',
              marginTop: 16,
              flexWrap: 'wrap',
            }}
          >
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                style={{
                  padding: '8px 16px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-strong)',
                  background: '#fff',
                  fontSize: 13,
                }}
              >
                Clear filters
              </button>
            )}
            <Link
              to="/upload"
              className="btn-primary"
              style={{
                padding: '8px 16px',
                borderRadius: 'var(--radius-sm)',
                textDecoration: 'none',
                fontSize: 13,
              }}
            >
              Upload a resource
            </Link>
          </div>
        </div>
      )}

      {!loading && data.results?.length > 0 && (
        <>
          <p
            style={{
              fontSize: 13,
              color: 'var(--text-muted)',
              marginBottom: 12,
            }}
          >
            Showing {data.results.length} resource
            {data.results.length === 1 ? '' : 's'}
            {hasActiveFilters && ' matching your filters'}
          </p>

          <ul
            className="stagger"
            style={{
              listStyle: 'none',
              padding: 0,
              display: 'grid',
              gap: 10,
            }}
          >
            {data.results.map((r) => {
              const showStatus = canManage || r.status !== 'approved';
              const badgeClass =
                r.status === 'approved'
                  ? 'badge-success'
                  : r.status === 'rejected'
                  ? 'badge-danger'
                  : 'badge-warning';

              return (
                <li key={r.id}>
                  <Link
                    to={`/resources/${r.id}`}
                    className="card"
                    style={{
                      display: 'flex',
                      gap: 12,
                      textDecoration: 'none',
                      color: 'inherit',
                      alignItems: 'center',
                    }}
                  >
                    <div
                      style={{
                        fontSize: 22,
                        width: 36,
                        textAlign: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {TYPE_ICONS[r.resource_type] || '📁'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: 15,
                          color: 'var(--brand)',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          lineHeight: 1.35,
                        }}
                      >
                        {r.title}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: 'var(--text-muted)',
                          marginTop: 4,
                          display: 'flex',
                          gap: 6,
                          flexWrap: 'wrap',
                        }}
                      >
                        <span>{r.course_name}</span>
                        <span>·</span>
                        <span>{r.resource_type.replace('_', ' ')}</span>
                        <span>·</span>
                        <span>v{r.version}</span>
                      </div>
                    </div>
                    {showStatus && (
                      <span
                        className={`badge ${badgeClass}`}
                        style={{ flexShrink: 0 }}
                      >
                        {r.status}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

function FilterChip({ label, onClear }) {
  return (
    <button
      type="button"
      onClick={onClear}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        borderRadius: 'var(--radius-pill)',
        background: 'var(--slate-100)',
        border: '1px solid var(--border)',
        fontSize: 12,
        fontWeight: 500,
        color: 'var(--slate-700)',
        cursor: 'pointer',
      }}
    >
      {label}
      <span
        style={{
          fontSize: 14,
          lineHeight: 1,
          color: 'var(--slate-500)',
        }}
      >
        ×
      </span>
    </button>
  );
} 