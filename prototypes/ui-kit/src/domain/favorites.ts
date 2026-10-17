import { createRuntimeId, type PrototypeRuntime } from '@protoyard/core';
import type { Favorite, UiKitDatabase } from '../database/schema.ts';
import { CAPABILITIES } from './policy.ts';

/** Favorites service: assert → validate → environment.run → write. */
export function createFavoriteServices(runtime: PrototypeRuntime<UiKitDatabase>) {
  const { db, session, environment, clock } = runtime;
  const personaId = () => {
    const id = session.principal()?.persona.id;
    if (!id) throw new Error('No active persona.');
    return id;
  };

  return {
    /** Stars or unstars an entry for the active persona. Returns the new state. */
    async toggle(entryId: string): Promise<boolean> {
      session.assert(CAPABILITIES.manage);
      if (!/^[a-z0-9-]{1,64}$/.test(entryId))
        throw new Error(`Unknown catalog entry "${entryId}".`);
      const owner = personaId();
      return environment.run('favorites.toggle', async () =>
        db.transaction('rw', db.favorites, async () => {
          const existing = await db.favorites.where({ personaId: owner, entryId }).first();
          if (existing) {
            await db.favorites.delete(existing.id);
            return false;
          }
          const favorite: Favorite = {
            id: createRuntimeId('fav'),
            personaId: owner,
            entryId,
            createdAt: clock.now().toISOString(),
          };
          await db.favorites.add(favorite);
          return true;
        })
      );
    },

    async clear(): Promise<number> {
      session.assert(CAPABILITIES.manage);
      const owner = personaId();
      return environment.run('favorites.clear', () =>
        db.favorites.where('personaId').equals(owner).delete()
      );
    },
  };
}

export type FavoriteServices = ReturnType<typeof createFavoriteServices>;
