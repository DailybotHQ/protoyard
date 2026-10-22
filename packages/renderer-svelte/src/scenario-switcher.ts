import type { Persona, PrototypeRuntime, Scenario } from '@protoyard/core';

/**
 * In-app scenario / persona switcher glue for demos.
 *
 * Builds presentational rows for `@protoyard/ui` `ScenarioSwitcher` and
 * wraps `runtime.scenarios.load` / `runtime.session.switchActor`. The UI is
 * labelled simulated; this is not multiplayer or authentication.
 */

export interface ScenarioSwitcherScenario {
  id: string;
  name: string;
  description?: string;
  group: string;
}

export interface ScenarioSwitcherPersona {
  id: string;
  name: string;
  title?: string | null;
  email?: string | null;
}

export interface ScenarioSwitcherGroup {
  name: string;
  scenarios: ScenarioSwitcherScenario[];
}

export interface ScenarioSwitcherLoadOptions {
  /** Save a safety snapshot before replacing the world (default true). */
  snapshotFirst?: boolean;
  seed?: number;
}

/** Map a core scenario to a switcher row (stable group default: General). */
export function toScenarioSwitcherItem(scenario: Scenario): ScenarioSwitcherScenario {
  return {
    id: scenario.id,
    name: scenario.name,
    ...(scenario.description ? { description: scenario.description } : {}),
    group: scenario.group || 'General',
  };
}

/** Map a persona to a switcher chip. */
export function toScenarioSwitcherPersona(persona: Persona): ScenarioSwitcherPersona {
  return {
    id: persona.id,
    name: persona.name,
    title: persona.title ?? null,
    email: persona.email ?? null,
  };
}

/** Group scenarios by `group`, preserving first-seen group order and row order. */
export function groupScenarios(
  scenarios: readonly ScenarioSwitcherScenario[]
): ScenarioSwitcherGroup[] {
  const map = new Map<string, ScenarioSwitcherScenario[]>();
  for (const row of scenarios) {
    const list = map.get(row.group) ?? [];
    list.push(row);
    map.set(row.group, list);
  }
  return [...map.entries()].map(([name, rows]) => ({ name, scenarios: rows }));
}

export function listScenarioSwitcherItems(
  runtime: Pick<PrototypeRuntime, 'scenarios'>
): ScenarioSwitcherScenario[] {
  return runtime.scenarios.list().map(toScenarioSwitcherItem);
}

export function listScenarioSwitcherPersonas(
  runtime: Pick<PrototypeRuntime, 'session'>
): ScenarioSwitcherPersona[] {
  return runtime.session.personas().map(toScenarioSwitcherPersona);
}

export function activeScenarioId(runtime: Pick<PrototypeRuntime, 'scenarios'>): string | null {
  return runtime.scenarios.active()?.scenario.id ?? null;
}

export function activePersonaId(runtime: Pick<PrototypeRuntime, 'session'>): string | null {
  return runtime.session.principal()?.persona.id ?? null;
}

/**
 * Controllers that call the real runtime. Prototype screens pass these as
 * `onLoadScenario` / `onViewAs` so Button pending feedback wires automatically.
 */
export function createScenarioSwitcherActions(
  runtime: Pick<PrototypeRuntime, 'scenarios' | 'session'>,
  options: ScenarioSwitcherLoadOptions = {}
) {
  const snapshotFirst = options.snapshotFirst ?? true;

  return {
    async loadScenario(scenarioId: string, loadOptions: ScenarioSwitcherLoadOptions = {}) {
      await runtime.scenarios.load(scenarioId, {
        snapshotFirst: loadOptions.snapshotFirst ?? snapshotFirst,
        ...(loadOptions.seed !== undefined
          ? { seed: loadOptions.seed }
          : options.seed !== undefined
            ? { seed: options.seed }
            : {}),
      });
    },
    async viewAs(personaId: string) {
      const current = runtime.session.principal()?.persona.id;
      if (!personaId || personaId === current) return;
      await runtime.session.switchActor(personaId);
    },
  };
}

/** Snapshot props a Svelte screen can spread into `ScenarioSwitcher`. */
export function scenarioSwitcherProps(
  runtime: Pick<PrototypeRuntime, 'scenarios' | 'session'>,
  options: ScenarioSwitcherLoadOptions = {}
) {
  const actions = createScenarioSwitcherActions(runtime, options);
  const scenarios = listScenarioSwitcherItems(runtime);
  return {
    scenarios,
    groups: groupScenarios(scenarios),
    activeScenarioId: activeScenarioId(runtime),
    personas: listScenarioSwitcherPersonas(runtime),
    activePersonaId: activePersonaId(runtime),
    onLoadScenario: (id: string) => actions.loadScenario(id),
    onViewAs: (id: string) => actions.viewAs(id),
  };
}
