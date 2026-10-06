export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong';
}

export function fmtInt(n: number): string {
  return n.toLocaleString();
}

export function fmtSigned(n: number): string {
  return n > 0 ? `+${n.toLocaleString()}` : n.toLocaleString();
}

export function fmtRate(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

export function fmtPercent(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return `${Math.round(n * 100)}%`;
}

export function fmtTimestamp(seconds: number): string {
  return new Date(seconds * 1000).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}
