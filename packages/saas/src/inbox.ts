import {
  createRuntimeId,
  type PrototypeRuntime,
  parseInput,
  SimulatedServiceError,
} from '@protoyard/core';
import { z } from 'zod';
import {
  HashHrefSchema,
  INBOX_KINDS,
  type SaasInboxMessage,
  SaasInboxMessageSchema,
} from './schema.ts';

/**
 * Simulated email / notification inbox (ADR-018).
 *
 * Messages are plain text plus an optional in-app action (`#/…` only — never
 * HTML, never off-origin links). Delivery is a real Dexie write through
 * `environment.run`, so offline / failure modes write nothing.
 *
 * Simulation only: nothing here sends real email.
 */

/** Dexie-shaped surface every prototype database exposes for kit tables. */
export interface SaasInboxDatabase {
  transaction: <T>(mode: 'r' | 'rw', table: unknown, scope: () => Promise<T> | T) => Promise<T>;
  rows: <T>(name: string) => {
    add: (row: T) => Promise<unknown>;
    get: (id: string) => Promise<T | undefined>;
    update: (id: string, changes: Partial<T>) => Promise<number>;
    toArray: () => Promise<T[]>;
    where: (index: string) => {
      equals: (value: string) => {
        toArray: () => Promise<T[]>;
      };
    };
  };
}

export const DeliverInboxMessageSchema = z.object({
  recipient: z.email(),
  personaId: z.string().min(1).nullable().optional(),
  kind: z.enum(INBOX_KINDS),
  subject: z.string().trim().min(1).max(200),
  /** Plain text only — UIs must render as text, never `{@html}`. */
  body: z.string().max(20_000),
  action: z
    .object({
      label: z.string().trim().min(1).max(80),
      href: HashHrefSchema,
    })
    .nullable()
    .optional(),
});
export type DeliverInboxMessageInput = z.input<typeof DeliverInboxMessageSchema>;

export interface InboxListOptions {
  /** Filter by mailbox address (signed-out visitors use this). */
  recipient?: string;
  /** Filter by owning persona when the visitor is signed in. */
  personaId?: string;
  kind?: (typeof INBOX_KINDS)[number];
  /** When false (default), archived messages are hidden. */
  includeArchived?: boolean;
  /** When true, only messages with `readAt === null`. */
  unreadOnly?: boolean;
}

export interface InboxService {
  /**
   * Validate, stamp, and persist a message under `environment.run('inbox.deliver')`.
   * Use this for standalone sends. Offline / simulated failures write nothing.
   */
  deliver(input: DeliverInboxMessageInput): Promise<SaasInboxMessage>;
  /**
   * Validate and write a message **inside the caller's open Dexie transaction**.
   * Does not call `environment.run` — the outer service owns latency/offline.
   * Auth / billing flows use this so token + inbox rows commit together.
   */
  write(input: DeliverInboxMessageInput): Promise<SaasInboxMessage>;
  /** liveQuery-friendly read: stable options → newest first. */
  list(options?: InboxListOptions): Promise<SaasInboxMessage[]>;
  get(id: string): Promise<SaasInboxMessage | undefined>;
  markRead(id: string): Promise<SaasInboxMessage>;
  archive(id: string): Promise<SaasInboxMessage>;
}

function asDb(runtime: PrototypeRuntime): SaasInboxDatabase {
  const db = runtime.db as SaasInboxDatabase | null | undefined;
  if (!db || typeof db.rows !== 'function' || typeof db.transaction !== 'function') {
    throw new Error(
      'createInbox(runtime) needs a prototype database with rows() and transaction().'
    );
  }
  return db;
}

function compareNewestFirst(a: SaasInboxMessage, b: SaasInboxMessage): number {
  const byAt = b.at.localeCompare(a.at);
  if (byAt !== 0) return byAt;
  return b.id.localeCompare(a.id);
}

function buildMessage(input: DeliverInboxMessageInput, at: string): SaasInboxMessage {
  const data = parseInput(DeliverInboxMessageSchema, input);
  return SaasInboxMessageSchema.parse({
    id: createRuntimeId('inbox'),
    recipient: data.recipient,
    personaId: data.personaId ?? null,
    kind: data.kind,
    subject: data.subject,
    body: data.body,
    action: data.action ?? null,
    at,
    readAt: null,
    archivedAt: null,
  });
}

/**
 * Create the simulated inbox service bound to a prototype runtime.
 *
 * ```ts
 * const inbox = createInbox(runtime);
 * await inbox.deliver({
 *   recipient: 'ada@example.com',
 *   kind: 'magic-link',
 *   subject: 'Sign in to Acme',
 *   body: 'Use the button below to finish signing in.',
 *   action: { label: 'Sign in', href: '#/auth/magic?token=…' },
 * });
 * ```
 */
export function createInbox(runtime: PrototypeRuntime): InboxService {
  const db = asDb(runtime);
  const table = () => db.rows<SaasInboxMessage>('saas_inbox');
  const now = () => runtime.clock.now().toISOString();

  async function write(input: DeliverInboxMessageInput): Promise<SaasInboxMessage> {
    const message = buildMessage(input, now());
    await table().add(message);
    return message;
  }

  async function deliver(input: DeliverInboxMessageInput): Promise<SaasInboxMessage> {
    // Build outside the transaction so a validation error never opens a write.
    const message = buildMessage(input, now());
    await runtime.environment.run('inbox.deliver', () =>
      db.transaction('rw', table(), async () => {
        await table().add(message);
      })
    );
    return message;
  }

  async function list(options: InboxListOptions = {}): Promise<SaasInboxMessage[]> {
    const inbox = table();
    let rows: SaasInboxMessage[];
    if (options.recipient) {
      rows = await inbox.where('recipient').equals(options.recipient).toArray();
    } else if (options.personaId) {
      rows = await inbox.where('personaId').equals(options.personaId).toArray();
    } else if (options.kind) {
      rows = await inbox.where('kind').equals(options.kind).toArray();
    } else {
      rows = await inbox.toArray();
    }

    const includeArchived = options.includeArchived === true;
    const unreadOnly = options.unreadOnly === true;
    return rows
      .filter((row) => {
        if (options.recipient && row.recipient !== options.recipient) return false;
        if (options.personaId && row.personaId !== options.personaId) return false;
        if (options.kind && row.kind !== options.kind) return false;
        if (!includeArchived && row.archivedAt) return false;
        if (unreadOnly && row.readAt) return false;
        return true;
      })
      .sort(compareNewestFirst);
  }

  async function get(id: string): Promise<SaasInboxMessage | undefined> {
    return table().get(id);
  }

  async function requireMessage(id: string): Promise<SaasInboxMessage> {
    const row = await table().get(id);
    if (!row) {
      throw new ValidationErrorMessage(id);
    }
    return row;
  }

  async function markRead(id: string): Promise<SaasInboxMessage> {
    return runtime.environment.run('inbox.markRead', () =>
      db.transaction('rw', table(), async () => {
        const row = await requireMessage(id);
        if (row.readAt) return row;
        const readAt = now();
        await table().update(id, { readAt });
        return { ...row, readAt };
      })
    );
  }

  async function archive(id: string): Promise<SaasInboxMessage> {
    return runtime.environment.run('inbox.archive', () =>
      db.transaction('rw', table(), async () => {
        const row = await requireMessage(id);
        if (row.archivedAt) return row;
        const archivedAt = now();
        const readAt = row.readAt ?? archivedAt;
        await table().update(id, { archivedAt, readAt });
        return { ...row, archivedAt, readAt };
      })
    );
  }

  return { deliver, write, list, get, markRead, archive };
}

class ValidationErrorMessage extends Error {
  constructor(id: string) {
    super(`Inbox message "${id}" was not found.`);
    this.name = 'InboxMessageNotFoundError';
  }
}

/** Type guard for simulated offline / failure errors from `environment.run`. */
export function isInboxEnvironmentError(error: unknown): error is SimulatedServiceError {
  return error instanceof SimulatedServiceError;
}
