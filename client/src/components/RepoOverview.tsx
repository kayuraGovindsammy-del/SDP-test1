import type { Repository } from '../types.ts';

export default function RepoOverview({ repo }: { repo: Repository }) {
  const git = repo.git;

  return (
    <div className="overview">
      {repo.gitError && (
        <div className="warning">
          <strong>Could not read git history.</strong>
          <pre>{repo.gitError}</pre>
        </div>
      )}

      {git && (
        <div className="panel">
          <h2>Repository snapshot</h2>
          {git.hasCommits ? (
            <dl className="kv">
              <div>
                <dt>Default branch</dt>
                <dd className="mono">{git.defaultBranch}</dd>
              </div>
              <div>
                <dt>Commits (all branches reachable from HEAD)</dt>
                <dd>{git.commitCount.toLocaleString()}</dd>
              </div>
              <div>
                <dt>HEAD</dt>
                <dd className="mono" title={git.headHash}>
                  {git.headShort ?? '—'}
                </dd>
              </div>
              <div>
                <dt>Last commit</dt>
                <dd>{git.headMessage}</dd>
              </div>
              <div>
                <dt>Author</dt>
                <dd>
                  {git.headAuthor}{' '}
                  <span className="muted">
                    &lt;{git.headEmail}&gt;
                  </span>
                </dd>
              </div>
              <div>
                <dt>Committed at</dt>
                <dd>{git.headDate ? new Date(git.headDate).toLocaleString() : '—'}</dd>
              </div>
            </dl>
          ) : (
            <p className="muted">This repository has no commits yet, so there is nothing to analyse.</p>
          )}
        </div>
      )}

      <div className="panel">
        <h2>How analysis works</h2>
        <p className="muted">
          The analysis index covers the non-merge commits reachable from <span className="mono">HEAD</span>.
          Renames are detected at a 50% similarity threshold and attributed to the new path; deleted
          paths keep their removals; binary files are excluded; <span className="mono">.mailmap</span>{' '}
          is applied and can be extended with manual author merges on the Authors tab.
        </p>
      </div>
    </div>
  );
}
