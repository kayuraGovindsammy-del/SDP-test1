import crypto from 'node:crypto';
import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import yauzl from 'yauzl';
import { CLONE_TIMEOUT_MS, REPOS_DIR, TMP_DIR } from './config.js';
import { HttpError } from './errors.js';
import { readRepoInfo, runGit, type RepoGitInfo } from './git.js';

export interface RepositorySource {
  type: 'zip' | 'clone';
  /** Original zip file name, or the clone URL. */
  location: string;
}

export interface RepositoryMeta {
  id: string;
  name: string;
  source: RepositorySource;
  createdAt: string;
  /** Path to the git working directory, relative to REPOS_DIR. */
  repoPath: string;
  git: RepoGitInfo | null;
  gitError?: string;
}

const ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;

export async function ensureDirs(): Promise<void> {
  await fs.mkdir(REPOS_DIR, { recursive: true });
  await fs.mkdir(TMP_DIR, { recursive: true });
}

function slugify(input: string): string {
  const slug = input
    .trim()
    .toLowerCase()
    .replace(/\.git$/, '')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[-._]+|[-._]+$/g, '');
  return slug.slice(0, 60) || 'repository';
}

async function allocateRepoDir(name: string): Promise<{ id: string; dir: string }> {
  const base = slugify(name);
  for (let attempt = 0; attempt < 50; attempt++) {
    const suffix = crypto.randomBytes(2).toString('hex');
    const id = `${base}-${suffix}`;
    const dir = path.join(REPOS_DIR, id);
    try {
      await fs.mkdir(dir, { recursive: false });
      return { id, dir };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    }
  }
  throw new HttpError(500, 'Could not allocate a storage directory for the repository');
}

interface FinaliseOptions {
  id: string;
  dir: string;
  name: string;
  source: RepositorySource;
  repoRoot: string;
}

async function finalise(opts: FinaliseOptions): Promise<RepositoryMeta> {
  const meta: RepositoryMeta = {
    id: opts.id,
    name: opts.name,
    source: opts.source,
    createdAt: new Date().toISOString(),
    repoPath: path.relative(REPOS_DIR, opts.repoRoot).split(path.sep).join('/'),
    git: null,
  };

  try {
    meta.git = await readRepoInfo(opts.repoRoot);
  } catch (err) {
    meta.gitError = err instanceof Error ? err.message : String(err);
  }

  await fs.writeFile(path.join(opts.dir, 'meta.json'), JSON.stringify(meta, null, 2));
  return meta;
}

/**
 * Extract a zip archive with streaming I/O, rejecting entries that try to
 * escape the destination. Streams keep memory flat even for very large
 * archives (uploaded .git histories can be hundreds of megabytes).
 */
async function extractZip(zipPath: string, destDir: string): Promise<void> {
  const zip = await new Promise<yauzl.ZipFile>((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, file) => {
      if (err || !file) reject(new HttpError(400, 'Not a valid zip archive'));
      else resolve(file);
    });
  });

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const fail = (err: Error): void => {
      if (settled) return;
      settled = true;
      try {
        zip.close();
      } catch {
        // already closed
      }
      reject(
        err instanceof HttpError
          ? err
          : new HttpError(400, `Failed to extract archive: ${err.message}`),
      );
    };

    zip.on('entry', (entry: yauzl.Entry) => {
      const name = entry.fileName.replace(/\\/g, '/');
      if (name.startsWith('/') || /^[a-zA-Z]:/.test(name) || name.split('/').includes('..')) {
        fail(new HttpError(400, `Archive contains an unsafe path: ${entry.fileName}`));
        return;
      }

      const writeEntry = async (): Promise<void> => {
        const target = path.join(destDir, ...name.split('/'));
        if (name.endsWith('/')) {
          await fs.mkdir(target, { recursive: true });
          return;
        }
        await fs.mkdir(path.dirname(target), { recursive: true });
        await new Promise<void>((res, rej) => {
          zip.openReadStream(entry, (err, readStream) => {
            if (err || !readStream) {
              rej(err ?? new Error(`could not read ${entry.fileName}`));
              return;
            }
            pipeline(readStream, createWriteStream(target)).then(() => res(), rej);
          });
        });
      };

      writeEntry().then(() => zip.readEntry(), fail);
    });

    zip.on('end', () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    });
    zip.on('error', fail);
    zip.readEntry();
  });
}

/** Find the repository root (the directory containing .git) within an extracted tree. */
async function findRepoRoot(dir: string, maxDepth = 4): Promise<string | null> {
  const queue: Array<{ p: string; d: number }> = [{ p: dir, d: 0 }];
  while (queue.length > 0) {
    const { p, d } = queue.shift()!;
    try {
      await fs.stat(path.join(p, '.git'));
      return p;
    } catch {
      // no .git here; keep searching
    }
    if (d >= maxDepth) continue;
    const entries = await fs.readdir(p, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name !== '.git' && entry.name !== 'node_modules') {
        queue.push({ p: path.join(p, entry.name), d: d + 1 });
      }
    }
  }
  return null;
}

export async function createRepositoryFromZip(options: {
  name: string;
  filename: string;
  zipPath: string;
}): Promise<RepositoryMeta> {
  const { id, dir } = await allocateRepoDir(options.name);
  try {
    const extractDir = path.join(dir, 'extracted');
    await fs.mkdir(extractDir, { recursive: true });
    await extractZip(options.zipPath, extractDir);

    const repoRoot = await findRepoRoot(extractDir);
    if (!repoRoot) {
      throw new HttpError(
        400,
        'The archive does not contain a .git directory or file. Zip the repository folder including its .git directory.',
      );
    }

    return await finalise({
      id,
      dir,
      name: options.name,
      source: { type: 'zip', location: options.filename },
      repoRoot,
    });
  } catch (err) {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    throw err;
  }
}

export async function createRepositoryFromClone(options: {
  name: string;
  url: string;
}): Promise<RepositoryMeta> {
  const { id, dir } = await allocateRepoDir(options.name);
  try {
    const dest = path.join(dir, 'repo');
    const result = await runGit(['clone', '--no-hardlinks', '--', options.url, dest], {
      cwd: dir,
      timeoutMs: CLONE_TIMEOUT_MS,
    });

    if (result.code !== 0) {
      const detail =
        (result.stderr || result.stdout).trim().split('\n').slice(-4).join('\n') || 'unknown error';
      throw new HttpError(400, `git clone failed:\n${detail}`);
    }

    return await finalise({
      id,
      dir,
      name: options.name,
      source: { type: 'clone', location: options.url },
      repoRoot: dest,
    });
  } catch (err) {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    throw err;
  }
}

export async function listRepositories(): Promise<RepositoryMeta[]> {
  await ensureDirs();
  const entries = await fs.readdir(REPOS_DIR, { withFileTypes: true });
  const repos: RepositoryMeta[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      const raw = await fs.readFile(path.join(REPOS_DIR, entry.name, 'meta.json'), 'utf8');
      repos.push(JSON.parse(raw) as RepositoryMeta);
    } catch {
      // ignore incomplete or broken entries
    }
  }
  repos.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return repos;
}

export function resolveRepoDir(id: string): string {
  if (!ID_PATTERN.test(id)) {
    throw new HttpError(400, 'Invalid repository id');
  }
  return path.join(REPOS_DIR, id);
}

/** Load a repository's metadata; throws 404 when the repository is unknown. */
export async function getRepository(id: string): Promise<RepositoryMeta> {
  const dir = resolveRepoDir(id);
  let raw: string;
  try {
    raw = await fs.readFile(path.join(dir, 'meta.json'), 'utf8');
  } catch {
    throw new HttpError(404, 'Repository not found');
  }
  try {
    return JSON.parse(raw) as RepositoryMeta;
  } catch {
    throw new HttpError(500, 'Repository metadata is corrupted');
  }
}

/** Directory holding a repository's metadata and analysis side files. */
export function repoStorageDir(id: string): string {
  return resolveRepoDir(id);
}

/** Absolute path to the git working tree of a repository. */
export function repoGitDir(meta: RepositoryMeta): string {
  return path.join(REPOS_DIR, meta.repoPath);
}

export async function deleteRepository(id: string): Promise<void> {
  const dir = resolveRepoDir(id);
  try {
    await fs.access(dir);
  } catch {
    throw new HttpError(404, 'Repository not found');
  }
  await fs.rm(dir, { recursive: true, force: true });
}
