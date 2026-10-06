import { useCallback, useEffect, useMemo, useState } from 'react';
import AddRepoDialog from './components/AddRepoDialog.tsx';
import EmptyState from './components/EmptyState.tsx';
import RepoCard from './components/RepoCard.tsx';
import RepoWorkspace from './components/RepoWorkspace.tsx';
import * as api from './api.ts';
import type { Repository } from './types.ts';

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong';
}

export default function App() {
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const refresh = useCallback(async (selectId?: string): Promise<void> => {
    try {
      const repos = await api.listRepositories();
      setRepositories(repos);
      setLoadError(null);
      if (selectId) {
        setSelectedId(selectId);
      } else {
        setSelectedId((current) =>
          current && repos.some((r) => r.id === current) ? current : (repos[0]?.id ?? null),
        );
      }
    } catch (err) {
      setLoadError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selected = useMemo(
    () => repositories.find((r) => r.id === selectedId) ?? null,
    [repositories, selectedId],
  );

  const handleCreated = useCallback(
    async (repo: Repository): Promise<void> => {
      setDialogOpen(false);
      await refresh(repo.id);
    },
    [refresh],
  );

  const handleDelete = useCallback(
    async (repo: Repository): Promise<void> => {
      const confirmed = window.confirm(
        `Delete "${repo.name}"?\nThis removes its local copy and any analysis stored for it.`,
      );
      if (!confirmed) return;
      try {
        await api.deleteRepository(repo.id);
        if (selectedId === repo.id) setSelectedId(null);
        await refresh();
      } catch (err) {
        window.alert(errorMessage(err));
      }
    },
    [refresh, selectedId],
  );

  return (
    <div className="app">
      <aside className="sidebar">
        <header className="sidebar-head">
          <div>
            <div className="brand">RAT</div>
            <div className="brand-sub">Repository Analysis Tool</div>
          </div>
          <button className="btn btn-primary" onClick={() => setDialogOpen(true)}>
            + Add repository
          </button>
        </header>
        <div className="sidebar-list">
          {loading && <div className="hint">Loading repositories…</div>}
          {loadError && <div className="error">{loadError}</div>}
          {!loading && !loadError && repositories.length === 0 && (
            <div className="hint">
              No repositories yet.
              <br />
              Add one with the button above.
            </div>
          )}
          {repositories.map((repo) => (
            <RepoCard
              key={repo.id}
              repo={repo}
              selected={repo.id === selectedId}
              onSelect={() => setSelectedId(repo.id)}
              onDelete={() => void handleDelete(repo)}
            />
          ))}
        </div>
      </aside>
      <main className="main">
        {selected ? (
          <RepoWorkspace key={selected.id} repo={selected} />
        ) : (
          <EmptyState hasRepos={repositories.length > 0} />
        )}
      </main>
      <AddRepoDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreated={(repo) => void handleCreated(repo)}
      />
    </div>
  );
}
