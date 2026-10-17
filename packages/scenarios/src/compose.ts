import {
  type Scenario,
  type ScenarioDefinition,
  type ScenarioInput,
  ScenarioSchema,
} from '@protoyard/core';

type Plain = Record<string, unknown>;

export type DeepPartial<T> = T extends readonly unknown[]
  ? T
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;

/** A partial scenario: one axis (role, density, billing…) to layer on a base. */
export type ScenarioFragment = DeepPartial<ScenarioInput>;

function isPlainObject(value: unknown): value is Plain {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Deep merge for scenario data: objects merge key by key, arrays and scalars
 * are replaced, `undefined` never overwrites. Inputs are not mutated.
 */
export function deepMerge<T>(target: T, ...sources: readonly unknown[]): T {
  let out: unknown = isPlainObject(target) ? { ...target } : target;
  for (const source of sources) {
    if (source === undefined) continue;
    if (!isPlainObject(out) || !isPlainObject(source)) {
      out = isPlainObject(source) ? deepMerge({}, source) : source;
      continue;
    }
    const next: Plain = { ...out };
    for (const [key, value] of Object.entries(source)) {
      if (value === undefined) continue;
      const current = next[key];
      next[key] =
        isPlainObject(current) && isPlainObject(value) ? deepMerge(current, value) : value;
    }
    out = next;
  }
  return out as T;
}

export class ScenarioDefinitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScenarioDefinitionError';
  }
}

function formatIssues(id: string, error: { issues: { path: PropertyKey[]; message: string }[] }) {
  const lines = error.issues.map(
    (issue) => `  • ${issue.path.map(String).join('.') || 'root'}: ${issue.message}`
  );
  return `Scenario "${id}" is invalid:\n${lines.join('\n')}`;
}

export function parseScenarioStrict(input: unknown): Scenario {
  const parsed = ScenarioSchema.safeParse(input);
  if (!parsed.success) {
    const id = isPlainObject(input) && typeof input.id === 'string' ? input.id : '(no id)';
    throw new ScenarioDefinitionError(formatIssues(id, parsed.error));
  }
  return parsed.data;
}

/**
 * Layers fragments over a base (later wins) and validates the result:
 * `composeScenario(PRESETS['first-week'], { id: 'rep-week', actor: { role: 'member' } })`.
 */
export function composeScenario(
  base: ScenarioFragment,
  ...fragments: readonly ScenarioFragment[]
): Scenario {
  return parseScenarioStrict(deepMerge({}, base, ...fragments));
}

/**
 * Resolves `extends` for a prototype's scenarios. A parent is looked up among
 * the prototype's OTHER scenarios first, then the presets. Cycles, unknown
 * parents and duplicate ids fail loudly with the offending ids.
 */
export function resolveScenarios(
  inputs: readonly (ScenarioDefinition | ScenarioFragment)[],
  presets: Readonly<Record<string, ScenarioFragment>> = {}
): Scenario[] {
  const own = new Map<string, ScenarioFragment>();
  for (const input of inputs) {
    const id = input.id;
    if (typeof id !== 'string' || id.length === 0) {
      throw new ScenarioDefinitionError('Every scenario needs a string "id".');
    }
    if (own.has(id)) throw new ScenarioDefinitionError(`Duplicate scenario id "${id}".`);
    own.set(id, input);
  }

  // Stack entries are namespaced (`own:x`, `preset:x`) because a scenario may
  // legitimately extend the preset that shares its id.
  const flatten = (
    input: ScenarioFragment,
    stack: string[],
    fromPresets: boolean
  ): ScenarioFragment => {
    const parentId = input.extends;
    if (!parentId) return input;
    const self = input.id ?? '(anonymous)';
    const ownParent = !fromPresets && parentId !== self ? own.get(parentId) : undefined;
    const parent = ownParent ?? presets[parentId];
    if (!parent) {
      throw new ScenarioDefinitionError(
        `Scenario "${self}" extends unknown scenario or preset "${parentId}".`
      );
    }
    const key = `${ownParent ? 'own' : 'preset'}:${parentId}`;
    if (stack.includes(key)) {
      const path = [...stack, key].map((entry) => entry.slice(entry.indexOf(':') + 1));
      throw new ScenarioDefinitionError(`Scenario "extends" cycle: ${path.join(' → ')}.`);
    }
    const resolvedParent = flatten(parent, [...stack, key], !ownParent);
    const { extends: _ignored, ...parentFields } = resolvedParent;
    return deepMerge({}, parentFields, input);
  };

  return inputs.map((input) =>
    parseScenarioStrict(flatten(input, [`own:${input.id as string}`], false))
  );
}
