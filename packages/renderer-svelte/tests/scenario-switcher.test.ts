import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ScenarioSwitcher from '../../ui/src/components/ScenarioSwitcher.svelte';
import {
  activePersonaId,
  activeScenarioId,
  createScenarioSwitcherActions,
  groupScenarios,
  listScenarioSwitcherItems,
  listScenarioSwitcherPersonas,
  scenarioSwitcherProps,
  toScenarioSwitcherItem,
} from '../src/scenario-switcher.ts';
import { createFakeRuntime } from './fixtures/fake-runtime.ts';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('scenario-switcher helpers', () => {
  it('maps scenarios and groups them in first-seen order', () => {
    const runtime = createFakeRuntime();
    const items = listScenarioSwitcherItems(runtime);
    expect(items.map((s) => s.id)).toEqual(['empty', 'busy']);
    expect(items.find((s) => s.id === 'busy')?.group).toBe('Lifecycle');

    const groups = groupScenarios(items);
    expect(groups.map((g) => g.name)).toEqual(['General', 'Lifecycle']);
    expect(groups[0]?.scenarios.map((s) => s.id)).toEqual(['empty']);
    expect(groups[1]?.scenarios.map((s) => s.id)).toEqual(['busy']);
  });

  it('loads a scenario and switches persona through the runtime', async () => {
    const runtime = createFakeRuntime();
    const actions = createScenarioSwitcherActions(runtime, { snapshotFirst: false });

    expect(activeScenarioId(runtime)).toBeNull();
    await actions.loadScenario('busy');
    expect(activeScenarioId(runtime)).toBe('busy');
    expect(runtime.scenarios.active()?.scenario.name).toBe('Busy');

    expect(listScenarioSwitcherPersonas(runtime)).toHaveLength(2);
    expect(activePersonaId(runtime)).toBe('user_0001');
    await actions.viewAs('user_0002');
    expect(activePersonaId(runtime)).toBe('user_0002');

    // No-op when already that persona.
    await actions.viewAs('user_0002');
    expect(activePersonaId(runtime)).toBe('user_0002');
  });

  it('scenarioSwitcherProps snapshot matches the runtime', async () => {
    const runtime = createFakeRuntime();
    await runtime.scenarios.load('empty');
    const props = scenarioSwitcherProps(runtime);
    expect(props.activeScenarioId).toBe('empty');
    expect(props.personas.map((p) => p.id)).toEqual(['user_0001', 'user_0002']);
    expect(props.groups.length).toBeGreaterThan(0);
    expect(toScenarioSwitcherItem(runtime.scenarios.list()[0]!).id).toBe('empty');
  });
});

describe('ScenarioSwitcher UI', () => {
  it('lists groups, loads a scenario, and views as a persona', async () => {
    const runtime = createFakeRuntime();
    await runtime.scenarios.load('empty');
    const actions = createScenarioSwitcherActions(runtime, { snapshotFirst: false });

    const paint = () => {
      const snap = scenarioSwitcherProps(runtime);
      return {
        scenarios: snap.scenarios,
        groups: snap.groups,
        activeScenarioId: snap.activeScenarioId,
        personas: snap.personas,
        activePersonaId: snap.activePersonaId,
        onLoadScenario: (id: string) => actions.loadScenario(id),
        onViewAs: (id: string) => actions.viewAs(id),
      };
    };

    const view = render(ScenarioSwitcher, paint());

    expect(screen.getByText('Simulated')).toBeTruthy();
    expect(screen.getByText('General')).toBeTruthy();
    expect(screen.getByText('Lifecycle')).toBeTruthy();
    expect(screen.getByText('Active now')).toBeTruthy();
    expect(document.querySelector('[data-scenario-id="empty"]')?.getAttribute('data-active')).toBe(
      'true'
    );

    const loadBusy = document.querySelector<HTMLButtonElement>('[data-scenario-load="busy"]');
    expect(loadBusy).toBeTruthy();
    await fireEvent.click(loadBusy!);
    await waitFor(() => {
      expect(runtime.scenarios.active()?.scenario.id).toBe('busy');
    });
    view.rerender(paint());
    expect(document.querySelector('[data-scenario-id="busy"]')?.getAttribute('data-active')).toBe(
      'true'
    );
    expect(screen.getByText('View as…')).toBeTruthy();

    const viewer = document.querySelector<HTMLButtonElement>(
      '[data-scenario-view-as-id="user_0002"]'
    );
    expect(viewer).toBeTruthy();
    await fireEvent.click(viewer!);
    await waitFor(() => {
      expect(runtime.session.principal()?.persona.id).toBe('user_0002');
    });
    view.rerender(paint());
    expect(
      document.querySelector('[data-scenario-view-as-id="user_0002"]')?.getAttribute('aria-pressed')
    ).toBe('true');
    expect(screen.getByRole('button', { name: /You · Victor Viewer/ })).toBeTruthy();
  });

  it('shows empty state when there are no scenarios', () => {
    render(ScenarioSwitcher, {
      scenarios: [],
      personas: [],
      activeScenarioId: null,
      activePersonaId: null,
    });
    expect(screen.getByText('No scenarios')).toBeTruthy();
  });

  it('Button loading state engages while onLoadScenario is pending', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    render(ScenarioSwitcher, {
      scenarios: [{ id: 'empty', name: 'Empty', group: 'General' }],
      activeScenarioId: null,
      personas: [],
      onLoadScenario: () => gate,
    });
    const load = screen.getByRole('button', { name: 'Load' });
    const click = fireEvent.click(load);
    await waitFor(() => {
      expect(load.getAttribute('aria-busy')).toBe('true');
    });
    release();
    await click;
    await waitFor(() => {
      expect(load.getAttribute('aria-busy')).not.toBe('true');
    });
  });
});
