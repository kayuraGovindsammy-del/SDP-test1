import { useEffect, useState } from 'react';
import * as api from '../api.ts';
import { errorMessage, fmtInt, fmtPercent } from '../format.ts';
import type { MetricsRequest } from '../types.ts';

const MAX_TILES = 60;

interface Item {
  path: string;
  type: 'file' | 'dir';
  value: number;
}

interface Tile extends Item {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Binary-split treemap layout in unit coordinates; slices the shorter side. */
function layout(items: Item[], x: number, y: number, w: number, h: number, out: Tile[]): void {
  if (items.length === 0 || w <= 0 || h <= 0) return;
  if (items.length === 1) {
    out.push({ ...items[0], x, y, w, h });
    return;
  }
  const total = items.reduce((s, it) => s + it.value, 0);
  let acc = 0;
  let split = 1;
  for (let i = 0; i < items.length - 1; i++) {
    acc += items[i].value;
    split = i + 1;
    if (acc >= total / 2) break;
  }
  const frac = total === 0 ? 0.5 : Math.min(0.85, Math.max(0.15, acc / total));
  const left = items.slice(0, split);
  const right = items.slice(split);
  if (w >= h) {
    layout(left, x, y, w * frac, h, out);
    layout(right, x + w * frac, y, w * (1 - frac), h, out);
  } else {
    layout(left, x, y, w, h * frac, out);
    layout(right, x, y + h * frac, w, h * (1 - frac), out);
  }
}

function leaf(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx === -1 ? path : path.slice(idx + 1);
}

function hue(path: string): number {
  let h = 0;
  for (let i = 0; i < path.length; i++) h = (h * 31 + path.charCodeAt(i)) % 360;
  return h;
}

interface Props {
  repoId: string;
  selection: MetricsRequest['selection'];
  author: string;
  path: string;
  authorsRev: string;
  onDrill: (path: string) => void;
}

/**
 * Churn share of the immediate children of the current directory as an
 * interactive treemap: click a tile to drill into a directory (or focus a file).
 */
export default function TreeMap({ repoId, selection, author, path, authorsRev, onDrill }: Props) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    api
      .getMetrics(repoId, {
        selection,
        author: author || undefined,
        path: path || undefined,
        include: 'both',
        sort: 'churn',
        dir: 'desc',
        limit: 1000,
        offset: 0,
      })
      .then((res) => {
        if (cancelled) return;
        const baseDepth = path === '' ? 0 : path.split('/').length;
        const children = res.rows
          .filter(
            (r) =>
              r.path !== '' &&
              r.depth === baseDepth + 1 &&
              (path === '' || r.path.startsWith(`${path}/`)) &&
              r.churn > 0,
          )
          .map((r) => ({ path: r.path, type: r.type, value: r.churn }))
          .sort((a, b) => b.value - a.value);
        setItems(children);
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [repoId, selection, author, path, authorsRev]);

  const shown = items === null ? [] : items.slice(0, MAX_TILES);
  const tiles: Tile[] = [];
  layout(shown, 0, 0, 1, 1, tiles);
  const total = shown.reduce((s, it) => s + it.value, 0);

  return (
    <div className="panel treemap-panel">
      <div className="panel-title-row">
        <h3>Churn distribution</h3>
        <span className="muted small">
          {items === null
            ? 'loading…'
            : items.length > MAX_TILES
              ? `top ${MAX_TILES} of ${fmtInt(items.length)} children by churn`
              : 'immediate children by churn'}
        </span>
      </div>
      {error && <div className="error">{error}</div>}
      {items !== null && items.length === 0 && !error && (
        <div className="muted small treemap-empty">
          No sub-objects with churn at this level.
        </div>
      )}
      {tiles.length > 0 && (
        <div className="treemap">
          {tiles.map((t) => {
            const pct = total > 0 ? t.value / total : 0;
            const showLabel = t.w > 0.1 && t.h > 0.16;
            return (
              <button
                key={t.path}
                type="button"
                className="tile"
                style={{
                  left: `${t.x * 100}%`,
                  top: `${t.y * 100}%`,
                  width: `${t.w * 100}%`,
                  height: `${t.h * 100}%`,
                  background: `hsl(${hue(t.path)} 45% ${t.type === 'dir' ? 24 : 32}%)`,
                }}
                title={`${t.path} — churn ${fmtInt(t.value)} (${fmtPercent(pct)})`}
                onClick={() => onDrill(t.path)}
              >
                {showLabel && (
                  <>
                    <span className="tile-name">
                      {t.type === 'dir' ? `${leaf(t.path)}/` : leaf(t.path)}
                    </span>
                    <span className="tile-pct">{fmtPercent(pct)}</span>
                  </>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
