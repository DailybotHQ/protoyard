/**
 * Monotonic wall-clock helpers for simulated time.
 *
 * When the simulation clock is paused, many writes share the same
 * `clock.now()`. Sorting rows by `at` alone then becomes unstable if ids are
 * random (`createRuntimeId`). Use {@link nextMonotonicIso} so each write is at
 * least one millisecond after the previous one in the same sequence.
 */

/**
 * Return an ISO-8601 timestamp that is at least `now`, and strictly after
 * `lastIso` by at least 1 ms when `lastIso` is a parseable instant.
 *
 * @param lastIso - Previous instant in the sequence (message, event, …), or
 *   `null` / `undefined` when this is the first write.
 * @param now - Current simulated instant as a `Date`, ISO string, or epoch ms.
 */
export function nextMonotonicIso(
  lastIso: string | null | undefined,
  now: Date | string | number
): string {
  const nowMs = toEpochMs(now, 'now');
  if (lastIso == null || lastIso === '') {
    return new Date(nowMs).toISOString();
  }
  const lastMs = Date.parse(lastIso);
  if (Number.isNaN(lastMs)) {
    throw new RangeError(`Invalid lastIso: ${lastIso}`);
  }
  return new Date(Math.max(nowMs, lastMs + 1)).toISOString();
}

function toEpochMs(value: Date | string | number, label: string): number {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new RangeError(`Invalid ${label}: ${String(value)}`);
    return value;
  }
  if (value instanceof Date) {
    const ms = value.getTime();
    if (Number.isNaN(ms)) throw new RangeError(`Invalid ${label}: Invalid Date`);
    return ms;
  }
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) throw new RangeError(`Invalid ${label}: ${value}`);
  return ms;
}
