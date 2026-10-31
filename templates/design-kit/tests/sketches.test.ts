import {
  PermissionDeniedError,
  type PrototypeRuntime,
  SimulatedServiceError,
} from '@protoyard/core';
import { createPrototypeRuntime } from '@protoyard/runtime';
import { createGenerateContext, PRESETS, resolveScenarios } from '@protoyard/scenarios';
import { validateCanvas } from '@protoyard/views-ui/canvas';
import { afterEach, describe, expect, it } from 'vitest';
import type { DesignKitDatabase } from '../src/database/schema.ts';
import { createSketchServices } from '../src/domain/sketches.ts';
import { definition } from '../src/prototype.ts';
import { generateSettingsSketch } from '../src/scenarios/sketches.ts';

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
  close = undefined;
});

async function boot(scenario = 'default') {
  const runtime = await createPrototypeRuntime(definition, {
    link: { scenario },
    sleep: async () => {},
  });
  close = () => runtime.destroy();
  await runtime.scenarios.ensureSeeded();
  const typed = runtime as unknown as PrototypeRuntime<DesignKitDatabase>;
  return { runtime: typed, services: createSketchServices(typed) };
}

describe('design-kit screen sketches', () => {
  it('seeds a valid, deterministic settings wireframe with review notes', () => {
    const [scenario] = resolveScenarios(definition.scenarios, PRESETS);
    if (!scenario) throw new Error('no scenario');
    const sketch = generateSettingsSketch(createGenerateContext(scenario));
    expect(generateSettingsSketch(createGenerateContext(scenario))).toEqual(sketch);
    const checked = validateCanvas(sketch);
    expect(checked.ok, JSON.stringify(checked.issues[0])).toBe(true);
    const notes = sketch.shapes.filter((shape) => shape.type === 'sticky');
    expect(notes).toHaveLength(3);
    // Every note points at a part of the wireframe.
    expect(sketch.connectors.map((link) => link.from.shape)).toEqual(notes.map((n) => n.id));
    const other = generateSettingsSketch(createGenerateContext({ ...scenario, seed: 7 }));
    expect(other.shapes.map((s) => ('text' in s ? s.text : ''))).not.toEqual(
      sketch.shapes.map((s) => ('text' in s ? s.text : ''))
    );
  });

  it('creates and saves sketches through the service, refusing invalid canvases', async () => {
    const { runtime, services } = await boot();
    const [seeded] = await runtime.db.sketches.toArray();
    expect(seeded?.title).toBe('Settings screen');

    const created = await services.create({ title: '  Checkout screen ' });
    expect(created).toMatchObject({ title: 'Checkout screen', updatedBy: 'user_0001' });
    expect(validateCanvas(created.canvas).ok).toBe(true);
    await expect(services.create({ title: ' ' })).rejects.toThrow('Give the sketch a title.');

    const moved = structuredClone(seeded?.canvas);
    if (!moved) throw new Error('no canvas');
    const desktop = moved.shapes[0];
    if (desktop?.type !== 'frame') throw new Error('no frame');
    const header = desktop.children[0];
    if (!header) throw new Error('no header');
    header.x += 24;
    await services.save(seeded?.id ?? '', moved);
    const saved = await runtime.db.sketches.get(seeded?.id ?? '');
    const savedFrame = saved?.canvas.shapes[0];
    expect(savedFrame?.type === 'frame' ? savedFrame.children[0]?.x : undefined).toBe(64);

    const invalid = { ...moved, shapes: [{ ...header, id: 'bad', type: 'script' }] };
    await expect(services.save(seeded?.id ?? '', invalid)).rejects.toThrow(
      'This canvas could not be saved'
    );
    await expect(services.save('missing', moved)).rejects.toThrow('no longer exists');
    expect((await runtime.db.sketches.get(seeded?.id ?? ''))?.canvas).toEqual(saved?.canvas);
  });

  it('keeps sketches read-only for a viewer and writes nothing offline', async () => {
    const viewer = await boot('reviewer');
    const [seeded] = await viewer.runtime.db.sketches.toArray();
    await expect(viewer.services.create({ title: 'Mine' })).rejects.toBeInstanceOf(
      PermissionDeniedError
    );
    await expect(viewer.services.save(seeded?.id ?? '', seeded?.canvas)).rejects.toBeInstanceOf(
      PermissionDeniedError
    );
    await close?.();
    close = undefined;

    const { runtime, services } = await boot();
    const before = await runtime.db.sketches.count();
    await runtime.overrides.set({ environment: { network: 'offline' } });
    await expect(services.create({ title: 'Offline' })).rejects.toBeInstanceOf(
      SimulatedServiceError
    );
    expect(await runtime.db.sketches.count()).toBe(before);
  });
});
