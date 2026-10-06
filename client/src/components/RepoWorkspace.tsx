import { useCallback, useEffect, useState } from 'react';
import * as api from '../api.ts';
import { errorMessage } from '../format.ts';
import type { AuthorsResponse, Repository } from '../types.ts';
import AuthorsPanel from './AuthorsPanel.tsx';
import MetricsView from './MetricsView.tsx';
import RepoOverview from './RepoOverview.tsx';

const TABS = [
  { id: 'metrics', label: 'Metrics' },
  { id: 'authors', label: 'Authors' },
  { id: 'details', label: 'Details' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function RepoWorkspace({ repo }: { repo: Repository }) {
  const [tab, setTab] = useState<TabId>('metrics');
  const [authorsData, setAuthorsData] = useState<AuthorsResponse | null>(null);
  const [authorsError, setAuthorsError] = useState<string | null>(null);

  const refreshAuthors = useCallback(async (): Promise<void> => {
    try {
      setAuthorsData(await api.getAuthors(repo.id));
      setAuthorsError(null);
    } catch (err) {
      setAuthorsError(errorMessage(err));
    }
  }, [repo.id]);

  useEffect(() => {
    void refreshAuthors();
  }, [refreshAuthors]);

  const git = repo.git;

  // Changes whenever author merging alters the canonical author set, so the
  // metrics view can recompute without the user touching a filter.
  const authorsRev =
    authorsData === null
      ? ''
      : authorsData.authors.map((a) => `${a.id}:${a.commitCount}`).join('|');

  return (
    <div className="workspace">
      <header className="workspace-head">
        <div>
          <h1>{repo.name}</h1>
          <p className="muted">
            {repo.source.type === 'zip' ? 'Uploaded archive: ' : 'Cloned from: '}
            <span className="mono">{repo.source.location}</span>
            {git?.hasCommits
              ? ` · ${git.commitCount.toLocaleString()} commits reachable from HEAD`
              : ''}
          </p>
        </div>
        <nav className="workspace-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={tab === t.id ? 'workspace-tab active' : 'workspace-tab'}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <div className={tab === 'metrics' ? 'pane' : 'pane hidden'}>
        <MetricsView
          repoId={repo.id}
          authors={authorsData?.authors ?? []}
          authorsRev={authorsRev}
        />
      </div>
      <div className={tab === 'authors' ? 'pane' : 'pane hidden'}>
        <AuthorsPanel
          repoId={repo.id}
          data={authorsData}
          error={authorsError}
          onChanged={refreshAuthors}
        />
      </div>
      <div className={tab === 'details' ? 'pane' : 'pane hidden'}>
        <RepoOverview repo={repo} />
      </div>
    </div>
  );
}
