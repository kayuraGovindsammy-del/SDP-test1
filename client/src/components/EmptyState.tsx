export default function EmptyState({ hasRepos }: { hasRepos: boolean }) {
  if (hasRepos) {
    return (
      <div className="empty-state">
        <h2>Select a repository</h2>
        <p>Pick a repository from the sidebar to inspect it.</p>
      </div>
    );
  }
  return (
    <div className="empty-state">
      <h2>Welcome to RAT</h2>
      <p>
        Add a repository by uploading a zip that includes its <span className="mono">.git</span>{' '}
        directory, or by cloning a remote URL — then start exploring its metrics.
      </p>
    </div>
  );
}
