import { BlockIdSchema } from '@protoyard/blocks';
import { hashString, type PrototypeRuntime, parseInput, ValidationError } from '@protoyard/core';
import { z } from 'zod';
import { DOC_CAPABILITIES } from './doc-capabilities.ts';
import { checkDocDocumentLimits } from './limits.ts';
import { type DocDocument, safeParseDocDocument } from './schema.ts';

/**
 * Saved doc edits (PLAN_008 decision D3): the edited body of a doc, one row
 * per doc and world, so an edit applied in the `@texuli/pages` editor
 * survives a reload. The kind runtime declares the store (`docEdits`);
 * writes go through these services like form responses: `session.assert` →
 * validation → `environment.run` → `db.transaction`.
 *
 * - **What is stored.** The edited doc's `blocks`, the result of
 *   `texuliDocumentToDoc`. Everything else (id, title, print and TOC
 *   settings) always comes from the doc itself. Storing the doc body rather
 *   than the Texuli document keeps Protoyard blocks exact across several
 *   edit sessions: the Texuli document only names host blocks by their
 *   position in the doc it was opened from.
 * - **Per doc and world.** The row key is the document id (the storage
 *   namespace, one per world) plus the doc's id. A world reset or scenario
 *   load clears the table with the rest of the world.
 * - **Tied to its base.** Each row records a fingerprint of the doc it was
 *   edited from. When the blueprint changes, the old edits no longer apply
 *   and `load` reports them as `stale` instead of guessing.
 * - **Untrusted on load.** A stored row is re-validated every time: the row
 *   shape, then the doc it makes through `DocDocumentSchema` and the doc
 *   limits, like a doc loaded from a file or a link. Anything that fails is
 *   reported as `invalid` and never painted.
 * - **Simulated policy.** Saving and resetting need `DOC_CAPABILITIES.edit`
 *   (viewers cannot); reading needs nothing, like reading the doc itself.
 */

/** Ordinary, non-reserved IndexedDB table for saved doc edits. */
export const DOC_EDITS_TABLE = 'docEdits' as const;
/** Primary key and indexes of the `docEdits` store. */
export const DOC_EDITS_STORE_STRING = 'key, documentId, docId, updatedAt' as const;

const DocumentIdSchema = z.string().min(1).max(120);

const DocEditRowSchema = z.strictObject({
  key: z.string().min(1).max(260),
  documentId: DocumentIdSchema,
  docId: BlockIdSchema,
  /** `docFingerprint` of the doc the edits started from. */
  baseHash: z.string().regex(/^[0-9a-f]{8}$/),
  /** The edited doc's blocks (validated with the doc they make, never on their own). */
  blocks: z.array(z.unknown()),
  updatedAt: z.string().datetime({ offset: true }),
  personaId: z.string().min(1).max(80).optional(),
});
export type DocEditRow = z.infer<typeof DocEditRowSchema>;

/** What `load` found for a doc. */
export type DocEditsState =
  | { status: 'none' }
  | {
      status: 'saved';
      /** The doc body with the saved edits applied. */
      doc: DocDocument;
      updatedAt: string;
      personaId?: string;
    }
  /** Edits made on an earlier version of this doc: not applied. */
  | { status: 'stale'; updatedAt: string }
  /** A stored row that is not a valid saved edit: not applied. */
  | { status: 'invalid'; issues: string[] };

/** A successful save: the doc as it now reads. */
export interface SavedDocEdits {
  doc: DocDocument;
  updatedAt: string;
}

export interface DocEditServices {
  /** The saved edits of `base` in this world (re-validated). */
  load(base: DocDocument): Promise<DocEditsState>;
  /** Validates and saves the edited body of `base` (its blocks), as the active persona. */
  save(base: DocDocument, edited: unknown): Promise<SavedDocEdits>;
  /** Removes the saved edits of `base`; true when there were some. */
  reset(base: DocDocument): Promise<boolean>;
}

export interface CreateDocEditServicesOptions {
  /** The document id rows are scoped to (default: the runtime's storage namespace). */
  documentId?: string;
}

interface DocEditTable {
  get(key: string): Promise<unknown>;
  put(row: DocEditRow): Promise<unknown>;
  delete(key: string): Promise<unknown>;
}

interface DocEditDatabase {
  table(name: string): DocEditTable;
  transaction<T>(mode: 'r' | 'rw', tables: readonly string[], fn: () => Promise<T>): Promise<T>;
}

/** A stable fingerprint of a doc body (FNV-1a over its JSON, 8 hex digits). */
export function docFingerprint(doc: DocDocument): string {
  return hashString(JSON.stringify(doc)).toString(16).padStart(8, '0');
}

/** The row key for a doc in a document scope. */
export function docEditKey(documentId: string, docId: string): string {
  return `${documentId}::${docId}`;
}

/** The doc `blocks` make on `base`, validated like an untrusted doc. */
function checkEdited(
  blocks: unknown,
  base: DocDocument
): { ok: true; doc: DocDocument } | { ok: false; issues: string[] } {
  const candidate = { ...base, blocks };
  const limits = checkDocDocumentLimits(candidate);
  if (!limits.ok) return { ok: false, issues: limits.issues.slice(0, 5).map((i) => i.message) };
  const parsed = safeParseDocDocument(candidate);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues
        .slice(0, 5)
        .map((issue) => `${issue.path.join('.')} ${issue.message}`.trim()),
    };
  }
  return { ok: true, doc: parsed.data };
}

function editedId(edited: unknown): unknown {
  return edited !== null && typeof edited === 'object'
    ? (edited as { id?: unknown }).id
    : undefined;
}

function editedBlocks(edited: unknown): unknown {
  return edited !== null && typeof edited === 'object' && !Array.isArray(edited)
    ? (edited as { blocks?: unknown }).blocks
    : undefined;
}

export function createDocEditServices(
  runtime: PrototypeRuntime,
  options: CreateDocEditServicesOptions = {}
): DocEditServices {
  const documentId = parseInput(
    DocumentIdSchema,
    options.documentId ?? runtime.manifest.storage.namespace
  );
  const db = runtime.db as DocEditDatabase;
  const keyOf = (base: DocDocument) => docEditKey(documentId, parseInput(BlockIdSchema, base.id));

  return {
    async load(base) {
      const key = keyOf(base);
      const stored = await db.transaction('r', [DOC_EDITS_TABLE], () =>
        db.table(DOC_EDITS_TABLE).get(key)
      );
      if (stored === undefined) return { status: 'none' };
      const row = DocEditRowSchema.safeParse(stored);
      if (!row.success || row.data.key !== key || row.data.docId !== base.id) {
        return { status: 'invalid', issues: ['The saved edits are not a valid saved edit row.'] };
      }
      if (row.data.baseHash !== docFingerprint(base)) {
        return { status: 'stale', updatedAt: row.data.updatedAt };
      }
      const checked = checkEdited(row.data.blocks, base);
      if (!checked.ok) return { status: 'invalid', issues: checked.issues };
      return {
        status: 'saved',
        doc: checked.doc,
        updatedAt: row.data.updatedAt,
        ...(row.data.personaId ? { personaId: row.data.personaId } : {}),
      };
    },

    async save(base, edited) {
      runtime.session.assert(DOC_CAPABILITIES.edit);
      const key = keyOf(base);
      if (editedId(edited) !== base.id) {
        throw new ValidationError({ document: 'These edits belong to another doc.' });
      }
      const checked = checkEdited(editedBlocks(edited), base);
      if (!checked.ok) {
        throw new ValidationError({ document: checked.issues.join(' ') || 'Invalid document.' });
      }
      const principal = runtime.session.principal?.() ?? null;
      const updatedAt = runtime.clock.now().toISOString();
      const row = parseInput(DocEditRowSchema, {
        key,
        documentId,
        docId: base.id,
        baseHash: docFingerprint(base),
        blocks: checked.doc.blocks,
        updatedAt,
        ...(principal?.persona?.id ? { personaId: principal.persona.id } : {}),
      });
      await runtime.environment.run('docs.saveEdits', () =>
        db.transaction('rw', [DOC_EDITS_TABLE], () => db.table(DOC_EDITS_TABLE).put(row))
      );
      return { doc: checked.doc, updatedAt };
    },

    async reset(base) {
      runtime.session.assert(DOC_CAPABILITIES.edit);
      const key = keyOf(base);
      return runtime.environment.run('docs.resetEdits', () =>
        db.transaction('rw', [DOC_EDITS_TABLE], async () => {
          const table = db.table(DOC_EDITS_TABLE);
          const existed = (await table.get(key)) !== undefined;
          if (existed) await table.delete(key);
          return existed;
        })
      );
    },
  };
}
