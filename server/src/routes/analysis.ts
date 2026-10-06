import { Router } from 'express';
import {
  canonicalAuthors,
  loadAuthorFile,
  mergeKeys,
  renameGroup,
  resolverMap,
  saveAuthorFile,
  unmergeKeys,
} from '../authors.js';
import { HttpError } from '../errors.js';
import { authorEmailOf, authorNameOf, getIndex, type RepoIndex } from '../indexer.js';
import { computeMetrics, parseMetricsRequest } from '../metrics.js';
import { getRepository, repoGitDir, repoStorageDir } from '../store.js';
import { requiredString, wrap } from './util.js';
import type { AuthorFile } from '../authors.js';

const router = Router();

interface RepoContext {
  storageDir: string;
  index: RepoIndex;
  authorFile: AuthorFile;
}

async function context(id: string): Promise<RepoContext> {
  const meta = await getRepository(id);
  const storageDir = repoStorageDir(id);
  const index = await getIndex(id, storageDir, repoGitDir(meta));
  const authorFile = await loadAuthorFile(storageDir);
  return { storageDir, index, authorFile };
}

function parseKeys(body: unknown, field: string): string[] {
  const raw = (body as Record<string, unknown> | null)?.[field];
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new HttpError(400, `${field} must be a non-empty array of author keys`);
  }
  if (raw.length > 500) throw new HttpError(400, `Too many entries in ${field}`);
  const keys = raw.map((k) => {
    if (typeof k !== 'string' || k.trim() === '') {
      throw new HttpError(400, `${field} must contain non-empty strings`);
    }
    return k;
  });
  return [...new Set(keys)];
}

function assertKnownKeys(index: RepoIndex, keys: string[]): void {
  const known = new Set(index.authors.map((a) => a.key));
  for (const key of keys) {
    if (!known.has(key)) throw new HttpError(400, `Unknown author: ${key}`);
  }
}

function authorsPayload(ctx: RepoContext) {
  const authors = canonicalAuthors(ctx.index.authors, ctx.authorFile.groups);
  return { authors, raw: ctx.index.authors, groups: ctx.authorFile.groups };
}

// --- commit list (for manual commit selection and browsing) ----------------

router.get(
  '/:id/commits',
  wrap(async (req, res) => {
    const { index, authorFile } = await context(req.params.id);
    const resolver = resolverMap(canonicalAuthors(index.authors, authorFile.groups));

    const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
    const limit = Math.min(1000, Math.max(1, Number(req.query.limit) || 100));
    const offset = Math.max(0, Number(req.query.offset) || 0);

    let list = index.commits;
    if (q !== '') {
      list = list.filter(
        (c) =>
          c.hash.startsWith(q) ||
          c.short.startsWith(q) ||
          c.subject.toLowerCase().includes(q) ||
          c.authorKey.toLowerCase().includes(q),
      );
    }

    const page = list.slice(offset, offset + limit).map((c) => {
      const author = resolver.get(c.authorKey);
      return {
        hash: c.hash,
        short: c.short,
        ts: c.ts,
        iso: c.iso,
        subject: c.subject,
        authorId: author?.id ?? c.authorKey,
        authorName: author?.name ?? authorNameOf(c.authorKey),
        email: authorEmailOf(c.authorKey),
      };
    });

    res.json({
      total: list.length,
      offset,
      limit,
      commits: page,
      commitCount: index.commitCount,
      indexTruncated: index.truncated,
    });
  }),
);

// --- authors: mailmap is applied by git during indexing; manual merging here -

router.get(
  '/:id/authors',
  wrap(async (req, res) => {
    const ctx = await context(req.params.id);
    res.json(authorsPayload(ctx));
  }),
);

router.post(
  '/:id/authors/merge',
  wrap(async (req, res) => {
    const ctx = await context(req.params.id);
    const keys = parseKeys(req.body, 'keys');
    assertKnownKeys(ctx.index, keys);
    const rawName = (req.body as Record<string, unknown> | null)?.name;
    const name =
      typeof rawName === 'string' && rawName.trim() !== '' ? rawName.trim().slice(0, 100) : undefined;

    ctx.authorFile.groups = mergeKeys(ctx.authorFile.groups, keys, name);
    await saveAuthorFile(ctx.storageDir, ctx.authorFile);
    res.json(authorsPayload(ctx));
  }),
);

router.post(
  '/:id/authors/unmerge',
  wrap(async (req, res) => {
    const ctx = await context(req.params.id);
    const keys = parseKeys(req.body, 'keys');
    ctx.authorFile.groups = unmergeKeys(ctx.authorFile.groups, keys);
    await saveAuthorFile(ctx.storageDir, ctx.authorFile);
    res.json(authorsPayload(ctx));
  }),
);

router.patch(
  '/:id/authors/groups/:groupId',
  wrap(async (req, res) => {
    const ctx = await context(req.params.id);
    const name = requiredString((req.body as Record<string, unknown> | null)?.name, 'name');
    ctx.authorFile.groups = renameGroup(ctx.authorFile.groups, req.params.groupId, name.slice(0, 100));
    await saveAuthorFile(ctx.storageDir, ctx.authorFile);
    res.json(authorsPayload(ctx));
  }),
);

// --- metrics ----------------------------------------------------------------

router.post(
  '/:id/metrics',
  wrap(async (req, res) => {
    const ctx = await context(req.params.id);
    const request = parseMetricsRequest(req.body);
    res.json(computeMetrics(ctx.index, ctx.authorFile.groups, request));
  }),
);

export default router;
