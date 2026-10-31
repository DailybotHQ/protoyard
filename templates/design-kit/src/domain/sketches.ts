import { createRuntimeId, type PrototypeRuntime } from '@protoyard/core';
import { createCanvas, validateCanvas } from '@protoyard/views-ui/canvas';
import type { DesignKitDatabase, Sketch } from '../database/schema.ts';
import type { SketchCanvas } from '../scenarios/sketches.ts';
import { CAPABILITIES } from './policy.ts';

/**
 * Screen sketch writes. This module loads the canvas model, so only the lazy
 * Sketches section imports it: the catalog never pays for the canvas.
 */
export function createSketchServices(runtime: PrototypeRuntime<DesignKitDatabase>) {
  const { db, session, environment, clock } = runtime;
  const actor = () => {
    const personaId = session.principal()?.persona.id;
    if (!personaId) throw new Error('No active persona.');
    return personaId;
  };
  return {
    async create(input: { title: string }): Promise<Sketch> {
      session.assert(CAPABILITIES.sketch);
      const title = input.title.trim();
      if (title.length === 0) throw new Error('Give the sketch a title.');
      if (title.length > 80) throw new Error('Keep the title under 80 characters.');
      const sketch: Sketch = {
        id: createRuntimeId('sketch'),
        title,
        canvas: createCanvas({ title }) as SketchCanvas,
        updatedBy: actor(),
        updatedAt: clock.now().toISOString(),
      };
      await environment.run('sketch.create', () =>
        db.transaction('rw', db.sketches, () => db.sketches.add(sketch))
      );
      return sketch;
    },

    /** Saves an edited canvas (the editor calls this after every change). */
    async save(id: string, canvas: unknown): Promise<void> {
      session.assert(CAPABILITIES.sketch);
      // Untrusted: an imported file or a snapshot may carry anything.
      const checked = validateCanvas(canvas);
      if (!checked.ok) {
        throw new Error(
          `This canvas could not be saved: ${checked.issues[0]?.message ?? 'it is not valid'}.`
        );
      }
      const updatedBy = actor();
      await environment.run('sketch.save', () =>
        db.transaction('rw', db.sketches, async () => {
          const current = await db.sketches.get(id);
          if (!current) throw new Error('This sketch no longer exists.');
          // `put` of the whole row: Dexie's update() key paths recurse on the canvas type.
          await db.sketches.put({
            ...current,
            canvas: checked.canvas as SketchCanvas,
            updatedBy,
            updatedAt: clock.now().toISOString(),
          });
        })
      );
    },
  };
}

export type SketchServices = ReturnType<typeof createSketchServices>;
