import type { Repository } from '../types.ts';

interface Props {
  repo: Repository;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

export default function RepoCard({ repo, selected, onSelect, onDelete }: Props) {
  const git = repo.git;
  const summary = git?.hasCommits
    ? `${git.commitCount.toLocaleString()} commit${git.commitCount === 1 ? '' : 's'}${git.headShort ? ` · ${git.headShort}` : ''}`
    : 'No commits yet';

  return (
    <div
      className={selected ? 'repo-card selected' : 'repo-card'}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <div className="repo-card-top">
        <span className="repo-name" title={repo.name}>
          {repo.name}
        </span>
        <button
          className="icon-btn"
          title="Delete repository"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          ✕
        </button>
      </div>
      <div className="repo-card-chips">
        <span className="chip">{repo.source.type === 'zip' ? 'ZIP' : 'URL'}</span>
        {git && (
          <span className="chip chip-muted">{git.hasCommits ? git.defaultBranch : 'no commits'}</span>
        )}
      </div>
      <div className="repo-card-meta">
        <span>{summary}</span>
        <span>Added {new Date(repo.createdAt).toLocaleString()}</span>
      </div>
    </div>
  );
}
