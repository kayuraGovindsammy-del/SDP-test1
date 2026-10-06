import { fmtInt, fmtPercent } from '../format.ts';
import type { AuthorSummary } from '../types.ts';

const COLORS = ['#4f8cff', '#41d18d', '#ffb454', '#c678ff', '#ff6b81', '#3fd0e0', '#6c7a94'];
const MAX_SEGMENTS = 6;
const CENTER_NAME_MAX = 18;

interface Segment {
  id: string;
  name: string;
  churn: number;
  own: number;
  color: string;
}

interface Props {
  authors: AuthorSummary[];
  activeId: string;
  onSelect: (id: string) => void;
}

/** Churn ownership of the selected commit set as an interactive donut. */
export default function OwnershipDonut({ authors, activeId, onSelect }: Props) {
  const ranked = [...authors].sort((a, b) => b.churn - a.churn);
  const segments: Segment[] = ranked.slice(0, MAX_SEGMENTS).map((a, i) => ({
    id: a.id,
    name: a.name,
    churn: a.churn,
    own: a.ownership,
    color: COLORS[i],
  }));

  const rest = ranked.slice(MAX_SEGMENTS);
  const restChurn = rest.reduce((s, a) => s + a.churn, 0);
  if (rest.length > 0 && restChurn > 0) {
    segments.push({
      id: '',
      name: `${rest.length} other author${rest.length === 1 ? '' : 's'}`,
      churn: restChurn,
      own: rest.reduce((s, a) => s + a.ownership, 0),
      color: COLORS[MAX_SEGMENTS],
    });
  }

  const total = segments.reduce((s, seg) => s + seg.churn, 0);
  if (total === 0) return null;

  const R = 52;
  const CIRC = 2 * Math.PI * R;
  let acc = 0;
  const arcs = segments.map((seg) => {
    const frac = seg.churn / total;
    const arc = { seg, dash: frac * CIRC, offset: acc };
    acc += frac * CIRC;
    return arc;
  });
  const lead = segments[0];
  const leadName = lead.name.length > CENTER_NAME_MAX ? `${lead.name.slice(0, CENTER_NAME_MAX - 1)}…` : lead.name;

  return (
    <div className="panel donut-panel">
      <div className="panel-title-row">
        <h3>Churn ownership</h3>
        <span className="muted small">{fmtInt(total)} lines</span>
      </div>
      <div className="donut-body">
        <svg viewBox="0 0 140 140" className="donut" role="img" aria-label="Churn ownership by author">
          <circle cx="70" cy="70" r={R} className="donut-track" />
          {arcs.map(({ seg, dash, offset }) => (
            <circle
              key={seg.id || '(other)'}
              cx="70"
              cy="70"
              r={R}
              fill="none"
              stroke={seg.color}
              strokeWidth={activeId !== '' && activeId === seg.id ? 18 : 14}
              strokeDasharray={`${dash} ${CIRC - dash}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 70 70)"
              className="donut-seg"
              onClick={() => seg.id !== '' && onSelect(seg.id)}
            >
              <title>
                {seg.name} — {fmtPercent(seg.own)} of churn ({fmtInt(seg.churn)} lines)
              </title>
            </circle>
          ))}
          <text x="70" y="65" className="donut-center">
            {fmtPercent(lead.own)}
          </text>
          <text x="70" y="82" className="donut-center-sub">
            {leadName}
          </text>
        </svg>
        <div className="donut-legend">
          {segments.map((seg) => {
            const selectable = seg.id !== '';
            const active = selectable && activeId === seg.id;
            return (
              <button
                key={seg.id || '(other)'}
                type="button"
                className={active ? 'donut-row active' : 'donut-row'}
                onClick={() => selectable && onSelect(seg.id)}
                disabled={!selectable}
                title={selectable ? `Filter by ${seg.name}` : seg.name}
              >
                <i className="dot" style={{ background: seg.color }} />
                <span className="donut-name">{seg.name}</span>
                <span className="donut-pct">{fmtPercent(seg.own)}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
