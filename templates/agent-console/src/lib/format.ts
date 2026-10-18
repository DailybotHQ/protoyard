const DAY = 86_400_000;

/** "3 days ago" relative to the simulated clock, never the real one. */
export function timeAgo(iso: string, now: Date): string {
  const diff = now.getTime() - new Date(iso).getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < DAY) return `${Math.floor(diff / 3_600_000)} h ago`;
  const days = Math.floor(diff / DAY);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

export const formatNumber = (n: number) => new Intl.NumberFormat('en-US').format(n);

export const percent = (part: number, total: number) =>
  total === 0 ? '—' : `${Math.round((part / total) * 100)}%`;
