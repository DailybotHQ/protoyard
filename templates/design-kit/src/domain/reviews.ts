import { createRuntimeId, type PrototypeRuntime } from '@protoyard/core';
import type { DesignKitDatabase, ReviewEntry } from '../database/schema.ts';
import { CAPABILITIES } from './policy.ts';

export function createReviewServices(runtime: PrototypeRuntime<DesignKitDatabase>) {
  const { db, session, environment, clock } = runtime;
  return {
    async save(input: { entryId: string; status: ReviewEntry['status']; note: string }) {
      session.assert(CAPABILITIES.review);
      if (!/^[a-z0-9-]{1,64}$/.test(input.entryId)) throw new Error('Choose a catalog entry.');
      if (!['todo', 'in-progress', 'approved'].includes(input.status))
        throw new Error('Choose a valid review status.');
      if (input.note.length > 500) throw new Error('Review notes are limited to 500 characters.');
      const personaId = session.principal()?.persona.id;
      if (!personaId) throw new Error('No active persona.');
      const now = clock.now().toISOString();
      return environment.run('review.save', async () =>
        db.transaction('rw', db.reviews, async () => {
          const existing = await db.reviews.where({ personaId, entryId: input.entryId }).first();
          const entry: ReviewEntry = {
            id: existing?.id ?? createRuntimeId('review'),
            entryId: input.entryId,
            personaId,
            status: input.status,
            note: input.note.trim(),
            updatedAt: now,
          };
          await db.reviews.put(entry);
          return entry;
        })
      );
    },
  };
}

export type ReviewServices = ReturnType<typeof createReviewServices>;
