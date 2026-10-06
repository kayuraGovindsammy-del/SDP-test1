import fs from 'node:fs';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import { PORT, SERVER_ROOT } from './config.js';
import { HttpError } from './errors.js';
import analysisRouter from './routes/analysis.js';
import repositoriesRouter from './routes/repositories.js';
import { ensureDirs } from './store.js';

const app = express();

app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api/repositories', repositoriesRouter);
app.use('/api/repositories', analysisRouter);

// Serve the built client for production (npm run build && npm start).
const clientDist = path.resolve(SERVER_ROOT, '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) {
      next();
      return;
    }
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (res.headersSent) return;
  const status = statusFrom(err);
  const message = err instanceof Error ? err.message : 'Unexpected server error';
  if (status >= 500) console.error(err);
  res.status(status).json({ error: message });
});

function statusFrom(err: unknown): number {
  if (err instanceof HttpError) return err.status;
  if (err && typeof err === 'object' && 'status' in err) {
    const status = (err as { status?: unknown }).status;
    if (typeof status === 'number') return status;
  }
  return 500;
}

await ensureDirs();
app.listen(PORT, () => {
  console.log(`RAT API listening on http://localhost:${PORT}`);
});
