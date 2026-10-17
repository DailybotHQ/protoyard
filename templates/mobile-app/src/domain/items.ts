import { createRuntimeId, type PrototypeRuntime } from '@protoyard/core';
import { type AppDatabase, ITEM_STATUSES, type Item, type ItemStatus } from '../database/schema.ts';
import { CAPABILITIES } from './policy.ts';

/**
 * Domain services: the ONLY way screens change data. Each mutation
 *   1. checks the simulated policy (`session.assert`) — enforced even if the UI is bypassed,
 *   2. validates input,
 *   3. runs through the simulated environment (latency / offline / failures),
 *   4. writes with Dexie.
 * To add a service, follow the same four steps.
 */

export interface ItemInput {
  title: string;
  notes: string;
  status: ItemStatus;
}

/** `issues` per field lets forms show errors inline (`runService` leaves it to you). */
export class ItemValidationError extends Error {
  readonly issues: Partial<Record<keyof ItemInput, string>>;
  constructor(issues: Partial<Record<keyof ItemInput, string>>) {
    super(Object.values(issues)[0] ?? 'Invalid item');
    this.name = 'ItemValidationError';
    this.issues = issues;
  }
}

export function validateItem(input: ItemInput): ItemInput {
  const title = input.title.trim();
  const notes = input.notes.trim();
  const issues: Partial<Record<keyof ItemInput, string>> = {};
  if (title.length === 0) issues.title = 'Give the item a title.';
  else if (title.length > 80) issues.title = 'Keep the title under 80 characters.';
  if (notes.length > 2000) issues.notes = 'Notes are limited to 2000 characters.';
  if (!ITEM_STATUSES.includes(input.status)) issues.status = 'Choose a status.';
  if (Object.keys(issues).length > 0) throw new ItemValidationError(issues);
  return { title, notes, status: input.status };
}

export function createItemServices(runtime: PrototypeRuntime<AppDatabase>) {
  const { db, session, environment, clock } = runtime;
  const now = () => clock.now().toISOString();
  const actorId = () => session.principal()?.persona.id ?? 'unknown';

  return {
    async create(input: ItemInput): Promise<Item> {
      session.assert(CAPABILITIES.create);
      const data = validateItem(input);
      return environment.run('items.create', async () => {
        const at = now();
        const item: Item = {
          id: createRuntimeId('item'),
          ...data,
          ownerId: actorId(),
          createdAt: at,
          updatedAt: at,
        };
        await db.items.add(item);
        return item;
      });
    },

    async update(id: string, input: ItemInput): Promise<void> {
      session.assert(CAPABILITIES.update);
      const data = validateItem(input);
      await environment.run('items.update', async () => {
        const changed = await db.items.update(id, { ...data, updatedAt: now() });
        if (changed === 0) throw new Error('This item no longer exists.');
      });
    },

    async setStatus(id: string, status: ItemStatus): Promise<void> {
      session.assert(CAPABILITIES.update);
      await environment.run('items.update', () =>
        db.items.update(id, { status, updatedAt: now() })
      );
    },

    async remove(id: string): Promise<void> {
      session.assert(CAPABILITIES.delete);
      await environment.run('items.delete', () => db.items.delete(id));
    },
  };
}

export type ItemServices = ReturnType<typeof createItemServices>;

const STATUS_ORDER: Record<ItemStatus, number> = { doing: 0, todo: 1, done: 2 };

/** In progress first, then to do, then done; most recently updated first within each. */
export function sortItems(items: readonly Item[]): Item[] {
  return [...items].sort(
    (a, b) =>
      STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.updatedAt.localeCompare(a.updatedAt)
  );
}
