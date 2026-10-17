import { createRuntimeId, type PrototypeRuntime } from '@protoyard/core';
import type { BlankDatabase, Note } from '../database/schema.ts';
import { CAPABILITIES } from './policy.ts';

/**
 * Domain services: the ONLY way screens change data. Each mutation
 *   1. checks the simulated policy (`session.assert`) — enforced even if the UI is bypassed,
 *   2. validates input,
 *   3. runs through the simulated environment (latency / offline / failures),
 *   4. writes with Dexie.
 * To add a service, follow the same four steps.
 */

export interface NoteInput {
  title: string;
  body: string;
  pinned?: boolean;
}

export class NoteValidationError extends Error {
  readonly issues: Record<string, string>;
  constructor(issues: Record<string, string>) {
    super(Object.values(issues)[0] ?? 'Invalid note');
    this.name = 'NoteValidationError';
    this.issues = issues;
  }
}

export function validateNote(input: NoteInput): NoteInput {
  const title = input.title.trim();
  const body = input.body.trim();
  const issues: Record<string, string> = {};
  if (title.length < 1) issues.title = 'Give the note a title.';
  else if (title.length > 120) issues.title = 'Keep the title under 120 characters.';
  if (body.length > 5000) issues.body = 'Notes are limited to 5000 characters.';
  if (Object.keys(issues).length > 0) throw new NoteValidationError(issues);
  return { title, body, pinned: input.pinned ?? false };
}

export function createNoteServices(runtime: PrototypeRuntime<BlankDatabase>) {
  const { db, session, environment, clock } = runtime;
  const now = () => clock.now().toISOString();
  const actorId = () => session.principal()?.persona.id ?? 'unknown';

  return {
    async create(input: NoteInput): Promise<Note> {
      session.assert(CAPABILITIES.create);
      const data = validateNote(input);
      return environment.run('notes.create', async () => {
        const at = now();
        const note: Note = {
          id: createRuntimeId('note'),
          title: data.title,
          body: data.body,
          pinned: data.pinned ?? false,
          authorId: actorId(),
          createdAt: at,
          updatedAt: at,
        };
        await db.notes.add(note);
        return note;
      });
    },

    async update(id: string, input: NoteInput): Promise<void> {
      session.assert(CAPABILITIES.update);
      const data = validateNote(input);
      await environment.run('notes.update', async () => {
        const changed = await db.notes.update(id, { ...data, updatedAt: now() });
        if (changed === 0) throw new Error('This note no longer exists.');
      });
    },

    async togglePin(note: Note): Promise<void> {
      session.assert(CAPABILITIES.update);
      await environment.run('notes.update', () =>
        db.notes.update(note.id, { pinned: !note.pinned, updatedAt: now() })
      );
    },

    async remove(id: string): Promise<void> {
      session.assert(CAPABILITIES.delete);
      await environment.run('notes.delete', () => db.notes.delete(id));
    },
  };
}

export type NoteServices = ReturnType<typeof createNoteServices>;

/** Pinned first, then most recently updated. */
export function sortNotes(notes: readonly Note[]): Note[] {
  return [...notes].sort(
    (a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt)
  );
}
