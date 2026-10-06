import { Fragment, useState } from 'react';
import { fmtInt, fmtPercent, fmtRate, fmtSigned } from '../format.ts';
import type { MetricRow, SortKey } from '../types.ts';

interface Props {
  rows: MetricRow[];
  currentPath: string;
  onDrill: (path: string) => void;
  sort: SortKey;
  dir: 'asc' | 'desc';
  onSort: (key: SortKey) => void;
  totalRows: number;
  offset: number;
  limit: number;
  onPage: (offset: number) => void;
  loading: boolean;
  error: string | null;
}

const COLUMNS: Array<{ key: SortKey; label: string; num: boolean }> = [
  { key: 'path', label: 'Path', num: false },
  { key: 'added', label: 'Added', num: true },
  { key: 'removed', label: 'Removed', num: true },
  { key: 'growth', label: 'Growth', num: true },
  { key: 'churn', label: 'Churn', num: true },
  { key: 'modifications', label: 'Mods', num: true },
  { key: 'modificationFrequency', label: 'Freq η', num: true },
  { key: 'churnRate', label: 'Rate ρ', num: true },
];

const TOTAL_COLS = COLUMNS.length + 1; // + top author column

function leafName(row: MetricRow): string {
  if (row.path === '') return 'root (repository)';
  const idx = row.path.lastIndexOf('/');
  return idx === -1 ? row.path : row.path.slice(idx + 1);
}

function Breadcrumb({
  currentPath,
  onDrill,
  totalRows,
}: {
  currentPath: string;
  onDrill: (path: string) => void;
  totalRows: number;
}) {
  const parts = currentPath === '' ? [] : currentPath.split('/');
  return (
    <div className="breadcrumb">
      <span className="muted small">Drill-down:</span>
      {parts.length === 0 ? (
        <span className="crumb current">root</span>
      ) : (
        <button type="button" className="crumb" onClick={() => onDrill('')}>
          root
        </button>
      )}
      {parts.map((part, i) => {
        const path = parts.slice(0, i + 1).join('/');
        const last = i === parts.length - 1;
        return (
          <Fragment key={path}>
            <span className="crumb-sep">/</span>
            {last ? (
              <span className="crumb current">{part}</span>
            ) : (
              <button type="button" className="crumb" onClick={() => onDrill(path)}>
                {part}
              </button>
            )}
          </Fragment>
        );
      })}
      <span className="muted small">
        · {fmtInt(totalRows)} row{totalRows === 1 ? '' : 's'}
      </span>
    </div>
  );
}

export default function MetricsTable({
  rows,
  currentPath,
  onDrill,
  sort,
  dir,
  onSort,
  totalRows,
  offset,
  limit,
  onPage,
  loading,
  error,
}: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const toggleExpanded = (path: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const hasPrev = offset > 0;
  const hasNext = offset + limit < totalRows;
  const isRootRow = (row: MetricRow): boolean => row.path === '';

  return (
    <div className="panel table-panel">
      <div className="table-head">
        <Breadcrumb currentPath={currentPath} onDrill={onDrill} totalRows={totalRows} />
      </div>

      {error && <div className="error table-error">{error}</div>}

      <div className={loading ? 'table-wrap stale' : 'table-wrap'}>
        <table className="metrics">
          <thead>
            <tr>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className={
                    (col.num ? 'num sortable' : 'sortable') + (sort === col.key ? ' sorted' : '')
                  }
                  onClick={() => onSort(col.key)}
                  title={`Sort by ${col.label}`}
                >
                  {col.label}
                  {sort === col.key && <span className="arrow">{dir === 'asc' ? '▲' : '▼'}</span>}
                </th>
              ))}
              <th>Top author</th>
            </tr>
          </thead>
          <tbody>
            {!error && rows.length === 0 && !loading && (
              <tr>
                <td colSpan={TOTAL_COLS} className="muted table-empty">
                  No objects match the current filters.
                </td>
              </tr>
            )}
            {rows.map((row) => {
              const expandable = row.authors.length > 0;
              const isExpanded = expanded.has(row.path);
              return (
                <Fragment key={row.path === '' ? '(root)' : row.path}>
                  <tr>
                    <td className="path-cell">
                      <span
                        className="path-indent"
                        style={{ paddingLeft: row.depth * 16 }}
                      >
                        {row.type === 'dir' ? (
                          <button
                            type="button"
                            className="path-btn dir"
                            onClick={() => onDrill(isRootRow(row) ? '' : row.path)}
                            title={row.path || 'Repository root'}
                          >
                            {leafName(row)}
                          </button>
                        ) : (
                          <span className="path-plain" title={row.path}>
                            {leafName(row)}
                          </span>
                        )}
                        <span className="type-badge">{row.type}</span>
                      </span>
                    </td>
                    <td className="num pos">{fmtInt(row.added)}</td>
                    <td className="num neg">{fmtInt(row.removed)}</td>
                    <td className="num">{fmtSigned(row.growth)}</td>
                    <td className="num">{fmtInt(row.churn)}</td>
                    <td className="num">{fmtInt(row.modifications)}</td>
                    <td className="num">{fmtRate(row.modificationFrequency)}</td>
                    <td className="num">{fmtRate(row.churnRate)}</td>
                    <td>
                      <div className="own-cell">
                        {expandable && (
                          <button
                            type="button"
                            className="expand-btn"
                            onClick={() => toggleExpanded(row.path)}
                            title={isExpanded ? 'Hide author breakdown' : 'Show author breakdown'}
                          >
                            {isExpanded ? '▾' : '▸'}
                          </button>
                        )}
                        {row.topAuthor ? (
                          <>
                            <span className="own-name" title={row.topAuthor.name}>
                              {row.topAuthor.name}
                            </span>
                            <span className="own-bar">
                              <span
                                style={{
                                  width: `${Math.round(row.topAuthor.ownership * 100)}%`,
                                }}
                              />
                            </span>
                            <span className="own-pct">{fmtPercent(row.topAuthor.ownership)}</span>
                          </>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="subrow">
                      <td colSpan={TOTAL_COLS}>
                        <div className="author-breakdown">
                          {row.authors.map((a) => (
                            <div className="breakdown-row" key={a.id}>
                              <span className="breakdown-name" title={a.name}>
                                {a.name}
                              </span>
                              <span className="muted">
                                {fmtInt(a.modifications)} mod
                                {a.modifications === 1 ? '' : 's'}
                              </span>
                              <span className="muted">churn {fmtInt(a.churn)}</span>
                              <span>ownership {fmtPercent(a.ownership)}</span>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="table-foot">
        <span className="muted small">
          {totalRows === 0
            ? 'No rows'
            : `Showing ${fmtInt(offset + 1)}–${fmtInt(Math.min(offset + rows.length, totalRows))} of ${fmtInt(totalRows)}`}
        </span>
        <div className="pager">
          <button
            type="button"
            className="btn btn-sm"
            disabled={!hasPrev || loading}
            onClick={() => onPage(Math.max(0, offset - limit))}
          >
            Prev
          </button>
          <button
            type="button"
            className="btn btn-sm"
            disabled={!hasNext || loading}
            onClick={() => onPage(offset + limit)}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
