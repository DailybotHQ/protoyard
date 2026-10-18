import { createRuntimeId, type PrototypeRuntime, type Row } from '@protoyard/core';
import type { Blueprint, BlueprintEntity, BlueprintNotificationRule } from './schema.ts';
import { FEATURE_TABLES } from './storage.ts';

interface Collection {
  toArray(): Promise<Row[]>;
  count(): Promise<number>;
}

interface Table {
  get(id: string): Promise<Row | undefined>;
  toArray(): Promise<Row[]>;
  where(index: string): {
    equals(value: string): Collection;
    between(lower: [string, string], upper: [string, string]): Collection;
  };
  put(row: Row): Promise<unknown>;
  update(id: string, patch: Record<string, unknown>): Promise<unknown>;
}

interface Db {
  table(name: string): Table;
  transaction<T>(mode: 'rw', tables: string[], fn: () => Promise<T>): Promise<T>;
}

export interface BlueprintNotificationService {
  list(): Promise<Row[]>;
  unreadCount(): Promise<number>;
  markRead(id: string): Promise<boolean>;
  markUnread(id: string): Promise<boolean>;
  markAllRead(): Promise<number>;
}

export interface NotificationEvent {
  readonly on: 'create' | 'update';
  readonly entity: BlueprintEntity;
  readonly row: Row;
  readonly previous?: Row;
}

function personaProperty(field: string): string {
  return `${field}Id`;
}

function text(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map(text).join(', ');
  if (typeof value === 'object') return '[object]';
  return String(value);
}

function titleFor(template: string, row: Row): string {
  return template.replace(/\{([^{}]+)\}/g, (_match, field: string) => text(row[field]));
}

/** Writes rule matches into the caller's existing mutation transaction. */
export function createNotificationWriter(runtime: PrototypeRuntime, blueprint: Blueprint) {
  const db = runtime.db as Db;
  const memberships = db.table('py_memberships');
  const actorId = () => runtime.session.principal()?.persona.id;

  async function recipients(rule: BlueprintNotificationRule, entity: BlueprintEntity, row: Row) {
    const actor = actorId();
    let ids: string[] = [];
    if (rule.notify === 'owner' && entity.ownerField) {
      const id = row[personaProperty(entity.ownerField)];
      if (typeof id === 'string') ids = [id];
    } else if (rule.notify === 'assignee') {
      const id = row[personaProperty('assignee')];
      if (typeof id === 'string') ids = [id];
    } else if (rule.notify.startsWith('role:')) {
      const role = rule.notify.slice('role:'.length);
      const activeMembership = (await memberships.toArray()).find(
        (item) => item.personaId === actor
      );
      ids = (await memberships.toArray())
        .filter(
          (item) =>
            item.role === role &&
            (activeMembership?.organizationId === undefined ||
              item.organizationId === activeMembership.organizationId)
        )
        .map((item) => item.personaId)
        .filter((id): id is string => typeof id === 'string');
    }
    return [...new Set(ids)].filter((id) => id !== actor);
  }

  return async (event: NotificationEvent): Promise<number> => {
    const rules = blueprint.notifications.filter(
      (rule) => rule.entity === event.entity.name && rule.on === event.on
    );
    const assignmentRules = blueprint.notifications.filter(
      (rule) => rule.entity === event.entity.name && rule.on === 'assign'
    );
    const matchingRules = [...rules, ...assignmentRules];
    if (matchingRules.length === 0) return 0;
    let count = 0;
    const notificationTable = db.table(FEATURE_TABLES.notifications);

    for (const rule of matchingRules) {
      if (rule.on === 'assign') {
        if (!rule.field || !event.previous) continue;
        const property = personaProperty(rule.field);
        const oldValue = event.previous[property];
        const newValue = event.row[property];
        if (typeof newValue !== 'string' || newValue === oldValue) continue;
      }
      const targetIds = await recipients(rule, event.entity, event.row);
      const now = runtime.clock.now().toISOString();
      for (const personaId of targetIds) {
        await notificationTable.put({
          id: createRuntimeId('notification'),
          personaId,
          kind: `${event.entity.name}.${rule.on}`,
          title: titleFor(rule.title, event.row),
          body: '',
          createdAt: now,
          readAt: null,
        });
        count += 1;
      }
    }
    return count;
  };
}

/** Actor-scoped notification reads and updates. */
export function createNotificationService(runtime: PrototypeRuntime): BlueprintNotificationService {
  const db = runtime.db as Db;
  const table = db.table(FEATURE_TABLES.notifications);
  const { environment } = runtime;
  const actorId = () => {
    const id = runtime.session.principal()?.persona.id;
    if (!id) throw new Error('No active persona. Load a scenario first.');
    return id;
  };
  const ownRow = async (id: string) => {
    const row = await table.get(id);
    return row?.personaId === actorId() ? row : undefined;
  };

  return {
    async list() {
      return (await table.where('personaId').equals(actorId()).toArray()).sort((a, b) => {
        const byTime = String(b.createdAt).localeCompare(String(a.createdAt));
        return byTime || String(b.id).localeCompare(String(a.id));
      });
    },
    async unreadCount() {
      const personaId = actorId();
      const total = await table.where('personaId').equals(personaId).count();
      const read = await table
        .where('[personaId+readAt]')
        .between([personaId, ''], [personaId, '\uffff'])
        .count();
      return total - read;
    },
    async markRead(id) {
      const row = await ownRow(id);
      if (!row) return false;
      if (row.readAt) return true;
      await environment.run('notifications.markRead', () =>
        db.transaction('rw', [FEATURE_TABLES.notifications], async () => {
          await table.update(id, { readAt: runtime.clock.now().toISOString() });
        })
      );
      return true;
    },
    async markUnread(id) {
      const row = await ownRow(id);
      if (!row) return false;
      if (!row.readAt) return true;
      await environment.run('notifications.markUnread', () =>
        db.transaction('rw', [FEATURE_TABLES.notifications], async () => {
          await table.update(id, { readAt: null });
        })
      );
      return true;
    },
    async markAllRead() {
      const rows = await table.where('personaId').equals(actorId()).toArray();
      const unread = rows.filter((row) => row.readAt === null || row.readAt === undefined);
      await environment.run('notifications.markAllRead', () =>
        db.transaction('rw', [FEATURE_TABLES.notifications], async () => {
          const readAt = runtime.clock.now().toISOString();
          for (const row of unread) await table.update(row.id, { readAt });
        })
      );
      return unread.length;
    },
  };
}
