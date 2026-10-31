// @vitest-environment node
import { parseScenario } from '@protoyard/core';
import { createGenerateContext } from '@protoyard/scenarios';
import { describe, expect, it } from 'vitest';
import { CANVAS_SEED_PROMPTS, canvasFieldsByEntity, seedCanvas } from '../src/canvas-seed.ts';
import { createBlueprintGenerator, hashBlueprint } from '../src/generator.ts';
import { parseBlueprint } from '../src/index.ts';

function blueprintWith(canvas: boolean) {
  return parseBlueprint({
    formatVersion: 1,
    name: 'Studio boards',
    entities: [
      {
        name: 'board',
        plural: 'boards',
        titleField: 'title',
        seedCount: 4,
        fields: [
          { name: 'title', kind: 'text', required: true },
          { name: 'layout', kind: 'json' },
          { name: 'extra', kind: 'json' },
        ],
      },
    ],
    roles: [{ name: 'owner', permissions: { '*': ['*'] } }],
    screens: [
      { type: 'list', entity: 'board' },
      ...(canvas ? [{ type: 'canvas', entity: 'board', field: 'layout' }] : []),
    ],
  });
}

const scenario = parseScenario({
  id: 'canvas-seed',
  name: 'Canvas seed',
  seed: 4242,
  referenceTime: '2026-06-15T12:00:00.000Z',
  density: 'normal',
  organization: { id: 'org_canvas', name: 'Canvas Org', size: 4, ageDays: 60 },
});

async function boards(canvas: boolean) {
  const { generate } = createBlueprintGenerator(blueprintWith(canvas));
  const world = await generate(createGenerateContext(scenario));
  return world.tables.boards ?? [];
}

describe('seeded canvases', () => {
  it('finds the json fields canvas screens store boards in', () => {
    expect(canvasFieldsByEntity(blueprintWith(true))).toEqual(
      new Map([['board', new Set(['layout'])]])
    );
    expect(canvasFieldsByEntity(blueprintWith(false)).size).toBe(0);
  });

  it('seeds a titled planning board in a canvas field, and keeps other json fields generic', async () => {
    const rows = await boards(true);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const layout = row.layout as ReturnType<typeof seedCanvas>;
      expect(layout).toMatchObject({ format: 'texuli-canvas', formatVersion: 1 });
      expect(layout.meta.title).toBe(String(row.title).trim() || 'Planning board');
      const frame = layout.shapes[0]!;
      expect(frame.type).toBe('frame');
      expect(frame.children).toHaveLength(3);
      for (const sticky of frame.children) {
        expect(CANVAS_SEED_PROMPTS).toContain(sticky.text);
      }
      expect(layout.connectors).toHaveLength(2);
      expect(row.extra).toEqual({ note: expect.any(String) });
    }
  });

  it('is deterministic for the same scenario', async () => {
    expect(await boards(true)).toEqual(await boards(true));
  });

  it('leaves blueprints without a canvas screen on the generic json value and hash', async () => {
    for (const row of await boards(false)) expect(row.layout).toEqual({ note: expect.any(String) });
    expect(hashBlueprint(blueprintWith(true))).not.toBe(hashBlueprint(blueprintWith(false)));
  });

  it('caps the title and falls back when the record has none', () => {
    const rng = createGenerateContext(scenario).rng.fork('title');
    expect(seedCanvas(rng, '   ').meta.title).toBe('Planning board');
    expect(seedCanvas(rng, 'x'.repeat(300)).meta.title).toHaveLength(200);
  });
});
