import { createRuntimeId, type PrototypeRuntime } from '@protoyard/core';
import { type CanvasDocument, createCanvas, validateCanvas } from '@texuli/canvas/model';
import type { Board, CanvasBoardDatabase } from '../database/schema.ts';
import { CAPABILITIES } from './policy.ts';

/**
 * Domain services: the ONLY way screens change data. Each mutation
 *   1. checks the simulated policy (`session.assert`) — enforced even if the UI is bypassed,
 *   2. validates input (a canvas at Texuli's untrusted tier: closed shapes,
 *      palette and limits, no markup),
 *   3. runs through the simulated environment (latency / offline / failures),
 *   4. writes with Dexie.
 */

export class BoardValidationError extends Error {
  readonly issues: Record<string, string>;
  constructor(issues: Record<string, string>) {
    super(Object.values(issues)[0] ?? 'Invalid board');
    this.name = 'BoardValidationError';
    this.issues = issues;
  }
}

export function validateTitle(input: string): string {
  const title = input.trim();
  if (title.length < 1) throw new BoardValidationError({ title: 'Give the board a title.' });
  if (title.length > 80) {
    throw new BoardValidationError({ title: 'Keep the title under 80 characters.' });
  }
  return title;
}

/** A canvas from the editor, a file or a snapshot: checked as untrusted data before it is stored. */
export function checkCanvas(input: unknown): CanvasDocument {
  const checked = validateCanvas(input);
  if (!checked.ok) {
    throw new BoardValidationError({
      canvas: checked.issues[0]?.message ?? 'The canvas is not valid.',
    });
  }
  return checked.canvas;
}

export function createBoardServices(runtime: PrototypeRuntime<CanvasBoardDatabase>) {
  const { db, session, environment, clock } = runtime;
  const now = () => clock.now().toISOString();
  const actorId = () => session.principal()?.persona.id ?? 'unknown';

  return {
    async create(input: { title: string }): Promise<Board> {
      session.assert(CAPABILITIES.create);
      const title = validateTitle(input.title);
      return environment.run('boards.create', async () => {
        const at = now();
        const board: Board = {
          id: createRuntimeId('board'),
          title,
          canvas: createCanvas({ title }),
          ownerId: actorId(),
          createdAt: at,
          updatedAt: at,
        };
        await db.transaction('rw', db.boards, () => db.boards.add(board));
        return board;
      });
    },

    async rename(id: string, input: { title: string }): Promise<void> {
      session.assert(CAPABILITIES.update);
      const title = validateTitle(input.title);
      await environment.run('boards.update', () =>
        db.transaction('rw', db.boards, async () => {
          const current = await db.boards.get(id);
          if (!current) throw new Error('This board no longer exists.');
          // `put` of the whole row: Dexie's update() key paths recurse on the canvas type.
          await db.boards.put({
            ...current,
            title,
            canvas: { ...current.canvas, meta: { ...current.canvas.meta, title } },
            updatedAt: now(),
          });
        })
      );
    },

    /** Saves an edited canvas (the editor calls this after every change). */
    async saveCanvas(id: string, canvas: unknown): Promise<void> {
      session.assert(CAPABILITIES.update);
      const checked = checkCanvas(canvas);
      await environment.run('boards.update', () =>
        db.transaction('rw', db.boards, async () => {
          const current = await db.boards.get(id);
          if (!current) throw new Error('This board no longer exists.');
          await db.boards.put({ ...current, canvas: checked, updatedAt: now() });
        })
      );
    },

    async remove(id: string): Promise<void> {
      session.assert(CAPABILITIES.delete);
      await environment.run('boards.delete', () =>
        db.transaction('rw', db.boards, () => db.boards.delete(id))
      );
    },
  };
}

export type BoardServices = ReturnType<typeof createBoardServices>;

/** Most recently updated first. */
export function sortBoards(boards: readonly Board[]): Board[] {
  return [...boards].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Shapes on a board, frames' children included. */
export function shapeCount(canvas: CanvasDocument): number {
  let count = 0;
  const walk = (shapes: readonly CanvasDocument['shapes'][number][]) => {
    for (const shape of shapes) {
      count += 1;
      if ('children' in shape && Array.isArray(shape.children)) {
        walk(shape.children as CanvasDocument['shapes'][number][]);
      }
    }
  };
  walk(canvas.shapes);
  return count;
}
