import { fireEvent, screen, waitFor, within } from '@testing-library/svelte';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { flushSync } from 'svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { createPrototypeRuntime, type ProtoyardRuntime } from '../../runtime/src/index.ts';
import { createTasksDefinition } from '../../runtime/tests/fixtures/tasks-prototype.ts';
import { BUILTIN_THEMES } from '../../themes/src/index.ts';
import { type DevtoolsHandle, mountDevtools } from '../src/index.ts';

/**
 * DevTools → Look style controls on a real runtime: density presets and fine
 * tuning, radius, elevation, font and motion presets as temporary overrides,
 * "Theme" clearing one dimension, and "Clear appearance overrides".
 */

const settle = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
  flushSync();
};

let handle: DevtoolsHandle | undefined;
const runtimes: ProtoyardRuntime[] = [];
afterEach(async () => {
  await handle?.destroy();
  handle = undefined;
  for (const runtime of runtimes.splice(0)) runtime.close();
  localStorage.clear();
  document.body.replaceChildren();
});

async function openLook() {
  const runtime = await createPrototypeRuntime(
    createTasksDefinition({ namespace: 'style-controls' }),
    {
      indexedDB: new IDBFactory() as unknown as globalThis.IDBFactory,
      IDBKeyRange,
      themes: BUILTIN_THEMES,
      sleep: async () => {},
    }
  );
  await runtime.scenarios.ensureSeeded();
  runtimes.push(runtime);
  handle = mountDevtools({ runtime, themes: BUILTIN_THEMES });
  flushSync();
  await fireEvent.keyDown(window, { key: '.', ctrlKey: true });
  await settle();
  const panel = screen.getByRole('complementary', { name: 'Protoyard DevTools' });
  await fireEvent.click(within(panel).getByRole('tab', { name: 'Look' }));
  await settle();
  return { runtime, panel: within(panel) };
}

const checked = (panel: ReturnType<typeof within>, group: string) =>
  within(panel.getByRole('radiogroup', { name: group }))
    .getAllByRole('radio')
    .filter((radio) => radio.getAttribute('aria-checked') === 'true')
    .map((radio) => radio.textContent?.trim());

describe('DevTools style controls', () => {
  it('renders every dimension on the theme’s own values', async () => {
    const { panel } = await openLook();
    for (const group of ['Density preset', 'Corner radius', 'Elevation', 'Motion']) {
      expect(checked(panel, group), group).toEqual(['Theme']);
    }
    expect((panel.getByLabelText('Font pairing') as HTMLSelectElement).value).toBe('theme');
    expect(
      within(panel.getByRole('radiogroup', { name: 'Corner radius' }))
        .getAllByRole('radio')
        .map((radio) => radio.textContent?.trim())
    ).toEqual(['Theme', 'Square', 'Sharp', 'Default', 'Round', 'Pill']);
  });

  it('applies radius, elevation, font and motion as overrides and clears one with Theme', async () => {
    const { runtime, panel } = await openLook();
    const pick = async (group: string, name: string) => {
      await fireEvent.click(
        within(panel.getByRole('radiogroup', { name: group })).getByRole('radio', { name })
      );
      await settle();
    };
    await pick('Corner radius', 'Round');
    await pick('Elevation', 'Layered');
    await pick('Motion', 'Subtle');
    await fireEvent.change(panel.getByLabelText('Font pairing'), {
      target: { value: 'editorial' },
    });
    await settle();

    await waitFor(() =>
      expect(runtime.theme.appearance()).toMatchObject({
        radius: { value: 'round', source: 'override' },
        elevation: { value: 'layered', source: 'override' },
        motion: { value: 'subtle', source: 'override' },
        font: { value: 'editorial', source: 'override' },
      })
    );
    expect(checked(panel, 'Corner radius')).toEqual(['Round']);
    expect(runtime.overrides.get()).toMatchObject({ radius: 'round', elevation: 'layered' });

    await pick('Corner radius', 'Theme');
    expect(runtime.overrides.get().radius).toBeUndefined();
    expect(runtime.overrides.get().elevation).toBe('layered');
    expect(checked(panel, 'Corner radius')).toEqual(['Theme']);
  });

  it('sets density by preset or fine slider, and Theme returns to the theme’s density', async () => {
    const { runtime, panel } = await openLook();
    const presets = within(panel.getByRole('radiogroup', { name: 'Density preset' }));
    await fireEvent.click(presets.getByRole('radio', { name: 'Comfortable' }));
    await settle();
    expect(runtime.theme.appearance().density).toEqual({ value: 1.125, source: 'override' });
    expect(checked(panel, 'Density preset')).toEqual(['Comfortable']);

    await fireEvent.change(panel.getByRole('slider', { name: 'Density' }), {
      target: { value: '1.05' },
    });
    await settle();
    expect(runtime.theme.appearance().density).toEqual({ value: 1.05, source: 'override' });
    // Between presets: no preset is checked.
    expect(checked(panel, 'Density preset')).toEqual([]);

    await fireEvent.click(presets.getByRole('radio', { name: 'Theme' }));
    await settle();
    expect(runtime.overrides.get().density).toBeUndefined();
    expect(checked(panel, 'Density preset')).toEqual(['Theme']);
  });

  it('marks the controls busy while a change is applying', async () => {
    const { runtime, panel } = await openLook();
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const setOverride = runtime.theme.setOverride.bind(runtime.theme);
    runtime.theme.setOverride = async (patch) => {
      await gate;
      return setOverride(patch);
    };
    const radius = panel.getByRole('radiogroup', { name: 'Corner radius' });
    await fireEvent.click(within(radius).getByRole('radio', { name: 'Pill' }));
    await settle();
    expect(radius.getAttribute('aria-busy')).toBe('true');
    expect((panel.getByLabelText('Font pairing') as HTMLSelectElement).disabled).toBe(true);
    release();
    await waitFor(() => expect(runtime.theme.appearance().radius?.value).toBe('pill'));
    await settle();
    expect(radius.getAttribute('aria-busy')).toBeNull();
  });

  it('enables "Clear appearance overrides" for a style-only override and clears every style', async () => {
    const { runtime, panel } = await openLook();
    const clear = panel.getByRole('button', { name: 'Clear appearance overrides' });
    expect((clear as HTMLButtonElement).disabled).toBe(true);
    await fireEvent.click(
      within(panel.getByRole('radiogroup', { name: 'Elevation' })).getByRole('radio', {
        name: 'Flat',
      })
    );
    await settle();
    expect((clear as HTMLButtonElement).disabled).toBe(false);
    await fireEvent.click(clear);
    await settle();
    expect(runtime.overrides.get().elevation).toBeUndefined();
    expect((clear as HTMLButtonElement).disabled).toBe(true);
    expect(checked(panel, 'Elevation')).toEqual(['Theme']);
  });
});
