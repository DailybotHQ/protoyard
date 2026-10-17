import { getRuntime } from '@protoyard/renderer-svelte';
import type { BlankDatabase } from '../database/schema.ts';
import { createNoteServices, type NoteServices } from '../domain/notes.ts';

let cached: NoteServices | undefined;

/** Services bound to the mounted runtime (one runtime per prototype document). */
export function notesService(): NoteServices {
  cached ??= createNoteServices(getRuntime<BlankDatabase>());
  return cached;
}

export function db(): BlankDatabase {
  return getRuntime<BlankDatabase>().db;
}
