import { type Block, type FormBlock, FormBlockSchema } from '@protoyard/blocks';
import {
  BlockActionError,
  type BlockStateByType,
  type BlockStateHost,
  isReducibleBlock,
  parseStateKey,
  type ReducibleBlock,
  reduceBlockState,
  restoreBlockState,
  stateKey,
} from '@protoyard/blocks/interactive';
import { type PrototypeRuntime, ValidationError } from '@protoyard/core';
import { createFormServices, type FormResponse as PageFormResponse } from '@protoyard/pages';
import { z } from 'zod';
import { type AnyContentBlueprint, KIND_CAPABILITIES } from './runtime.ts';

/**
 * Services of a content-kind prototype (deck, page, doc): the persistent
 * `BlockStateHost` that interactive blocks render from, and form responses.
 * Every write follows the service contract: resolve the block from the
 * document (never trust the caller's copy) → `session.assert` → zod (the
 * block reducers validate actions; responses validate against the form's
 * fields) → `environment.run` → `db.transaction`. Components never write
 * tables.
 */

interface Table {
  get(key: string): Promise<Record<string, unknown> | undefined>;
  put(row: Record<string, unknown>): Promise<unknown>;
  toArray(): Promise<Record<string, unknown>[]>;
}
interface Db {
  table(name: string): Table;
  transaction<T>(mode: 'rw', tables: string[], fn: () => Promise<T>): Promise<T>;
}

/** Bounds on how far the document walk goes (documents are already bounded by the loader). */
const MAX_WALK_NODES = 20_000;

/**
 * Finds a block by id anywhere in a document body (slides, sections, columns,
 * tabs, reveal panels…). Interactive blocks always carry an id, and the
 * document is the one the runtime was defined from, so a caller can never
 * substitute its own block definition.
 */
export function findDocumentBlock(doc: AnyContentBlueprint, blockId: string): Block | null {
  const stack: unknown[] = [(doc as unknown as Record<string, unknown>)[doc.kind]];
  let seen = 0;
  while (stack.length > 0 && seen < MAX_WALK_NODES) {
    const node = stack.pop();
    seen += 1;
    if (Array.isArray(node)) {
      for (const item of node) stack.push(item);
      continue;
    }
    if (node === null || typeof node !== 'object') continue;
    const record = node as Record<string, unknown>;
    if (typeof record.type === 'string' && record.id === blockId) return record as unknown as Block;
    for (const key of Object.keys(record)) stack.push(record[key]);
  }
  return null;
}

/**
 * One stored form submission — canonical `@protoyard/pages` FormResponse.
 * `createdAt` is the submission time; `personaId` / `documentId` when present.
 */
export type FormResponse = PageFormResponse;

/** A form block's fields as a strict zod schema for one submission. */
export function formResponseSchema(form: FormBlock): z.ZodType<FormResponse['values']> {
  const shape: Record<string, z.ZodType> = {};
  for (const field of form.fields) {
    let schema: z.ZodType;
    switch (field.type) {
      case 'number': {
        let n = z.number().finite();
        if (field.min !== undefined) n = n.min(field.min);
        if (field.max !== undefined) n = n.max(field.max);
        schema = n;
        break;
      }
      case 'boolean':
        schema = z.boolean();
        break;
      case 'enum':
        schema = z.enum(
          (field.options ?? []).map((option) => option.value) as [string, ...string[]]
        );
        break;
      case 'tags':
        schema = z
          .array(z.string().trim().min(1).max(64))
          .max(field.maxTags ?? 20)
          .refine((tags) => new Set(tags).size === tags.length, 'Tags must be unique');
        break;
      default: {
        let text = z
          .string()
          .trim()
          .max(field.maxLength ?? (field.type === 'longText' ? 4_000 : 400));
        if (field.required) text = text.min(1, `${field.label} is required`);
        if (field.type === 'email') schema = text.pipe(z.email().or(z.literal('')));
        else if (field.type === 'url')
          schema = text.pipe(z.url({ protocol: /^https?$/ }).or(z.literal('')));
        else schema = text;
      }
    }
    shape[field.name] = field.required ? schema : schema.optional();
  }
  return z.strictObject(shape) as unknown as z.ZodType<FormResponse['values']>;
}

/** A refused form submission: the values do not fit the form, or the form does not exist. */
export class FormResponseError extends Error {
  readonly formId: string;
  /** The first message per field name; `''` holds form-level issues such as unknown fields. */
  readonly issues: Record<string, string>;

  constructor(formId: string, message: string, issues: Record<string, string> = {}) {
    super(message);
    this.name = 'FormResponseError';
    this.formId = formId;
    this.issues = issues;
  }
}

export interface KindServicesOptions {
  /** The document id in state keys (default: the runtime's storage namespace). */
  documentId?: string;
}

export interface KindServices {
  readonly documentId: string;
  /** The persistent host interactive blocks render from (`read` is a cache of the table). */
  readonly blockStates: BlockStateHost & {
    /** Loads every stored state for this document into the cache and notifies listeners. */
    refresh(): Promise<void>;
  };
  readonly responses: {
    /** Stores one submission for a form block, as the active persona. */
    submit(formId: string, values: unknown): Promise<FormResponse>;
    /** Presenters see every response; everyone else sees their own. */
    list(formId?: string): Promise<FormResponse[]>;
  };
  /** Stops following scenario loads. */
  destroy(): void;
}

function collectFormBlocks(doc: AnyContentBlueprint): FormBlock[] {
  const forms: FormBlock[] = [];
  const seen = new Set<string>();
  const stack: unknown[] = [(doc as unknown as Record<string, unknown>)[doc.kind]];
  let n = 0;
  while (stack.length > 0 && n < MAX_WALK_NODES) {
    const node = stack.pop();
    n += 1;
    if (Array.isArray(node)) {
      for (const item of node) stack.push(item);
      continue;
    }
    if (node === null || typeof node !== 'object') continue;
    const record = node as Record<string, unknown>;
    if (record.type === 'form') {
      const parsed = FormBlockSchema.safeParse(record);
      if (parsed.success && parsed.data.id && !seen.has(parsed.data.id)) {
        seen.add(parsed.data.id);
        forms.push(parsed.data);
      }
    }
    for (const key of Object.keys(record)) stack.push(record[key]);
  }
  return forms;
}

/** The kind services for a runtime defined by `defineKindRuntime(doc, …)`. */
export async function createKindServices(
  runtime: PrototypeRuntime,
  doc: AnyContentBlueprint,
  options: KindServicesOptions = {}
): Promise<KindServices> {
  const { session, environment } = runtime;
  const db = runtime.db as Db;
  const documentId = options.documentId ?? runtime.manifest.storage.namespace;
  stateKey(documentId, 'probe'); // validates the document id once
  const cache = new Map<string, unknown>();
  const listeners = new Map<string, Set<(state: unknown) => void>>();

  const notify = (key: string, state: unknown) => {
    for (const listener of [...(listeners.get(key) ?? [])]) {
      try {
        listener(state);
      } catch {
        // A subscriber's failure is its own; the stored state stands.
      }
    }
  };

  const refresh = async () => {
    const rows = await db.table('blockStates').toArray();
    const before = new Set(cache.keys());
    cache.clear();
    for (const row of rows) {
      if (row.documentId === documentId && typeof row.key === 'string')
        cache.set(row.key, row.state);
    }
    for (const key of new Set([...before, ...cache.keys()])) notify(key, cache.get(key));
  };

  const actingPersona = () => {
    const principal = session.principal();
    if (!principal) throw new Error('No active persona. Load a scenario first.');
    return principal.persona.id;
  };

  const blockStates: KindServices['blockStates'] = {
    read: (key) => cache.get(key),
    async dispatch<B extends ReducibleBlock>(key: string, _block: B, action: unknown) {
      const parts = parseStateKey(key);
      if (!parts || parts.documentId !== documentId) {
        throw new BlockActionError(key, 'This block does not belong to this document.');
      }
      const block = findDocumentBlock(doc, parts.blockId);
      if (!block || !isReducibleBlock(block)) {
        throw new BlockActionError(
          key,
          `No interactive block "${parts.blockId}" in this document.`
        );
      }
      session.assert(KIND_CAPABILITIES.interact, block);
      // Poll and quiz answers are per viewer: the viewer is the active persona, never the caller's value.
      const viewerAction =
        (block.type === 'poll' || block.type === 'quiz') &&
        action !== null &&
        typeof action === 'object'
          ? { ...(action as Record<string, unknown>), viewer: actingPersona() }
          : action;
      const state = await environment.run('blocks.dispatch', () =>
        db.transaction('rw', ['blockStates'], async () => {
          const stored = await db.table('blockStates').get(key);
          const current = restoreBlockState(block, stored?.state);
          const result = reduceBlockState(block, current, viewerAction);
          if (!result.ok) throw new BlockActionError(key, result.error);
          await db.table('blockStates').put({
            key,
            documentId,
            blockId: parts.blockId,
            state: result.state,
            updatedAt: runtime.clock.now().toISOString(),
          });
          return result.state as BlockStateByType[B['type']];
        })
      );
      // Only a committed write reaches the cache and the subscribers.
      cache.set(key, state);
      notify(key, state);
      return state;
    },
    subscribe(key, listener) {
      let set = listeners.get(key);
      if (!set) {
        set = new Set();
        listeners.set(key, set);
      }
      set.add(listener);
      return () => {
        set.delete(listener);
      };
    },
    refresh,
  };

  const formBlocks = collectFormBlocks(doc);
  const pageForms = createFormServices(runtime, formBlocks, { documentId });
  const responses: KindServices['responses'] = {
    async submit(formId, values) {
      // createFormServices asserts form:submit (KIND_CAPABILITIES.respond).
      try {
        return await pageForms.submit(formId, values);
      } catch (error: unknown) {
        if (error instanceof FormResponseError) throw error;
        if (error instanceof ValidationError) {
          throw new FormResponseError(formId, error.message || 'Check the highlighted fields.', {
            ...error.issues,
          });
        }
        const message = error instanceof Error ? error.message : 'Form submission failed.';
        if (/No form|Permission denied/i.test(message)) {
          throw new FormResponseError(formId, message);
        }
        throw error;
      }
    },
    async list(formId) {
      if (formId !== undefined) return pageForms.list(formId);
      const rows: FormResponse[] = [];
      for (const form of formBlocks) {
        if (!form.id) continue;
        rows.push(...(await pageForms.list(form.id)));
      }
      return rows.sort((a, b) =>
        a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id.localeCompare(b.id)
      );
    },
  };

  await refresh();
  // Scenario loads, resets and snapshot restores replace the tables: reload the cache.
  const offScenario = runtime.scenarios.subscribe(() => {
    void refresh().catch(() => undefined);
  });

  return { documentId, blockStates, responses, destroy: offScenario };
}
