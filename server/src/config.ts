import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Absolute path to the `server` package directory (works for both src/ and dist/). */
export const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Root directory where uploaded/cloned repositories and metadata are stored. */
export const DATA_DIR = process.env.RAT_DATA_DIR
  ? path.resolve(process.env.RAT_DATA_DIR)
  : path.resolve(SERVER_ROOT, '..', 'data');

export const REPOS_DIR = path.join(DATA_DIR, 'repos');
export const TMP_DIR = path.join(DATA_DIR, 'tmp');

export const PORT = Number(process.env.PORT ?? 3001);

/** Maximum time a single `git clone` may take before it is killed. */
export const CLONE_TIMEOUT_MS = 15 * 60 * 1000;

/** Maximum accepted size of an uploaded zip archive. */
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024;
