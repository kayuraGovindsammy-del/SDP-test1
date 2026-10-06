import { useMemo, useState } from 'react';
import * as api from '../api.ts';
import { errorMessage, fmtInt } from '../format.ts';
import type { AuthorGroup, AuthorsResponse } from '../types.ts';

interface Props {
  repoId: string;
  data: AuthorsResponse | null;
  error: string | null;
  onChanged: () => Promise<void>;
}

export default function AuthorsPanel({ repoId, data, error, onChanged }: Props) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [mergeName, setMergeName] = useState('');
  const [editingGroup, setEditingGroup] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [busy, setBusy] = useState(false);
  const [opError, setOpError] = useState<string | null>(null);

  const groupOfKey = useMemo(() => {
    const map = new Map<string, AuthorGroup>();
    for (const group of data?.groups ?? []) {
      for (const key of group.keys) map.set(key, group);
    }
    return map;
  }, [data]);

  const rawAuthors = useMemo(
    () =>
      [...(data?.raw ?? [])].sort(
        (a, b) => b.commitCount - a.commitCount || a.key.localeCompare(b.key),
      ),
    [data],
  );

  const toggle = (key: string): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const run = async (action: () => Promise<unknown>, after?: () => void): Promise<void> => {
    setBusy(true);
    try {
      await action();
      setOpError(null);
      after?.();
      await onChanged();
    } catch (err) {
      setOpError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const doMerge = (): void => {
    if (selected.size < 2) return;
    void run(
      () => api.mergeAuthors(repoId, [...selected], mergeName.trim() || undefined),
      () => {
        setSelected(new Set());
        setMergeName('');
      },
    );
  };

  const doUnmerge = (group: AuthorGroup): void => {
    void run(() => api.unmergeAuthors(repoId, group.keys));
  };

  const doRename = (groupId: string): void => {
    const name = editName.trim();
    if (name === '') return;
    void run(
      () => api.renameAuthorGroup(repoId, groupId, name),
      () => setEditingGroup(null),
    );
  };

  if (error && !data) {
    return (
      <div className="panel">
        <div className="error">{error}</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="panel">
        <p className="muted">Loading authors…</p>
      </div>
    );
  }

  return (
    <div className="authors-panel">
      <div className="panel">
        <h2>Merged authors</h2>
        <p className="muted small panel-hint">
          .mailmap is applied automatically during indexing. Use manual merges for identities git
          could not resolve — for example the same person committing under different names or
          email addresses.
        </p>
        {data.groups.length === 0 && <p className="muted small">No manual merges yet.</p>}
        {data.groups.map((group) => (
          <div className="group-card" key={group.id}>
            <div className="group-head">
              {editingGroup === group.id ? (
                <>
                  <input
                    type="text"
                    className="input"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') doRename(group.id);
                      if (e.key === 'Escape') setEditingGroup(null);
                    }}
                    autoFocus
                  />
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    disabled={busy || editName.trim() === ''}
                    onClick={() => doRename(group.id)}
                  >
                    Save
                  </button>
                  <button type="button" className="btn btn-sm" onClick={() => setEditingGroup(null)}>
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <span className="group-name">{group.name}</span>
                  <span className="chip chip-muted">
                    {group.keys.length} identit{group.keys.length === 1 ? 'y' : 'ies'}
                  </span>
                  <span className="group-spacer" />
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={busy}
                    onClick={() => {
                      setEditingGroup(group.id);
                      setEditName(group.name);
                    }}
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={busy}
                    onClick={() => doUnmerge(group)}
                  >
                    Unmerge
                  </button>
                </>
              )}
            </div>
            <div className="group-keys">
              {group.keys.map((key) => (
                <span className="key-chip" key={key}>
                  {key}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="panel">
        <h2>Identities in history</h2>
        <div className="merge-controls">
          <span className="muted small">{selected.size} selected</span>
          <input
            type="text"
            className="input"
            placeholder="Merged display name (optional)"
            value={mergeName}
            onChange={(e) => setMergeName(e.target.value)}
          />
          <button
            type="button"
            className="btn btn-primary"
            disabled={selected.size < 2 || busy}
            onClick={doMerge}
          >
            Merge selected
          </button>
          {selected.size > 0 && (
            <button type="button" className="btn btn-sm" onClick={() => setSelected(new Set())}>
              Clear
            </button>
          )}
        </div>
        {opError && <div className="error">{opError}</div>}
        <div className="table-wrap">
          <table className="metrics author-table">
            <thead>
              <tr>
                <th className="check-cell" />
                <th>Identity</th>
                <th className="num">Commits</th>
                <th>Merged into</th>
              </tr>
            </thead>
            <tbody>
              {rawAuthors.map((author) => {
                const group = groupOfKey.get(author.key);
                return (
                  <tr
                    key={author.key}
                    className={selected.has(author.key) ? 'row-selected' : ''}
                    onClick={() => toggle(author.key)}
                  >
                    <td className="check-cell">
                      <input type="checkbox" checked={selected.has(author.key)} readOnly />
                    </td>
                    <td>
                      <div className="identity-name">{author.name}</div>
                      <div className="muted small mono">{author.email}</div>
                    </td>
                    <td className="num">{fmtInt(author.commitCount)}</td>
                    <td>
                      {group ? (
                        <span className="chip">{group.name}</span>
                      ) : (
                        <span className="muted small">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
