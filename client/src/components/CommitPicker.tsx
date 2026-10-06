import { useEffect, useState } from 'react';
import * as api from '../api.ts';
import { errorMessage, fmtInt, fmtTimestamp } from '../format.ts';
import type { CommitSummary, CommitsResponse } from '../types.ts';

const PAGE = 50;

interface Props {
  repoId: string;
  initialSelected: string[];
  onApply: (hashes: string[]) => void;
  onClose: () => void;
}

export default function CommitPicker({ repoId, initialSelected, onApply, onClose }: Props) {
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<CommitsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialSelected));

  useEffect(() => {
    const timer = setTimeout(() => {
      setQ(qInput.trim());
      setOffset(0);
    }, 250);
    return () => clearTimeout(timer);
  }, [qInput]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .listCommits(repoId, { q: q || undefined, limit: PAGE, offset })
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
  }, [repoId, q, offset]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const toggle = (hash: string): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(hash)) next.delete(hash);
      else next.add(hash);
      return next;
    });
  };

  const commits: CommitSummary[] = data?.commits ?? [];
  const total = data?.total ?? 0;
  const allOnPageSelected = commits.length > 0 && commits.every((c) => selected.has(c.hash));
  const togglePage = (): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) commits.forEach((c) => next.delete(c.hash));
      else commits.forEach((c) => next.add(c.hash));
      return next;
    });
  };
  const hasPrev = offset > 0;
  const hasNext = offset + PAGE < total;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Choose commits</h2>
          <button className="icon-btn" title="Close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="commit-search-row">
          <input
            type="text"
            className="input commit-search"
            placeholder="Search by hash, subject or author…"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            autoFocus
          />
          <label className="select-page">
            <input
              type="checkbox"
              checked={allOnPageSelected}
              onChange={togglePage}
              disabled={commits.length === 0}
            />
            <span>Select page</span>
          </label>
        </div>
        <div className="muted small commit-tip">
          Tip: select a single commit to show that commit&apos;s file metrics directly.
        </div>

        {error && <div className="error">{error}</div>}

        <div className={loading ? 'commit-list stale' : 'commit-list'}>
          {commits.length === 0 && !loading && (
            <div className="commit-empty muted small">No commits match the search.</div>
          )}
          {commits.map((c) => (
            <label
              key={c.hash}
              className={selected.has(c.hash) ? 'commit-row selected' : 'commit-row'}
            >
              <input
                type="checkbox"
                checked={selected.has(c.hash)}
                onChange={() => toggle(c.hash)}
              />
              <span className="mono commit-hash" title={c.hash}>
                {c.short}
              </span>
              <span className="commit-subject" title={c.subject}>
                {c.subject}
              </span>
              <span className="commit-author">{c.authorName}</span>
              <span className="commit-date">{fmtTimestamp(c.ts)}</span>
            </label>
          ))}
        </div>

        <div className="commit-foot">
          <div className="muted small">
            {fmtInt(selected.size)} selected · {fmtInt(total)} match
            {total === 1 ? '' : 'es'}
            {data?.indexTruncated ? ' · index truncated' : ''}
          </div>
          <div className="commit-foot-pager">
            <button
              type="button"
              className="btn btn-sm"
              disabled={!hasPrev || loading}
              onClick={() => setOffset(Math.max(0, offset - PAGE))}
            >
              Prev
            </button>
            <span className="muted small">
              {total === 0 ? '0' : `${fmtInt(offset + 1)}–${fmtInt(Math.min(offset + PAGE, total))}`}
            </span>
            <button
              type="button"
              className="btn btn-sm"
              disabled={!hasNext || loading}
              onClick={() => setOffset(offset + PAGE)}
            >
              Next
            </button>
          </div>
          <div className="commit-foot-actions">
            {selected.size > 0 && (
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setSelected(new Set())}
              >
                Clear
              </button>
            )}
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={selected.size === 0 || loading}
              onClick={() => onApply([...selected])}
            >
              Apply selection
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
