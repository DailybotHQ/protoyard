const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });
const day = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

export const formatTime = (iso: string) => time.format(new Date(iso));

/** Time for today (in SIMULATED time), a short date otherwise. */
export function shortStamp(iso: string, now: Date): string {
  const at = new Date(iso);
  return at.toDateString() === now.toDateString() ? time.format(at) : day.format(at);
}

const longDay = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
});
export const formatDay = (iso: string) => longDay.format(new Date(iso));
