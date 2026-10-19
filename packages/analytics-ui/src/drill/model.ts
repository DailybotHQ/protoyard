import {
  type FilterCondition,
  FilterConditionSchema,
  type FilterGroup,
} from '@protoyard/analytics';

/*
 * A drill path is data: the steps a user took from a chart into its rows,
 * each a label for the breadcrumb plus one filter condition. It round-trips
 * through the hash query, so a reload or a shared link reopens the same view.
 */

export interface DrillStep {
  label: string;
  filter: FilterCondition;
}

export interface DrillPath {
  steps: DrillStep[];
}

export const EMPTY_DRILL: DrillPath = { steps: [] };

/** A step for "this property equals this value", e.g. from a clicked bar. */
export function drillStep(
  property: string,
  value: string | number | boolean,
  label?: string
): DrillStep {
  return { label: label ?? String(value), filter: { property, operator: 'eq', value } };
}

/** Adds a step; a step on a property already in the path replaces that step and drops the ones after it. */
export function pushDrill(path: DrillPath, step: DrillStep): DrillPath {
  const at = path.steps.findIndex((s) => s.filter.property === step.filter.property);
  return { steps: [...(at >= 0 ? path.steps.slice(0, at) : path.steps), step] };
}

/** Keeps the first `depth` steps (0 = back to everything). */
export const truncateDrill = (path: DrillPath, depth: number): DrillPath => ({
  steps: path.steps.slice(0, Math.max(0, depth)),
});

/** Every step ANDed, optionally on top of a base filter (the page's own filters). */
export function drillFilter(path: DrillPath, base?: FilterGroup): FilterGroup {
  const conditions = path.steps.map((s) => s.filter);
  if (base && base.conditions.length > 0)
    return { combinator: 'and', conditions: [base, ...conditions] };
  return { combinator: 'and', conditions };
}

/** `drill=<encoded JSON>` for the hash query (empty string for no path). */
export function toDrillQuery(path: DrillPath): string {
  if (path.steps.length === 0) return '';
  return new URLSearchParams({
    drill: JSON.stringify(path.steps.map((s) => [s.label, s.filter])),
  }).toString();
}

/** Reads the path back; invalid steps are dropped (the query is untrusted input). */
export function fromDrillQuery(query: string | URLSearchParams): DrillPath {
  const params =
    typeof query === 'string' ? new URLSearchParams(query.replace(/^[?#]/, '')) : query;
  const raw = params.get('drill');
  if (!raw) return { steps: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { steps: [] };
  }
  if (!Array.isArray(parsed)) return { steps: [] };
  const steps: DrillStep[] = [];
  for (const entry of parsed.slice(0, 8)) {
    if (!Array.isArray(entry) || typeof entry[0] !== 'string' || entry[0].length > 80) continue;
    const filter = FilterConditionSchema.safeParse(entry[1]);
    if (filter.success) steps.push({ label: entry[0], filter: filter.data });
  }
  return { steps };
}
