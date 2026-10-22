import { BLOCK_CONTENT_LIMITS, BlockIdSchema } from '@protoyard/blocks';
import { z } from 'zod';
import { PAGE_LIMITS } from './limits.ts';

/** Per-row limits for persisted public-form responses. */
export const FORM_RESPONSE_LIMITS = Object.freeze({
  maxValues: PAGE_LIMITS.maxFormFields,
  maxKeyLength: 32,
  maxStringLength: BLOCK_CONTENT_LIMITS.formTextLength,
  maxArrayValues: BLOCK_CONTENT_LIMITS.formTags,
  maxValuesBytes: PAGE_LIMITS.maxResponseValueBytes,
});

const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const ResponseKeySchema = z
  .string()
  .max(FORM_RESPONSE_LIMITS.maxKeyLength)
  .regex(/^[a-z][a-zA-Z0-9]{0,31}$/, 'Use a lowerCamelCase form field name');

const ResponseTextSchema = z.string().max(FORM_RESPONSE_LIMITS.maxStringLength);

export const FormResponseValueSchema = z.union([
  ResponseTextSchema,
  z.number().finite(),
  z.boolean(),
  z.array(ResponseTextSchema).max(FORM_RESPONSE_LIMITS.maxArrayValues),
]);
export type FormResponseValue = z.infer<typeof FormResponseValueSchema>;

const FormResponseValuesSchema = z
  .record(ResponseKeySchema, FormResponseValueSchema)
  .superRefine((values, ctx) => {
    if (Object.keys(values).length > FORM_RESPONSE_LIMITS.maxValues) {
      ctx.addIssue({
        code: 'custom',
        message: `A form response may contain at most ${FORM_RESPONSE_LIMITS.maxValues} values.`,
      });
    }

    const bytes = new TextEncoder().encode(JSON.stringify(values)).byteLength;
    if (bytes > FORM_RESPONSE_LIMITS.maxValuesBytes) {
      ctx.addIssue({
        code: 'custom',
        message: `Form response values exceed ${FORM_RESPONSE_LIMITS.maxValuesBytes} UTF-8 bytes.`,
      });
    }
  });

/**
 * Canonical form response row (lead contract for page/doc/kind runtimes).
 * `personaId` is set when a simulated session is active.
 */
const FormResponseRowSchema = z.strictObject({
  id: BlockIdSchema,
  formId: BlockIdSchema,
  createdAt: z.string().datetime({ offset: true }),
  values: FormResponseValuesSchema,
  /** Active simulated persona when the row was submitted (optional). */
  personaId: z.string().min(1).max(80).optional(),
  /** Document namespace when the kind runtime scopes multi-doc storage. */
  documentId: z.string().min(1).max(120).optional(),
});

function rejectUnsafeValueKeys(input: unknown, ctx: z.RefinementCtx): unknown {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return input;
  const valuesDescriptor = Object.getOwnPropertyDescriptor(input, 'values');
  if (!valuesDescriptor || !('value' in valuesDescriptor)) return input;
  const values = valuesDescriptor.value;
  if (values === null || typeof values !== 'object' || Array.isArray(values)) return input;

  for (const key of Object.keys(values)) {
    if (UNSAFE_KEYS.has(key)) {
      ctx.addIssue({
        code: 'custom',
        path: ['values', key],
        message: `Unsafe response field key: ${key}`,
      });
    }
  }
  return input;
}

/**
 * A persisted form response. Unsafe dynamic keys are rejected before Zod's
 * record parser can normalize them; values are bounded plain response data.
 */
export const FormResponseSchema = z.preprocess(rejectUnsafeValueKeys, FormResponseRowSchema);
export type FormResponse = z.infer<typeof FormResponseSchema>;

/** Ordinary, non-reserved IndexedDB feature-table name and Dexie indexes. */
export const FORM_RESPONSES_TABLE = 'formResponses' as const;
/** Indexes shared by kind runtime and page/doc feature tables. */
export const FORM_RESPONSES_STORE_STRING =
  'id, formId, createdAt, personaId, documentId, [formId+createdAt]' as const;

/** Feature-style descriptors consumed by the page/doc runtime definition. */
export const PAGE_FEATURE_TABLES = Object.freeze({
  formResponses: FORM_RESPONSES_TABLE,
});
export const PAGE_FEATURE_STORE_STRINGS = Object.freeze({
  formResponses: FORM_RESPONSES_STORE_STRING,
});
