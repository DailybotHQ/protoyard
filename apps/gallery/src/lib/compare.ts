import { DEVICE_IDS as ALL_DEVICE_IDS, type DeviceId, normalizeDeviceId } from './devices';

/**
 * "Compare scenarios": the SAME prototype URL in 2–3 frames, each with its own
 * sandboxed world (`?sandbox=<name>` → runtime DB pair
 * `protoyard.<ns>~<name>.*`), so loading a scenario in one frame never touches
 * the other frames or the prototype's default world.
 */

export const PANE_IDS = ['a', 'b', 'c'] as const;
export type PaneId = (typeof PANE_IDS)[number];

/**
 * Mirrors `SANDBOX_PATTERN` in @protoyard/core (importing core would pull zod into
 * the client bundle); tests/compare.test.ts asserts they stay identical.
 */
export const SANDBOX_PATTERN = /^[a-z0-9][a-z0-9-]{0,23}$/;

export interface CompareState {
  /** Scenario id per visible pane, in order (length 2 or 3). */
  scenarios: string[];
  device: DeviceId;
  /** Bumped by "Reset sandboxes": fresh names mean freshly seeded worlds. */
  generation: number;
}

const COMPARE_DEVICE_IDS = ALL_DEVICE_IDS.filter((id) => id !== 'custom');

/** `compare-a`, then `compare-a-1`, `compare-a-2`… after each reset. */
export function sandboxName(pane: PaneId, generation: number): string {
  const name = generation > 0 ? `compare-${pane}-${generation}` : `compare-${pane}`;
  if (!SANDBOX_PATTERN.test(name)) throw new Error(`invalid sandbox name ${name}`);
  return name;
}

/** Frame URL for one pane: the app URL plus sandbox, scenario and devtools=0. */
export function paneUrl(
  appUrl: string,
  pane: PaneId,
  scenario: string,
  generation: number
): string {
  const url = new URL(appUrl, 'http://compare.local');
  url.searchParams.set('sandbox', sandboxName(pane, generation));
  if (scenario) url.searchParams.set('scenario', scenario);
  url.searchParams.set('devtools', '0');
  return /^https?:/.test(appUrl) ? url.toString() : `${url.pathname}${url.search}${url.hash}`;
}

/** Initial scenarios: the default first, then the next distinct one. */
export function defaultScenarios(
  scenarios: readonly string[],
  defaultScenario: string | null
): string[] {
  const first =
    defaultScenario && scenarios.includes(defaultScenario) ? defaultScenario : (scenarios[0] ?? '');
  const second = scenarios.find((s) => s !== first) ?? first;
  return [first, second];
}

/** Reads `?a=&b=&c=&device=&gen=`; unknown scenarios and devices fall back to defaults. */
export function stateFromParams(
  params: URLSearchParams,
  scenarios: readonly string[],
  defaultScenario: string | null
): CompareState {
  const fallback = defaultScenarios(scenarios, defaultScenario);
  const pick = (key: PaneId, index: number) => {
    const value = params.get(key);
    return value && scenarios.includes(value) ? value : fallback[index];
  };
  const picked = [pick('a', 0) ?? '', pick('b', 1) ?? ''];
  const c = params.get('c');
  if (c && scenarios.includes(c)) picked.push(c);
  const deviceParam = params.get('device');
  const generation = Number(params.get('gen'));
  const device = normalizeDeviceId(deviceParam, 'laptop-window');
  return {
    scenarios: picked,
    device: device === 'custom' ? 'laptop-window' : device,
    generation:
      Number.isInteger(generation) && generation > 0 && generation < 10_000 ? generation : 0,
  };
}

export function paramsFromState(state: CompareState): string {
  const params = new URLSearchParams();
  state.scenarios.forEach((scenario, i) => {
    const pane = PANE_IDS[i];
    if (pane && scenario) params.set(pane, scenario);
  });
  if (state.device !== 'laptop-window') params.set('device', state.device);
  if (state.generation > 0) params.set('gen', String(state.generation));
  return `?${params.toString()}`;
}

export { COMPARE_DEVICE_IDS };
