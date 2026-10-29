/**
 * Step markers in catalog props (`step`, `fragment`, `reveal` on an object
 * with a `step`) are animation metadata, not content.
 */

const STEP_MARKER_KEYS = new Set(['step', 'fragment', 'reveal']);

/** Remove animation metadata before validating a catalog layout's strict props. */
export function stripStepMarkers(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripStepMarkers);
  if (value === null || typeof value !== 'object') return value;

  const record = value as Record<string, unknown>;
  const hasStep = Object.hasOwn(record, 'step');
  const cleaned: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(record)) {
    if (hasStep && STEP_MARKER_KEYS.has(key)) continue;
    cleaned[key] = stripStepMarkers(item);
  }
  return cleaned;
}
