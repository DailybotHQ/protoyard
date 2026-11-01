import { PermissionDeniedError, SimulatedServiceError } from '@protoyard/core';
import { createPrototypeRuntime } from '@protoyard/runtime';
import {
  createGenerateContext,
  PRESETS,
  resolveScenarios,
  validateWorld,
} from '@protoyard/scenarios';
import { validateCanvas } from '@texuli/canvas/model';
import { afterEach, describe, expect, it } from 'vitest';
import type { Board, CanvasBoardDatabase } from '../src/database/schema.ts';
import {
  BoardValidationError,
  createBoardServices,
  shapeCount,
  sortBoards,
} from '../src/domain/boards.ts';
import { definition } from '../src/prototype.ts';
import { generateCanvasBoardWorld } from '../src/scenarios/generators.ts';

// Same resolution as the runtime: `extends` against own scenarios + presets.
const resolved = resolveScenarios(definition.scenarios, PRESETS);
const scenario = (id: string) => {
  const s = resolved.find((x) => x.id === id);
  if (!s) throw new Error(id);
  return s;
};
const boardsOf = (id: string) =>
  generateCanvasBoardWorld(createGenerateContext(scenario(id))).tables.boards as Board[];

describe('canvas board generator', () => {
  it('is deterministic and referentially sound for every scenario', () => {
    for (const s of resolved) {
      const a = generateCanvasBoardWorld(createGenerateContext(s));
      const b = generateCanvasBoardWorld(createGenerateContext(s));
      expect(a).toEqual(b);
      expect(a.personas.map((p) => p.id)).toEqual(['user_0001', 'user_0002']);
      const violations = validateWorld(a, {
        ...definition.integrity,
        referenceTime: s.referenceTime,
      });
      expect(violations, s.id).toEqual([]);
      for (const board of a.tables.boards as Board[]) {
        const checked = validateCanvas(board.canvas);
        expect(checked.ok, `${s.id}/${board.title}: ${JSON.stringify(checked.issues[0])}`).toBe(
          true
        );
      }
    }
  });

  it('seeds each scenario with its boards and content level', () => {
    expect(boardsOf('empty')).toHaveLength(0);
    const active = boardsOf('active');
    expect(active.map((b) => b.title)).toEqual(['Launch plan', 'Q3 roadmap', 'Onboarding journey']);
    // Each board draws its own stream: no two boards are the same canvas.
    expect(new Set(active.map((b) => JSON.stringify(b.canvas.shapes))).size).toBe(3);
    expect(shapeCount(boardsOf('crowded')[0]?.canvas as Board['canvas'])).toBeGreaterThan(1500);
    const awkward = JSON.stringify(boardsOf('awkward')[0]?.canvas);
    expect(awkward).toContain('frame-parking');
    expect(awkward).toContain('"locked":true');
  });
});

describe('board services', () => {
  let close: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await close?.();
    close = undefined;
  });

  async function boot(link = {}) {
    const runtime = await createPrototypeRuntime(definition, { link, sleep: async () => {} });
    close = () => runtime.destroy();
    await runtime.scenarios.ensureSeeded();
    return runtime as unknown as import('@protoyard/core').PrototypeRuntime<CanvasBoardDatabase>;
  }

  it('lets the owner create, draw on, rename and delete a board — persisted in IndexedDB', async () => {
    const runtime = await boot({ scenario: 'empty' });
    const boards = createBoardServices(runtime);
    await expect(boards.create({ title: '  ' })).rejects.toBeInstanceOf(BoardValidationError);
    const board = await boards.create({ title: 'Ideas' });
    expect(board.canvas).toMatchObject({ format: 'texuli-canvas', shapes: [], connectors: [] });
    const note = { id: 'n1', type: 'sticky', x: 0, y: 0, width: 160, height: 160, text: 'Ship' };
    await boards.saveCanvas(board.id, { ...board.canvas, shapes: [note] });
    await boards.rename(board.id, { title: 'Ideas board' });
    const stored = await runtime.db.boards.get(board.id);
    expect(stored?.title).toBe('Ideas board');
    expect(stored?.canvas.meta?.title).toBe('Ideas board');
    expect(stored?.canvas.shapes).toHaveLength(1);
    await boards.remove(board.id);
    expect(await runtime.db.boards.count()).toBe(0);
  });

  it('refuses a canvas that is not valid at the untrusted tier, and stores nothing', async () => {
    const runtime = await boot({ scenario: 'active' });
    const boards = createBoardServices(runtime);
    const [board] = await runtime.db.boards.toArray();
    const before = JSON.stringify(board?.canvas);
    await expect(
      boards.saveCanvas(String(board?.id), {
        ...board?.canvas,
        shapes: [
          { id: 'x', type: 'sticky', x: 0, y: 0, width: 9, height: 9, text: 'x', color: 'url(x)' },
        ],
      })
    ).rejects.toBeInstanceOf(BoardValidationError);
    expect(JSON.stringify((await runtime.db.boards.get(String(board?.id)))?.canvas)).toBe(before);
  });

  it('blocks the viewer at service level and honours the simulated environment', async () => {
    const runtime = await boot({ scenario: 'active' });
    const boards = createBoardServices(runtime);
    const before = await runtime.db.boards.count();
    await runtime.session.switchActor('user_0002');
    await expect(boards.create({ title: 'Nope' })).rejects.toBeInstanceOf(PermissionDeniedError);
    const [board] = await runtime.db.boards.toArray();
    await expect(boards.saveCanvas(String(board?.id), board?.canvas)).rejects.toBeInstanceOf(
      PermissionDeniedError
    );
    await runtime.session.switchActor('user_0001');
    await runtime.overrides.set({ environment: { network: 'offline' } });
    await expect(boards.create({ title: 'Offline' })).rejects.toBeInstanceOf(SimulatedServiceError);
    expect(await runtime.db.boards.count()).toBe(before);
  });

  it('sorts boards by recency', () => {
    const b = (id: string, updatedAt: string) => ({ id, updatedAt }) as Board;
    expect(
      sortBoards([b('a', '2026-01-02'), b('b', '2026-01-01'), b('c', '2026-01-03')]).map(
        (x) => x.id
      )
    ).toEqual(['c', 'a', 'b']);
  });
});
