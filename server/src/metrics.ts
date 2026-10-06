import { canonicalAuthors, resolverMap, type AuthorGroup } from './authors.js';
import { HttpError } from './errors.js';
import { ROOT_PATH, authorNameOf, type IndexedCommit, type RepoIndex } from './indexer.js';

export type SortKey =
  | 'churn'
  | 'added'
  | 'removed'
  | 'growth'
  | 'modifications'
  | 'modificationFrequency'
  | 'churnRate'
  | 'path';

export interface CommitSelection {
  type: 'all' | 'range' | 'list';
  from: number | null;
  to: number | null;
  hashes: string[];
}

export interface MetricsRequest {
  selection: CommitSelection;
  author: string | null;
  path: string | null;
  include: 'both' | 'files' | 'dirs';
  sort: SortKey;
  dir: 'asc' | 'desc';
  limit: number;
  offset: number;
}

export interface AuthorStat {
  id: string;
  name: string;
  modifications: number;
  churn: number;
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
  topAuthor: { id: string; name: string; ownership: number } | null;
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

/** One month of commit activity for the selected commit set. */
export interface ActivityBucket {
  /** UTC year. */
  year: number;
  /** UTC month, 0-11. */
  month: number;
  added: number;
  removed: number;
  commits: number;
}

export interface MetricsResponse {
  selection: {
    commitCount: number;
    totalCommitsInIndex: number;
    indexTruncated: boolean;
    author: { id: string; name: string } | null;
    path: string | null;
    from: string | null;
    to: string | null;
    manualMatched: number | null;
  };
  repo: MetricRow;
  rows: MetricRow[];
  totalRows: number;
  authors: AuthorSummary[];
  /** Monthly timeline (UTC), oldest first, gaps filled with zeros. */
  activity: ActivityBucket[];
}

const SORT_KEYS: SortKey[] = [
  'churn',
  'added',
  'removed',
  'growth',
  'modifications',
  'modificationFrequency',
  'churnRate',
  'path',
];

const ISO_OR_EPOCH = /^-?\d+$/;

function parseTime(value: unknown, field: string): number | null {
  if (value === undefined || value === null || value === '') return null;
  let ms: number | undefined;
  if (typeof value === 'number' && Number.isFinite(value)) {
    ms = Math.abs(value) > 1e11 ? value : value * 1000;
  } else if (typeof value === 'string') {
    const trimmed = value.trim();
    if (ISO_OR_EPOCH.test(trimmed)) {
      const num = Number(trimmed);
      ms = Math.abs(num) > 1e11 ? num : num * 1000;
    } else {
      ms = Date.parse(trimmed);
    }
  }
  if (ms === undefined || Number.isNaN(ms)) {
    throw new HttpError(400, `Invalid ${field} timestamp: expected ISO 8601 or epoch seconds`);
  }
  return ms;
}

function parsePath(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const p = value.trim().replace(/^\.\/+/, '').replace(/^\/+|\/+$/g, '');
  return p === '' ? null : p;
}

/** Parse and validate a metrics request body; throws HttpError(400) on bad input. */
export function parseMetricsRequest(body: unknown): MetricsRequest {
  const raw = (body ?? {}) as Record<string, unknown>;

  const selRaw = (raw.selection ?? { type: 'all' }) as Record<string, unknown>;
  const type = selRaw.type === 'range' || selRaw.type === 'list' ? selRaw.type : 'all';
  const selection: CommitSelection = {
    type,
    from: parseTime(selRaw.from, 'from'),
    to: parseTime(selRaw.to, 'to'),
    hashes: [],
  };
  if (selection.from !== null && selection.to !== null && selection.to <= selection.from) {
    throw new HttpError(400, 'The "to" timestamp must be after the "from" timestamp');
  }
  if (type === 'list') {
    const list = selRaw.hashes;
    if (!Array.isArray(list) || list.length === 0) {
      throw new HttpError(400, 'A manual selection needs a non-empty "hashes" list');
    }
    if (list.length > 20000) throw new HttpError(400, 'Too many commits in the manual selection');
    const invalid = list.find((h) => typeof h !== 'string' || !/^[0-9a-f]{4,40}$/i.test(h));
    if (invalid !== undefined) throw new HttpError(400, 'Manual selection contains an invalid commit hash');
    selection.hashes = list.map((h) => String(h).toLowerCase());
  }

  const include =
    raw.include === 'files' || raw.include === 'dirs' ? (raw.include as 'files' | 'dirs') : 'both';
  const sort = SORT_KEYS.includes(raw.sort as SortKey) ? (raw.sort as SortKey) : 'churn';
  const dir = raw.dir === 'asc' ? 'asc' : 'desc';
  const limitRaw = typeof raw.limit === 'number' ? raw.limit : Number(raw.limit);
  const offsetRaw = typeof raw.offset === 'number' ? raw.offset : Number(raw.offset);

  return {
    selection,
    author: typeof raw.author === 'string' && raw.author.trim() !== '' ? raw.author.trim() : null,
    path: parsePath(raw.path),
    include,
    sort,
    dir,
    limit: Number.isFinite(limitRaw) ? Math.min(1000, Math.max(1, Math.floor(limitRaw))) : 200,
    offset: Number.isFinite(offsetRaw) ? Math.max(0, Math.floor(offsetRaw)) : 0,
  };
}

interface ObjectAcc {
  path: string;
  isFile: boolean;
  added: number;
  removed: number;
  modifications: number;
  authorChurn: Map<string, number>;
  authorMods: Map<string, number>;
}

export function computeMetrics(
  index: RepoIndex,
  groups: AuthorGroup[],
  req: MetricsRequest,
): MetricsResponse {
  const canonical = canonicalAuthors(index.authors, groups);
  const resolver = resolverMap(canonical);
  const nameById = new Map(canonical.map((c) => [c.id, c.name] as const));

  if (req.author !== null && !nameById.has(req.author)) {
    throw new HttpError(400, 'Unknown author filter');
  }

  // --- commit set selection (H) --------------------------------------------
  let selected: IndexedCommit[];
  let manualMatched: number | null = null;
  if (req.selection.type === 'range') {
    selected = [];
    for (const c of index.commits) {
      const ms = c.ts * 1000;
      if (req.selection.from !== null && ms < req.selection.from) continue;
      if (req.selection.to !== null && ms >= req.selection.to) continue;
      selected.push(c);
    }
  } else if (req.selection.type === 'list') {
    const want = new Set(req.selection.hashes);
    selected = index.commits.filter((c) => want.has(c.hash) || want.has(c.short));
    manualMatched = selected.length;
  } else {
    selected = index.commits;
  }

  const commits = req.author === null
    ? selected
    : selected.filter((c) => (resolver.get(c.authorKey)?.id ?? c.authorKey) === req.author);
  const H = commits.length;

  // --- accumulate per-object metrics ---------------------------------------
  const objects = new Map<string, ObjectAcc>();
  const commitCountByAuthor = new Map<string, number>();
  const activityMap = new Map<number, ActivityBucket>();

  const obj = (p: string, isFile: boolean): ObjectAcc => {
    let acc = objects.get(p);
    if (!acc) {
      acc = {
        path: p,
        isFile,
        added: 0,
        removed: 0,
        modifications: 0,
        authorChurn: new Map(),
        authorMods: new Map(),
      };
      objects.set(p, acc);
    }
    if (isFile) acc.isFile = true;
    return acc;
  };

  const ancestorsOf = (p: string): string[] => {
    const out: string[] = [];
    let idx = p.lastIndexOf('/');
    while (idx !== -1) {
      out.push(p.slice(0, idx));
      idx = p.lastIndexOf('/', idx - 1);
    }
    out.push(ROOT_PATH);
    return out;
  };

  obj(ROOT_PATH, false);

  for (const commit of commits) {
    const author = resolver.get(commit.authorKey);
    const authorId = author?.id ?? commit.authorKey;
    commitCountByAuthor.set(authorId, (commitCountByAuthor.get(authorId) ?? 0) + 1);

    const commitDate = new Date(commit.ts * 1000);
    const bucketKey = commitDate.getUTCFullYear() * 12 + commitDate.getUTCMonth();
    let bucket = activityMap.get(bucketKey);
    if (!bucket) {
      bucket = {
        year: commitDate.getUTCFullYear(),
        month: commitDate.getUTCMonth(),
        added: 0,
        removed: 0,
        commits: 0,
      };
      activityMap.set(bucketKey, bucket);
    }
    bucket.commits += 1;

    const modifiedObjects = new Set<string>();

    for (const change of commit.changes) {
      if (
        req.path === null ||
        change.path === req.path ||
        change.path.startsWith(`${req.path}/`)
      ) {
        bucket.added += change.added;
        bucket.removed += change.removed;
      }
      const churn = change.added + change.removed;
      const paths = [change.path, ...ancestorsOf(change.path)];
      for (const p of paths) {
        const acc = obj(p, p === change.path);
        acc.added += change.added;
        acc.removed += change.removed;
        if (churn > 0) {
          acc.authorChurn.set(authorId, (acc.authorChurn.get(authorId) ?? 0) + churn);
          modifiedObjects.add(p);
        }
      }
    }

    for (const p of modifiedObjects) {
      const acc = obj(p, false);
      acc.modifications += 1;
      acc.authorMods.set(authorId, (acc.authorMods.get(authorId) ?? 0) + 1);
    }
  }

  // --- activity timeline (monthly buckets, gaps filled) ---------------------
  const activity: ActivityBucket[] = [];
  if (activityMap.size > 0) {
    let minKey = Infinity;
    let maxKey = -Infinity;
    for (const k of activityMap.keys()) {
      if (k < minKey) minKey = k;
      if (k > maxKey) maxKey = k;
    }
    if (maxKey - minKey <= 1200) {
      for (let k = minKey; k <= maxKey; k++) {
        const b = activityMap.get(k);
        activity.push(
          b ?? { year: Math.floor(k / 12), month: k % 12, added: 0, removed: 0, commits: 0 },
        );
      }
    } else {
      activity.push(
        ...[...activityMap.values()].sort(
          (a, b) => a.year * 12 + a.month - (b.year * 12 + b.month),
        ),
      );
    }
  }

  // --- build rows -----------------------------------------------------------
  // The cheap numeric fields are computed for every object; the (comparatively
  // expensive) per-author breakdown is only materialised for rows that are
  // actually serialised (the root and the current page). This keeps requests
  // fast on repositories with tens of thousands of touched objects.
  interface BaseRow {
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
  }

  const baseOf = (acc: ObjectAcc): BaseRow => {
    const churn = acc.added + acc.removed;
    return {
      path: acc.path,
      type: acc.isFile ? 'file' : 'dir',
      depth: acc.path === ROOT_PATH ? 0 : acc.path.split('/').length,
      added: acc.added,
      removed: acc.removed,
      growth: acc.added - acc.removed,
      churn,
      modifications: acc.modifications,
      modificationFrequency: H > 0 ? acc.modifications / H : 0,
      churnRate: H > 0 ? churn / H : 0,
    };
  };

  const fullRow = (base: BaseRow, acc: ObjectAcc): MetricRow => {
    const authors: AuthorStat[] = [];
    for (const [id, authorChurn] of acc.authorChurn) {
      authors.push({
        id,
        name: nameById.get(id) ?? authorNameOf(id),
        modifications: acc.authorMods.get(id) ?? 0,
        churn: authorChurn,
        ownership: base.churn > 0 ? authorChurn / base.churn : 0,
      });
    }
    authors.sort((a, b) => b.churn - a.churn);
    return {
      ...base,
      topAuthor: authors[0]
        ? { id: authors[0].id, name: authors[0].name, ownership: authors[0].ownership }
        : null,
      authors,
    };
  };

  const root = objects.get(ROOT_PATH)!;
  const repoRow = fullRow(baseOf(root), root);

  let entries = [...objects.values()].map((acc) => ({ acc, base: baseOf(acc) }));
  if (req.include === 'files') entries = entries.filter((e) => e.base.type === 'file');
  else if (req.include === 'dirs') entries = entries.filter((e) => e.base.type === 'dir');
  if (req.path !== null) {
    const prefix = req.path;
    entries = entries.filter((e) => e.base.path === prefix || e.base.path.startsWith(`${prefix}/`));
  }

  const totalRows = entries.length;
  const sign = req.dir === 'asc' ? 1 : -1;
  entries.sort((a, b) => {
    if (req.sort === 'path') {
      const cmp = a.base.path.localeCompare(b.base.path);
      return req.dir === 'asc' ? cmp : -cmp;
    }
    const cmp = (a.base[req.sort] as number) - (b.base[req.sort] as number);
    if (cmp !== 0) return sign * cmp;
    return a.base.path.localeCompare(b.base.path);
  });
  const page = entries
    .slice(req.offset, req.offset + req.limit)
    .map((e) => fullRow(e.base, e.acc));

  // --- author summary -------------------------------------------------------
  const rootChurn = repoRow.churn;
  const authors: AuthorSummary[] = canonical
    .map((c) => ({
      id: c.id,
      name: c.name,
      commitCount: commitCountByAuthor.get(c.id) ?? 0,
      modifications: root.authorMods.get(c.id) ?? 0,
      churn: root.authorChurn.get(c.id) ?? 0,
      ownership: rootChurn > 0 ? (root.authorChurn.get(c.id) ?? 0) / rootChurn : 0,
    }))
    .filter((a) => a.commitCount > 0 || a.churn > 0)
    .sort((a, b) => b.churn - a.churn);

  const selectedAuthor = req.author !== null
    ? { id: req.author, name: nameById.get(req.author) ?? req.author }
    : null;

  return {
    selection: {
      commitCount: H,
      totalCommitsInIndex: index.commitCount,
      indexTruncated: index.truncated,
      author: selectedAuthor,
      path: req.path,
      from: req.selection.from !== null ? new Date(req.selection.from).toISOString() : null,
      to: req.selection.to !== null ? new Date(req.selection.to).toISOString() : null,
      manualMatched,
    },
    repo: repoRow,
    rows: page,
    totalRows,
    authors,
    activity,
  };
}
