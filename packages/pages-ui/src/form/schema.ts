import type { FormBlock } from '@protoyard/blocks';
import {
  FORM_LIMITS,
  FORM_NAME,
  FORM_RESERVED_NAMES,
  type FormField,
  type FormSchema,
  type FormValues,
} from '@texuli/forms/model';

/**
 * A page or doc form block → a `@texuli/forms` schema, and Texuli's submitted
 * values → the response the `@protoyard/pages` service validates and stores.
 * The response service stays the source of truth (it re-validates every
 * value with zod); the schema carries the same required, length, range,
 * option and tag-count rules so most problems show before anything is sent.
 */

type BlockField = FormBlock['fields'][number];

/** The default tag cap of the response service when a field sets none. */
const DEFAULT_MAX_TAGS = 20;

/** Keys never written on a response object, whatever Texuli accepts. */
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** Field names Texuli accepts and that are safe as object keys; others are left out of the form. */
export function isFormFieldName(name: string): boolean {
  return FORM_NAME.test(name) && !FORM_RESERVED_NAMES.has(name) && !UNSAFE_KEYS.has(name);
}

const clip = (text: string, max: number) => (text.length > max ? text.slice(0, max) : text);

function mapField(field: BlockField): FormField {
  const base = {
    name: field.name,
    label: field.label,
    ...(field.help ? { description: field.help } : {}),
    ...(field.required ? { required: true } : {}),
  };
  const placeholder = field.placeholder ? { placeholder: field.placeholder } : {};
  const maxLength = field.maxLength !== undefined ? { maxLength: field.maxLength } : {};
  switch (field.type) {
    case 'longText':
      return { ...base, ...placeholder, ...maxLength, type: 'textarea', rows: 4 };
    case 'email':
      return { ...base, ...placeholder, ...maxLength, type: 'email', autocomplete: 'email' };
    case 'phone':
      return { ...base, ...placeholder, ...maxLength, type: 'text', autocomplete: 'tel' };
    case 'url':
      // Texuli's `url` type insists on https://; the response service also accepts http.
      return { ...base, ...placeholder, ...maxLength, type: 'text', autocomplete: 'url' };
    case 'number':
      return {
        ...base,
        ...placeholder,
        type: 'number',
        ...(field.min !== undefined ? { min: field.min } : {}),
        ...(field.max !== undefined ? { max: field.max } : {}),
      };
    case 'boolean':
      // Required means "must be checked", as the response service checks it.
      return { ...base, type: 'checkbox' };
    case 'enum':
      return {
        ...base,
        ...placeholder,
        type: 'select',
        options: (field.options ?? []).map(({ value, label }) => ({ value, label })),
      };
    case 'tags':
      return {
        ...base,
        ...placeholder,
        type: 'tags',
        maxItems: field.maxTags ?? DEFAULT_MAX_TAGS,
      };
    default:
      return { ...base, ...placeholder, ...maxLength, type: 'text' };
  }
}

/**
 * The schema for one form block. A block without a title gets its submit
 * label as the form's name (the host hides the heading and keeps it as the
 * accessible name).
 */
export function formBlockSchema(form: FormBlock): FormSchema {
  return {
    title: clip(form.title ?? form.submitLabel, FORM_LIMITS.label),
    ...(form.description ? { description: clip(form.description, FORM_LIMITS.description) } : {}),
    submitLabel: form.submitLabel,
    fields: form.fields.filter((field) => isFormFieldName(field.name)).map(mapField),
  };
}

/**
 * Texuli's submitted values → the response values: empty numbers and choices
 * are left out, text stays text (the service trims it), tags and booleans
 * pass through. Only the block's own field names are read.
 */
export function formBlockResponse(form: FormBlock, values: FormValues): Record<string, unknown> {
  const response: Record<string, unknown> = {};
  for (const field of form.fields) {
    const key = field.name;
    if (!isFormFieldName(key) || !Object.hasOwn(values, key)) continue;
    const value = values[key];
    if ((field.type === 'number' || field.type === 'enum') && (value === null || value === '')) {
      continue;
    }
    response[key] = value ?? '';
  }
  return response;
}

/** A service error's per-field issues (`{ issues: { field: message } }`), if it has them. */
export function responseIssues(error: unknown): Record<string, string> | undefined {
  if (error === null || typeof error !== 'object' || !('issues' in error)) return undefined;
  const issues = (error as { issues: unknown }).issues;
  if (issues === null || typeof issues !== 'object' || Array.isArray(issues)) return undefined;
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(issues)) {
    if (typeof value === 'string' && (key === 'form' || isFormFieldName(key))) result[key] = value;
  }
  return result;
}
