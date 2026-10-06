import { useCallback, useEffect, useMemo, useState } from 'react';
import * as api from '../api.ts';
import { errorMessage, fmtInt, fmtPercent, fmtRate, fmtSigned } from '../format.ts';
import type { CanonicalAuthor, MetricsRequest, MetricsResponse, SortKey } from '../types.ts';
import CommitPicker from './CommitPicker.tsx';
import FilterBar, { DEFAULT_FILTERS, type MetricsFilters } from './FilterBar.tsx';
import MetricsTable from './MetricsTable.tsx';

const PAGE = 100;

interface Props {
  repoId: string;
  authors: CanonicalAuthor[];
  /** Changes when author merging alters the canonical set; triggers a recompute. */
  authorsRev: string;
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export default function MetricsView({ repoId, authors, authorsRev }: Props) {
  const [filters, setFilters] = useState<MetricsFilters>(DEFAULT_FILTERS);
  const [offset, setOffset] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [data, setData] = useState<MetricsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [slowLoad, setSlowLoad] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const patch = useCallback((p: Partial<MetricsFilters>): void => {
    setFilters((prev) => ({ ...prev, ...p }));
    setOffset(0);
  }, []);

  // Drop a stale author filter after merges change canonical ids.
  useEffect(() => {
    if (
      filters.author !== '' &&
      authors.length > 0 &&
      !authors.some((a) => a.id === filters.author)
    ) {
      patch({ author: '' });
    }
  }, [authors, filters.author, patch]);

  const awaitingSelection = filters.mode === 'list' && filters.hashes.length === 0;

  const body = useMemo<MetricsRequest>(
    () => ({
      selection:
        filters.mode === 'list'
          ? { type: 'list', hashes: filters.hashes }
          : filters.mode === 'range'
            ? { type: 'range', from: filters.from || undefined, to: filters.to || undefined }
            : { type: 'all' },
      author: filters.author || undefined,
      path: filters.path || undefined,
      include: filters.include,
      sort: filters.sort,
      dir: filters.dir,
      limit: PAGE,
      offset,
    }),
    [filters, offset],
  );

  useEffect(() => {
    if (awaitingSelection) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api
      .getMetrics(repoId, body)
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [repoId, body, awaitingSelection, authorsRev]);

  const handleSort = useCallback((key: SortKey): void => {
    setFilters((prev) => {
      if (prev.sort === key) return { ...prev, dir: prev.dir === 'desc' ? 'asc' : 'desc' };
      return { ...prev, sort: key, dir: key === 'path' ? 'asc' : 'desc' };
    });
    setOffset(0);
  }, []);

  // After a few seconds of loading, explain the (one-time) index build.
  useEffect(() => {
    if (!loading) {
      setSlowLoad(false);
      return;
    }
    const timer = setTimeout(() => setSlowLoad(true), 3000);
    return () => clearTimeout(timer);
  }, [loading]);

  const selection = data?.selection ?? null;
  const repo = data?.repo ?? null;

  return (
    <div className="metrics-view">
      <FilterBar
        filters={filters}
        authors={authors}
        onPatch={patch}
        onEditCommits={() => setPickerOpen(true)}
      />

      {selection?.indexTruncated && (
        <div className="warning">
          This repository is larger than the index cap. Metrics cover the most recent{' '}
          {fmtInt(selection.totalCommitsInIndex)} commits reachable from HEAD.
        </div>
      )}

      {repo && selection && (
        <div className="summary-grid">
          <StatCard
            label="Commits in set (H)"
            value={fmtInt(selection.commitCount)}
            sub={
              selection.manualMatched !== null
                ? `${fmtInt(selection.manualMatched)} of ${fmtInt(filters.hashes.length)} selected found`
                : `of ${fmtInt(selection.totalCommitsInIndex)} indexed`
            }
          />
          <StatCard label="Added lines (l+)" value={fmtInt(repo.added)} />
          <StatCard label="Removed lines (l−)" value={fmtInt(repo.removed)} />
          <StatCard label="Growth (δ)" value={fmtSigned(repo.growth)} />
          <StatCard label="Churn (λ)" value={fmtInt(repo.churn)} />
          <StatCard label="Modifications (n)" value={fmtInt(repo.modifications)} />
          <StatCard label="Modification frequency (η)" value={fmtRate(repo.modificationFrequency)} />
          <StatCard label="Churn rate (ρ)" value={fmtRate(repo.churnRate)} />
        </div>
      )}

      {data && data.authors.length > 0 && (
        <div className="author-strip">
          <span className="strip-label">Authors in set:</span>
          {data.authors.map((a) => (
            <button
              key={a.id}
              type="button"
              className={filters.author === a.id ? 'author-chip active' : 'author-chip'}
              onClick={() => patch({ author: filters.author === a.id ? '' : a.id })}
              title={`${fmtInt(a.commitCount)} commits · ${fmtInt(a.modifications)} modifications · churn ${fmtInt(a.churn)} · ownership ${fmtPercent(a.ownership)}`}
            >
              {a.name}
              <span className="chip-sub">
                {fmtInt(a.commitCount)} commits · own {fmtPercent(a.ownership)}
              </span>
            </button>
          ))}
          {filters.author !== '' && (
            <button type="button" className="btn btn-sm" onClick={() => patch({ author: '' })}>
              Clear author
            </button>
          )}
        </div>
      )}

      {loading && slowLoad && (
        <div className="hint">
          Still working — the first analysis of a repository indexes its full commit history and
          can take a minute on large repositories. Later requests are instant.
        </div>
      )}

      {awaitingSelection ? (
        <div className="panel empty-panel">
          <p className="muted">
            No commits selected yet. Pick the commits to analyse, then apply the selection.
          </p>
          <button type="button" className="btn btn-primary" onClick={() => setPickerOpen(true)}>
            Choose commits…
          </button>
        </div>
      ) : (
        <MetricsTable
          rows={data?.rows ?? []}
          currentPath={filters.path}
          onDrill={(path) => patch({ path })}
          sort={filters.sort}
          dir={filters.dir}
          onSort={handleSort}
          totalRows={data?.totalRows ?? 0}
          offset={offset}
          limit={PAGE}
          onPage={setOffset}
          loading={loading}
          error={error}
        />
      )}

      {pickerOpen && (
        <CommitPicker
          repoId={repoId}
          initialSelected={filters.hashes}
          onClose={() => setPickerOpen(false)}
          onApply={(hashes) => {
            setPickerOpen(false);
            patch({ mode: 'list', hashes });
          }}
        />
      )}
    </div>
  );
}
