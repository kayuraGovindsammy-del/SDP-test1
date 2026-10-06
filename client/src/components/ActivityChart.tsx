import { fmtInt } from '../format.ts';
import type { ActivityBucket } from '../types.ts';

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

interface Props {
  buckets: ActivityBucket[];
}

/**
 * Monthly commit activity for the selected commit set: added lines above the
 * baseline, removed lines below. Pure div/CSS bars keep it crisp at any width.
 */
export default function ActivityChart({ buckets }: Props) {
  if (buckets.length === 0) return null;

  let maxAdded = 0;
  let maxRemoved = 0;
  let peak = buckets[0];
  for (const b of buckets) {
    if (b.added > maxAdded) maxAdded = b.added;
    if (b.removed > maxRemoved) maxRemoved = b.removed;
    if (b.added + b.removed > peak.added + peak.removed) peak = b;
  }
  const scale = Math.max(maxAdded, maxRemoved, 1);

  const first = buckets[0];
  const last = buckets[buckets.length - 1];
  const label = (b: ActivityBucket): string =>
    `${MONTHS[b.month]} ${b.year} — +${fmtInt(b.added)} / −${fmtInt(b.removed)} · ${fmtInt(
      b.commits,
    )} commit${b.commits === 1 ? '' : 's'}`;

  return (
    <div className="panel activity-panel">
      <div className="panel-title-row">
        <h3>Commit activity</h3>
        <span className="muted small">
          {MONTHS[first.month]} {first.year} – {MONTHS[last.month]} {last.year} · monthly added /
          removed lines
        </span>
      </div>
      <div className="activity-chart">
        {buckets.map((b) => (
          <div className="act-col" key={`${b.year}-${b.month}`} title={label(b)}>
            <div className="act-top">
              <span className="act-bar added" style={{ height: `${(b.added / scale) * 100}%` }} />
            </div>
            <div className="act-bot">
              <span
                className="act-bar removed"
                style={{ height: `${(b.removed / scale) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="act-legend muted small">
        <span>
          <i className="dot added" /> added
        </span>
        <span>
          <i className="dot removed" /> removed
        </span>
        <span>
          peak {MONTHS[peak.month]} {peak.year}: {fmtInt(peak.added + peak.removed)} lines
        </span>
      </div>
    </div>
  );
}
