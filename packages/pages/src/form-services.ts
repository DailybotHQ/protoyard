import { BlockIdSchema, type FormBlock, FormBlockSchema } from '@protoyard/blocks';
import {
  createRuntimeId,
  type PrototypeRuntime,
  parseInput,
  ValidationError,
} from '@protoyard/core';
import { z } from 'zod';
import { FORM_RESPONSES_TABLE, type FormResponse, FormResponseSchema } from './form-response.ts';
import { PAGE_LIMITS } from './limits.ts';

interface FormResponseTable {
  add?(row: FormResponse): Promise<unknown>;
  put?(row: FormResponse): Promise<unknown>;
  toArray(): Promise<unknown[]>;
  where(index: string): {
    equals(value: string): {
      toArray(): Promise<unknown[]>;
      delete(): Promise<number>;
    };
  };
}

interface FormResponseDatabase {
  table(name: string): FormResponseTable;
  transaction<T>(
    mode: 'r' | 'rw',
    tables: FormResponseTable | string | readonly string[],
    callback: () => Promise<T>
  ): Promise<T>;
}

export interface FormServices {
  /** Validates and stores one response for the named form. */
  submit(formId: string, values: unknown): Promise<FormResponse>;
  /** Returns stored rows in stable createdAt/id order. */
  list(formId: string): Promise<FormResponse[]>;
  /** Exports a form's responses as RFC 4180 CSV with formula-like cells guarded. */
  exportCsv(formId: string): Promise<string>;
  /** Deletes every response for one form and returns the number removed. */
  clear(formId: string): Promise<number>;
}

export const FORM_CAPABILITIES = Object.freeze({
  submit: 'form:submit',
  read: 'form:read',
  admin: 'form:admin',
});

const FORMULA_TRIGGER = /^(?:[\t\r]|\s*[=+\-@\uFF1D\uFF0B\uFF0D\uFF20])/;
const PLAIN_NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;

// Keep the blueprint CSV guard semantics here without importing the package that depends on pages.
function guardCsvFormula(text: string): string {
  return FORMULA_TRIGGER.test(text) && !PLAIN_NUMBER.test(text) ? `'${text}` : text;
}

function csvCell(value: unknown): string {
  let text: string;
  if (Array.isArray(value)) text = JSON.stringify(value);
  else if (value === null || value === undefined) text = '';
  else text = String(value);
  text = guardCsvFormula(text);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function formValuesSchema(form: FormBlock): z.ZodType<Record<string, unknown>> {
  const shape: Record<string, z.ZodType> = {};
  for (const field of form.fields) {
    let schema: z.ZodType;
    switch (field.type) {
      case 'number': {
        let number = z.number().finite();
        if (field.min !== undefined) number = number.min(field.min);
        if (field.max !== undefined) number = number.max(field.max);
        schema = number;
        break;
      }
      case 'boolean':
        schema = z.boolean();
        break;
      case 'enum': {
        const options = new Set((field.options ?? []).map((option) => option.value));
        schema = z
          .string()
          .refine((value) => options.has(value), 'Choose one of the listed options');
        break;
      }
      case 'tags': {
        let tags = z.array(z.string().trim().min(1).max(64));
        if (field.maxTags !== undefined) tags = tags.max(field.maxTags);
        else tags = tags.max(20);
        schema = tags.refine(
          (values) => new Set(values).size === values.length,
          'Tags must be unique'
        );
        break;
      }
      default: {
        const maxLength = field.maxLength ?? (field.type === 'longText' ? 4_000 : 400);
        let text = z.string().trim().max(maxLength);
        if (field.required) text = text.min(1, `${field.label} is required`);
        if (field.type === 'email') schema = text.pipe(z.email().or(z.literal('')));
        else if (field.type === 'url')
          schema = text.pipe(z.url({ protocol: /^https?$/ }).or(z.literal('')));
        else schema = text;
      }
    }
    shape[field.name] = field.required ? schema : schema.optional();
  }
  return z.strictObject(shape) as z.ZodType<Record<string, unknown>>;
}

function stableResponseOrder(left: FormResponse, right: FormResponse): number {
  if (left.createdAt < right.createdAt) return -1;
  if (left.createdAt > right.createdAt) return 1;
  return left.id.localeCompare(right.id);
}

function checkedFormId(formId: string, forms: ReadonlyMap<string, FormBlock>): string {
  const id = parseInput(BlockIdSchema, formId);
  if (!forms.has(id)) throw new ValidationError({ formId: `No form "${id}" is registered.` });
  return id;
}

function registeredForm(formId: string, forms: ReadonlyMap<string, FormBlock>) {
  const id = checkedFormId(formId, forms);
  const form = forms.get(id);
  if (!form) throw new ValidationError({ formId: `No form "${id}" is registered.` });
  return { id, form };
}

/**
 * Creates service-only access to a page/doc form response table. Capabilities
 * are simulated UX policy checks, not authentication or data protection.
 */
export interface CreateFormServicesOptions {
  /** Optional document scope stored on each row (kind runtime namespace). */
  documentId?: string;
}

export function createFormServices(
  runtime: PrototypeRuntime,
  inputForms: readonly FormBlock[],
  options: CreateFormServicesOptions = {}
): FormServices {
  const forms = new Map<string, FormBlock>();
  for (const input of inputForms) {
    const form = FormBlockSchema.parse(input);
    if (!form.id) throw new ValidationError({ form: 'Every response form needs an id.' });
    if (forms.has(form.id))
      throw new ValidationError({ formId: `Duplicate form id "${form.id}".` });
    forms.set(form.id, form);
  }

  const db = runtime.db as FormResponseDatabase;
  const table = db.table(FORM_RESPONSES_TABLE);

  return {
    async submit(formId, values) {
      runtime.session.assert(FORM_CAPABILITIES.submit);
      const { id, form } = registeredForm(formId, forms);
      const parsedValues = parseInput(formValuesSchema(form), values);
      const principal = runtime.session.principal?.() ?? null;
      const response = parseInput(FormResponseSchema, {
        id: createRuntimeId('response').replace(/_/g, '-'),
        formId: id,
        createdAt: runtime.clock.now().toISOString(),
        values: parsedValues,
        ...(principal?.persona?.id ? { personaId: principal.persona.id } : {}),
        ...(options.documentId ? { documentId: options.documentId } : {}),
      });

      return runtime.environment.run('forms.submit', () =>
        db.transaction('rw', [FORM_RESPONSES_TABLE], async () => {
          const current = await table.where('formId').equals(id).toArray();
          if (current.length >= PAGE_LIMITS.maxResponsesPerForm) {
            throw new ValidationError({
              form: `This form has reached its ${PAGE_LIMITS.maxResponsesPerForm} response limit.`,
            });
          }
          if (typeof table.add === 'function') await table.add(response);
          else if (typeof table.put === 'function') await table.put(response);
          else throw new Error('formResponses table cannot store rows');
          return response;
        })
      );
    },

    async list(formId) {
      runtime.session.assert(FORM_CAPABILITIES.read);
      const id = checkedFormId(formId, forms);
      const rows = await db.transaction('r', [FORM_RESPONSES_TABLE], () =>
        table.where('formId').equals(id).toArray()
      );
      return rows.map((row) => parseInput(FormResponseSchema, row)).sort(stableResponseOrder);
    },

    async exportCsv(formId) {
      runtime.session.assert(FORM_CAPABILITIES.read);
      const { id, form } = registeredForm(formId, forms);
      const rows = await db.transaction('r', [FORM_RESPONSES_TABLE], () =>
        table.where('formId').equals(id).toArray()
      );
      const responses = rows
        .map((row) => parseInput(FormResponseSchema, row))
        .sort(stableResponseOrder);
      const headers = ['Submitted at', ...form.fields.map((field) => field.label)];
      const records = responses.map((response) => [
        response.createdAt,
        ...form.fields.map((field) => response.values[field.name]),
      ]);
      return [headers, ...records].map((row) => row.map(csvCell).join(',')).join('\r\n');
    },

    async clear(formId) {
      runtime.session.assert(FORM_CAPABILITIES.admin);
      const id = checkedFormId(formId, forms);
      return runtime.environment.run('forms.clear', () =>
        db.transaction('rw', [FORM_RESPONSES_TABLE], () =>
          table.where('formId').equals(id).delete()
        )
      );
    },
  };
}
