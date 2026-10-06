import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { HttpError } from './errors.js';
import { runGit } from './git.js';

export interface IndexedChange {
  /** New path for renames; the (old) path for deletions. */
  path: string;
  added: number;
  removed: number;
}

export interface IndexedCommit {
  hash: string;
  short: string;
  /** Committer timestamp, epoch seconds. */
  ts: number;
  iso: string;
  authorKey: string;
  subject: string;
  changes: IndexedChange[];
}

export interface RawAuthor {
  key: string;
  name: string;
  email: string;
  commitCount: number;
}

export interface RepoIndex {
  generatedAt: string;
  head: string | null;
  truncated: boolean;
  commitCount: number;
  commits: IndexedCommit[];
  authors: RawAuthor[];
}

/** The repository root is represented as the empty path. */
export const ROOT_PATH = '';

export function authorKeyOf(name: string, email: string): string {
  return `${name} <${email}>`;
}

export function authorNameOf(key: string): string {
  const idx = key.lastIndexOf(' <');
  return idx === -1 ? key : key.slice(0, idx);
}

export function authorEmailOf(key: string): string {
  const open = key.lastIndexOf(' <');
  const close = key.endsWith('>') ? key.length - 1 : -1;
  return open === -1 || close === -1 ? '' : key.slice(open + 2, close);
}

/** Safety valve on index size; the default comfortably covers ~100k-commit repositories. */
const rawMaxCommits = Number(process.env.RAT_MAX_COMMITS);
const MAX_INDEX_COMMITS =
  Number.isFinite(rawMaxCommits) && rawMaxCommits > 0 ? Math.floor(rawMaxCommits) : 200_000;

const REC = '\x01';
const SEP = '\x1f';

const indexCache = new Map<string, RepoIndex>();
const pendingBuilds = new Map<string, Promise<RepoIndex>>();

export function invalidateIndex(repoId: string): void {
  indexCache.delete(repoId);
  pendingBuilds.delete(repoId);
}

/**
 * Load the commit index for a repository, building and persisting it on first use.
 * The index covers the non-merge commits reachable from HEAD with rename detection
 * at 50%, mailmap applied, and binary files skipped (git reports them as -/-).
 */
export async function getIndex(
  repoId: string,
  storageDir: string,
  gitDir: string,
): Promise<RepoIndex> {
  const cached = indexCache.get(repoId);
  if (cached) return cached;
  const pending = pendingBuilds.get(repoId);
  if (pending) return pending;

  const build = (async (): Promise<RepoIndex> => {
    const indexFile = path.join(storageDir, 'index.json');
    try {
      const raw = await fs.readFile(indexFile, 'utf8');
      const index = JSON.parse(raw) as RepoIndex;
      indexCache.set(repoId, index);
      return index;
    } catch {
      // no usable cache — build from git below
    }
    const index = await buildIndex(gitDir);
    await fs.writeFile(indexFile, JSON.stringify(index)).catch(() => {});
    indexCache.set(repoId, index);
    return index;
  })().finally(() => {
    pendingBuilds.delete(repoId);
  });

  pendingBuilds.set(repoId, build);
  return build;
}

async function buildIndex(gitDir: string): Promise<RepoIndex> {
  const headRes = await runGit(['rev-parse', '--verify', '-q', 'HEAD^{commit}'], { cwd: gitDir });
  if (headRes.code !== 0) {
    return {
      generatedAt: new Date().toISOString(),
      head: null,
      truncated: false,
      commitCount: 0,
      commits: [],
      authors: [],
    };
  }

  const { commits, truncated, stderr } = await walkLog(gitDir);

  if (!truncated && commits.length === 0 && stderr.trim() !== '') {
    throw new HttpError(400, `Could not read git history: ${stderr.trim().split('\n')[0]}`);
  }

  const authorsMap = new Map<string, RawAuthor>();
  for (const commit of commits) {
    const existing = authorsMap.get(commit.authorKey);
    if (existing) {
      existing.commitCount += 1;
    } else {
      authorsMap.set(commit.authorKey, {
        key: commit.authorKey,
        name: authorNameOf(commit.authorKey),
        email: authorEmailOf(commit.authorKey),
        commitCount: 1,
      });
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    head: headRes.stdout.trim(),
    truncated,
    commitCount: commits.length,
    commits,
    authors: [...authorsMap.values()].sort((a, b) => b.commitCount - a.commitCount),
  };
}

interface WalkResult {
  commits: IndexedCommit[];
  truncated: boolean;
  stderr: string;
}

/**
 * Stream `git log --numstat -z` and assemble per-commit change lists.
 *
 * Record format with -z (NUL terminated):
 *   - commit record: "\x01<hash>\x1f<short>\x1f<ct>\x1f<iso>\x1f<name>\x1f<email>\x1f<subject>"
 *   - file row: "<added>\t<removed>\t<path>" (binary rows use "-")
 *   - rename row: "<added>\t<removed>\t" followed by two records: <old path>, <new path>
 *   - the first file row of a commit is prefixed with "\n"
 */
function walkLog(gitDir: string): Promise<WalkResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'git',
      [
        '-c',
        'core.quotePath=false',
        'log',
        '--no-merges',
        '--use-mailmap',
        '-M50%',
        '--numstat',
        '-z',
        `--format=${REC}%H${SEP}%h${SEP}%ct${SEP}%cI${SEP}%aN${SEP}%aE${SEP}%s`,
        'HEAD',
      ],
      { cwd: gitDir, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } },
    );

    const decoder = new StringDecoder('utf8');
    let buf = '';
    let stderr = '';
    let truncated = false;
    let stopped = false;

    const commits: IndexedCommit[] = [];
    let current: IndexedCommit | null = null;
    let expectDiffStart = false;
    let pendingRename: {
      added: number;
      removed: number;
      binary: boolean;
      oldPath: string | null;
    } | null = null;

    const flush = (): void => {
      if (!current) return;
      commits.push(current);
      current = null;
      if (commits.length >= MAX_INDEX_COMMITS) {
        truncated = true;
        stopped = true;
        child.kill('SIGKILL');
      }
    };

    const handleRecord = (record0: string): void => {
      let record = record0;
      if (expectDiffStart && record.startsWith('\n')) record = record.slice(1);
      expectDiffStart = false;

      if (record.startsWith(REC)) {
        flush();
        if (stopped) return;
        const fields = record.slice(1).split(SEP);
        const [hash = '', short = '', ct = '0', iso = '', name = '', email = ''] = fields;
        current = {
          hash,
          short,
          ts: Number(ct) || 0,
          iso,
          authorKey: authorKeyOf(name, email),
          subject: fields.slice(6).join(SEP),
          changes: [],
        };
        expectDiffStart = true;
        return;
      }

      if (pendingRename) {
        if (pendingRename.oldPath === null) {
          pendingRename.oldPath = record;
        } else {
          if (!pendingRename.binary && current) {
            current.changes.push({
              path: record,
              added: pendingRename.added,
              removed: pendingRename.removed,
            });
          }
          pendingRename = null;
        }
        return;
      }

      if (record === '') return;

      const tab1 = record.indexOf('\t');
      const tab2 = record.indexOf('\t', tab1 + 1);
      if (tab1 === -1 || tab2 === -1) return;

      const addedRaw = record.slice(0, tab1);
      const removedRaw = record.slice(tab1 + 1, tab2);
      const p = record.slice(tab2 + 1);
      const binary = addedRaw === '-' || removedRaw === '-';
      const added = binary ? 0 : Number(addedRaw) || 0;
      const removed = binary ? 0 : Number(removedRaw) || 0;

      if (p === '') {
        pendingRename = { added, removed, binary, oldPath: null };
        return;
      }
      if (!binary && current) {
        current.changes.push({ path: p, added, removed });
      }
    };

    child.stdout.on('data', (chunk: Buffer) => {
      if (stopped) return;
      buf += decoder.write(chunk);
      let idx: number;
      while ((idx = buf.indexOf('\0')) !== -1) {
        const record = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        handleRecord(record);
        if (stopped) return;
      }
    });

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });

    child.on('error', (err) => {
      reject(err);
    });

    child.on('close', () => {
      flush();
      resolve({ commits, truncated, stderr });
    });
  });
}
