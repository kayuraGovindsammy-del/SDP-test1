import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { HttpError } from './errors.js';
import { authorNameOf, type RawAuthor } from './indexer.js';

export interface AuthorGroup {
  id: string;
  name: string;
  keys: string[];
}

export interface AuthorFile {
  groups: AuthorGroup[];
}

export interface CanonicalAuthor {
  id: string;
  name: string;
  keys: string[];
  commitCount: number;
}

const AUTHOR_FILE = 'authors.json';

export async function loadAuthorFile(storageDir: string): Promise<AuthorFile> {
  try {
    const raw = await fs.readFile(path.join(storageDir, AUTHOR_FILE), 'utf8');
    const parsed = JSON.parse(raw) as AuthorFile;
    if (!parsed || !Array.isArray(parsed.groups)) return { groups: [] };
    return {
      groups: parsed.groups
        .filter(
          (g) =>
            g &&
            typeof g.id === 'string' &&
            typeof g.name === 'string' &&
            Array.isArray(g.keys),
        )
        .map((g) => ({
          id: g.id,
          name: g.name,
          keys: g.keys.filter((k): k is string => typeof k === 'string'),
        })),
    };
  } catch {
    return { groups: [] };
  }
}

export async function saveAuthorFile(storageDir: string, file: AuthorFile): Promise<void> {
  await fs.writeFile(path.join(storageDir, AUTHOR_FILE), JSON.stringify(file, null, 2));
}

/** Collapse raw authors into canonical authors using the saved groups. */
export function canonicalAuthors(authors: RawAuthor[], groups: AuthorGroup[]): CanonicalAuthor[] {
  const groupOfKey = new Map<string, AuthorGroup>();
  for (const group of groups) {
    for (const key of group.keys) groupOfKey.set(key, group);
  }

  const byId = new Map<string, CanonicalAuthor>();
  for (const author of authors) {
    const group = groupOfKey.get(author.key);
    const id = group ? group.id : author.key;
    let canonical = byId.get(id);
    if (!canonical) {
      canonical = { id, name: group ? group.name : author.name, keys: [], commitCount: 0 };
      byId.set(id, canonical);
    }
    canonical.keys.push(author.key);
    canonical.commitCount += author.commitCount;
  }

  return [...byId.values()].sort((a, b) => b.commitCount - a.commitCount);
}

export function resolverMap(
  canonical: CanonicalAuthor[],
): Map<string, CanonicalAuthor> {
  const map = new Map<string, CanonicalAuthor>();
  for (const author of canonical) {
    for (const key of author.keys) map.set(key, author);
  }
  return map;
}

/** Merge raw author keys into a canonical group, removing them from any prior groups. */
export function mergeKeys(
  groups: AuthorGroup[],
  keys: string[],
  name?: string,
): AuthorGroup[] {
  const set = new Set(keys);
  const remaining = groups
    .map((g) => ({ ...g, keys: g.keys.filter((k) => !set.has(k)) }))
    .filter((g) => g.keys.length > 1);

  const canonicalName = name?.trim() || authorNameOf(keys[0] ?? '');
  const merged: AuthorGroup = {
    id: crypto.randomUUID(),
    name: canonicalName,
    keys: [...set].sort(),
  };
  return [...remaining, merged];
}

/** Remove raw author keys from their groups; groups of one dissolve again. */
export function unmergeKeys(groups: AuthorGroup[], keys: string[]): AuthorGroup[] {
  const set = new Set(keys);
  return groups
    .map((g) => ({ ...g, keys: g.keys.filter((k) => !set.has(k)) }))
    .filter((g) => g.keys.length > 1);
}

export function renameGroup(groups: AuthorGroup[], groupId: string, name: string): AuthorGroup[] {
  if (!groups.some((g) => g.id === groupId)) {
    throw new HttpError(404, 'Author group not found');
  }
  return groups.map((g) => (g.id === groupId ? { ...g, name } : g));
}
