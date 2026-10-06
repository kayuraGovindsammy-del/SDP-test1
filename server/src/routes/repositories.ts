import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Router, type Request } from 'express';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';
import { MAX_UPLOAD_BYTES, TMP_DIR } from '../config.js';
import { HttpError } from '../errors.js';
import { invalidateIndex } from '../indexer.js';
import {
  createRepositoryFromClone,
  createRepositoryFromZip,
  deleteRepository,
  listRepositories,
} from '../store.js';
import { decodeHeader, requiredString, wrap } from './util.js';

const router = Router();

const CLONE_URL_PATTERN = /^(https?:\/\/|git:\/\/|ssh:\/\/|file:\/\/|git@[A-Za-z0-9._-]+:)\S+$/;

function repoNameFromUrl(url: string): string {
  const cleaned = url.replace(/\/+$/, '');
  const last = cleaned.split(/[/:]/).pop() ?? 'repository';
  return last.replace(/\.git$/i, '') || 'repository';
}

/** Stream the request body to `dest`, enforcing a size limit. */
async function saveUpload(req: Request, dest: string, maxBytes: number): Promise<void> {
  let total = 0;
  let tooLarge: HttpError | null = null;

  req.on('data', (chunk: Buffer) => {
    total += chunk.length;
    if (total > maxBytes && !tooLarge) {
      tooLarge = new HttpError(
        413,
        `Uploads are limited to ${(maxBytes / 1024 ** 3).toFixed(0)} GB`,
      );
      req.destroy(tooLarge);
    }
  });

  try {
    await pipeline(req, createWriteStream(dest));
  } catch (err) {
    if (tooLarge) throw tooLarge;
    throw err;
  }

  if (total === 0) {
    throw new HttpError(400, 'Empty upload received');
  }
}

router.get(
  '/',
  wrap(async (_req, res) => {
    res.json(await listRepositories());
  }),
);

// The client sends the raw zip bytes with an X-Filename header, so the body
// stream is piped straight to disk without any multipart parsing.
router.post(
  '/upload',
  wrap(async (req, res) => {
    const filename = decodeHeader(req.get('X-Filename')) || 'upload.zip';
    if (!filename.toLowerCase().endsWith('.zip')) {
      throw new HttpError(400, 'Only .zip archives are supported');
    }
    const nameOverride = decodeHeader(req.get('X-Name')).trim();

    await fs.mkdir(TMP_DIR, { recursive: true });
    const tmpZip = path.join(TMP_DIR, `${crypto.randomUUID()}.zip`);

    try {
      await saveUpload(req, tmpZip, MAX_UPLOAD_BYTES);
      const repository = await createRepositoryFromZip({
        name: nameOverride || filename.replace(/\.zip$/i, ''),
        filename,
        zipPath: tmpZip,
      });
      res.status(201).json(repository);
    } finally {
      await fs.rm(tmpZip, { force: true }).catch(() => {});
    }
  }),
);

router.post(
  '/clone',
  wrap(async (req, res) => {
    const url = requiredString(req.body?.url, 'url');
    if (url.startsWith('-') || !CLONE_URL_PATTERN.test(url)) {
      throw new HttpError(
        400,
        'Provide a valid clone URL (https://, http://, git://, ssh://, file:// or git@host:path)',
      );
    }
    const nameInput =
      typeof req.body?.name === 'string' && req.body.name.trim() !== ''
        ? req.body.name.trim()
        : repoNameFromUrl(url);

    const repository = await createRepositoryFromClone({ name: nameInput, url });
    res.status(201).json(repository);
  }),
);

router.delete(
  '/:id',
  wrap(async (req, res) => {
    await deleteRepository(req.params.id);
    invalidateIndex(req.params.id);
    res.status(204).end();
  }),
);

export default router;
