import { useEffect, useState } from 'react';
import type { CanonicalAuthor, SortKey } from '../types.ts';

export interface MetricsFilters {
  mode: 'all' | 'range' | 'list';
  from: string;
  to: string;
  hashes: string[];
  author: string;
  path: string;
  include: 'both' | 'files' | 'dirs';
  sort: SortKey;
  dir: 'asc' | 'desc';
}

export const DEFAULT_FILTERS: MetricsFilters = {
  mode: 'all',
  from: '',
  to: '',
  hashes: [],
  author: '',
  path: '',
  include: 'both',
  sort: 'churn',
  dir: 'desc',
};

/** Format a Date as a `datetime-local` input value in local time. */
function toLocalInputValue(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

interface Props {
  filters: MetricsFilters;
  authors: CanonicalAuthor[];
  onPatch: (patch: Partial<MetricsFilters>) => void;
  onEditCommits: () => void;
}

export default function FilterBar({ filters, authors, onPatch, onEditCommits }: Props) {
  const [pathText, setPathText] = useState(filters.path);

  useEffect(() => {
    setPathText(filters.path);
  }, [filters.path]);

  const commitPath = (): void => {
    const next = pathText.trim();
    if (next !== filters.path) onPatch({ path: next });
  };

  const applyPreset = (days: number): void => {
    const to = new Date();
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
    onPatch({ mode: 'range', from: toLocalInputValue(from), to: toLocalInputValue(to) });
  };

  return (
    <div className="panel filter-bar">
      <div className="filter-row">
        <div className="seg" role="group" aria-label="Commit set">
          <button
            type="button"
            className={filters.mode === 'all' ? 'seg-btn active' : 'seg-btn'}
            onClick={() => onPatch({ mode: 'all' })}
          >
            All commits
          </button>
          <button
            type="button"
            className={filters.mode === 'range' ? 'seg-btn active' : 'seg-btn'}
            onClick={() => onPatch({ mode: 'range' })}
          >
            Date range
          </button>
          <button
            type="button"
            className={filters.mode === 'list' ? 'seg-btn active' : 'seg-btn'}
            onClick={onEditCommits}
          >
            {filters.mode === 'list'
              ? `Edit selection (${filters.hashes.length})`
              : 'Choose commits…'}
          </button>
        </div>
      </div>

      {filters.mode === 'range' && (
        <div className="filter-row">
          <label className="inline-field">
            <span>From (inclusive)</span>
            <input
              type="datetime-local"
              className="input"
              value={filters.from}
              onChange={(e) => onPatch({ from: e.target.value })}
            />
          </label>
          <label className="inline-field">
            <span>To (exclusive)</span>
            <input
              type="datetime-local"
              className="input"
              value={filters.to}
              onChange={(e) => onPatch({ to: e.target.value })}
            />
          </label>
          <span className="preset-group">
            <button type="button" className="btn btn-sm" onClick={() => applyPreset(30)}>
              Last 30 days
            </button>
            <button type="button" className="btn btn-sm" onClick={() => applyPreset(90)}>
              Last 90 days
            </button>
            <button type="button" className="btn btn-sm" onClick={() => applyPreset(365)}>
              Last year
            </button>
          </span>
          {(filters.from !== '' || filters.to !== '') && (
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => onPatch({ from: '', to: '' })}
            >
              Clear dates
            </button>
          )}
          <span className="muted small">
            Committer date, from inclusive / to exclusive.
          </span>
        </div>
      )}

      {filters.mode === 'list' && (
        <div className="filter-row">
          <span className="muted small">
            {filters.hashes.length} commit{filters.hashes.length === 1 ? '' : 's'} selected
          </span>
          <button type="button" className="btn btn-sm" onClick={onEditCommits}>
            Change selection…
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => onPatch({ mode: 'all', hashes: [] })}
          >
            Clear
          </button>
        </div>
      )}

      <div className="filter-row">
        <label className="inline-field">
          <span>Author</span>
          <select
            className="select"
            value={filters.author}
            onChange={(e) => onPatch({ author: e.target.value })}
          >
            <option value="">All authors</option>
            {authors.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.commitCount})
              </option>
            ))}
          </select>
        </label>

        <label className="inline-field grow">
          <span>Path (file or directory prefix)</span>
          <input
            type="text"
            className="input"
            placeholder="e.g. src/components — press Enter to apply"
            value={pathText}
            onChange={(e) => setPathText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
            onBlur={commitPath}
          />
        </label>

        <label className="inline-field">
          <span>Show</span>
          <select
            className="select"
            value={filters.include}
            onChange={(e) => onPatch({ include: e.target.value as MetricsFilters['include'] })}
          >
            <option value="both">Files &amp; directories</option>
            <option value="files">Files only</option>
            <option value="dirs">Directories only</option>
          </select>
        </label>

        <button
          type="button"
          className="btn btn-sm reset-btn"
          onClick={() => onPatch({ ...DEFAULT_FILTERS })}
        >
          Reset filters
        </button>
      </div>
    </div>
  );
}
