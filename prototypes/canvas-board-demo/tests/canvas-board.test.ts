import { PermissionDeniedError, SimulatedServiceError } from '@protoyard/core';
import { createPrototypeRuntime } from '@protoyard/runtime';
import { afterEach, describe, expect, it } from 'vitest';
import { expectBootableWorld } from '../../../tests/support/smoke.ts';
import type { CanvasBoardDatabase } from '../src/database/schema.ts';
import { BoardValidationError, createBoardServices } from '../src/domain/boards.ts';
import { definition } from '../src/prototype.ts';

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

  it('generates deterministic worlds and boots the default scenario', async () => {
    await expectBootableWorld(definition);
  });

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
});
