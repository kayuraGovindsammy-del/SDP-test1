export interface RepositoryGitInfo {
  defaultBranch: string;
  hasCommits: boolean;
  commitCount: number;
  headHash?: string;
  headShort?: string;
  headDate?: string;
  headAuthor?: string;
  headEmail?: string;
  headMessage?: string;
}

export interface RepositorySource {
  type: 'zip' | 'clone';
  location: string;
}

export interface Repository {
  id: string;
  name: string;
  source: RepositorySource;
  createdAt: string;
  repoPath: string;
  git: RepositoryGitInfo | null;
  gitError?: string;
}

// --- commits ---------------------------------------------------------------

export interface CommitSummary {
  hash: string;
  short: string;
  ts: number;
  iso: string;
  subject: string;
  authorId: string;
  authorName: string;
  email: string;
}

export interface CommitsResponse {
  total: number;
  offset: number;
  limit: number;
  commits: CommitSummary[];
  commitCount: number;
  indexTruncated: boolean;
}

// --- authors ---------------------------------------------------------------

export interface RawAuthor {
  key: string;
  name: string;
  email: string;
  commitCount: number;
}

export interface AuthorGroup {
  id: string;
  name: string;
  keys: string[];
}

export interface CanonicalAuthor {
  id: string;
  name: string;
  keys: string[];
  commitCount: number;
}

export interface AuthorsResponse {
  authors: CanonicalAuthor[];
  raw: RawAuthor[];
  groups: AuthorGroup[];
}

// --- metrics ---------------------------------------------------------------

export interface AuthorStat {
  id: string;
  name: string;
  modifications: number;
  churn: number;
  ownership: number;
}

export interface TopAuthor {
  id: string;
  name: string;
  ownership: number;
}

export interface MetricRow {
  path: string;
  type: 'file' | 'dir';
  depth: number;
  added: number;
  removed: number;
  growth: number;
  churn: number;
  modifications: number;
  modificationFrequency: number;
  churnRate: number;
  topAuthor: TopAuthor | null;
  authors: AuthorStat[];
}

export interface AuthorSummary {
  id: string;
  name: string;
  commitCount: number;
  modifications: number;
  churn: number;
  ownership: number;
}

export interface MetricsSelectionInfo {
  commitCount: number;
  totalCommitsInIndex: number;
  indexTruncated: boolean;
  author: { id: string; name: string } | null;
  path: string | null;
  from: string | null;
  to: string | null;
  manualMatched: number | null;
}

export interface MetricsResponse {
  selection: MetricsSelectionInfo;
  repo: MetricRow;
  rows: MetricRow[];
  totalRows: number;
  authors: AuthorSummary[];
}

export type SortKey =
  | 'churn'
  | 'added'
  | 'removed'
  | 'growth'
  | 'modifications'
  | 'modificationFrequency'
  | 'churnRate'
  | 'path';

export interface MetricsRequest {
  selection: {
    type: 'all' | 'range' | 'list';
    from?: string;
    to?: string;
    hashes?: string[];
  };
  author?: string;
  path?: string;
  include?: 'both' | 'files' | 'dirs';
  sort?: SortKey;
  dir?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}
