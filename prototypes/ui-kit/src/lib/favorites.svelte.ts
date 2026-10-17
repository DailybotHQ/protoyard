import { getRuntime, liveQuery, usePrincipal } from '@protoyard/renderer-svelte';
import type { Favorite, UiKitDatabase } from '../database/schema.ts';

/**
 * The active persona's favorites, live. Persona switches re-run the query
 * (through `deps`) without touching the stored rows.
 */
export function useFavorites() {
  const runtime = getRuntime<UiKitDatabase>();
  const principal = usePrincipal();
  const personaId = $derived(principal.current?.persona.id ?? '');
  const rows = liveQuery(
    () => runtime.db.favorites.where('personaId').equals(personaId).sortBy('createdAt'),
    { initial: [] as Favorite[], deps: () => personaId }
  );
  const ids = $derived(new Set((rows.current ?? []).map((f) => f.entryId)));
  return {
    get list() {
      return [...(rows.current ?? [])].reverse();
    },
    get loading() {
      return rows.loading;
    },
    has: (entryId: string) => ids.has(entryId),
  };
}
