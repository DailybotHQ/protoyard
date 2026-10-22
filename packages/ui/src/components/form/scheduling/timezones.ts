export interface TimeZoneOption {
  /** IANA zone name, for example `America/Bogota`. */
  value: string;
  /** `(GMT-05:00) America/Bogota` */
  label: string;
  /** Offset from UTC at the reference instant, in minutes (east is positive). */
  offsetMinutes: number;
}

// Used only where the engine cannot list its zones (Intl.supportedValuesOf is missing).
const FALLBACK_TIME_ZONES = [
  'UTC',
  'Pacific/Honolulu',
  'America/Anchorage',
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'America/Bogota',
  'America/Sao_Paulo',
  'Atlantic/Reykjavik',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Africa/Cairo',
  'Africa/Nairobi',
  'Europe/Moscow',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Bangkok',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Pacific/Auckland',
];

/** Every IANA zone the engine knows, with `UTC` always present. */
export function listTimeZones(): string[] {
  const supported =
    typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  const zones = supported.length > 0 ? supported : FALLBACK_TIME_ZONES;
  return zones.includes('UTC') ? [...zones] : ['UTC', ...zones];
}

export function isValidTimeZone(zone: unknown): zone is string {
  if (typeof zone !== 'string' || zone.trim() === '') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** Offset of `zone` from UTC at `at`, in minutes; DST is whatever applies at that instant. */
export function timeZoneOffsetMinutes(zone: string, at: Date | number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(at);
  const read = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const wall = Date.UTC(
    read('year'),
    read('month') - 1,
    read('day'),
    read('hour'),
    read('minute'),
    read('second')
  );
  const instant = Math.floor(new Date(at).getTime() / 1000) * 1000;
  return Math.round((wall - instant) / 60_000);
}

/** `GMT+05:30`, `GMT-03:00`, `GMT+00:00` */
export function formatUtcOffset(minutes: number): string {
  const sign = minutes < 0 ? '-' : '+';
  const abs = Math.abs(minutes);
  return `GMT${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

function readableZone(zone: string): string {
  return zone.replaceAll('_', ' ');
}

/**
 * Options sorted west to east, then by name. Offsets are computed at `at`, so
 * pass the scenario clock to keep a prototype deterministic.
 */
export function timeZoneOptions(
  at: Date | number,
  zones: readonly string[] = listTimeZones()
): TimeZoneOption[] {
  return zones
    .filter(isValidTimeZone)
    .map((value) => {
      const offsetMinutes = timeZoneOffsetMinutes(value, at);
      return {
        value,
        offsetMinutes,
        label: `(${formatUtcOffset(offsetMinutes)}) ${readableZone(value)}`,
      };
    })
    .sort((a, b) => a.offsetMinutes - b.offsetMinutes || a.value.localeCompare(b.value));
}

function fold(text: string): string {
  return text.toLowerCase().replaceAll('_', ' ').replace(/\s+/g, ' ').trim();
}

/** Matches any part of the label or zone name; underscores and spaces are interchangeable. */
export function matchesTimeZone(option: { value: string; label: string }, query: string): boolean {
  const q = fold(query);
  if (q === '') return true;
  return fold(option.label).includes(q) || fold(option.value).includes(q);
}
