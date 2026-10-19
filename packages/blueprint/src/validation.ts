import { z } from 'zod';
import type { BlueprintEntity, BlueprintField } from './schema.ts';
import { relationProperty } from './storage.ts';

/**
 * Create and update input schemas derived from an entity's fields, for the
 * zod step of every entity service (use them with `parseInput` from
 * `@protoyard/core`, which keys errors by field so forms show them inline).
 *
 * Inputs are keyed by row property: relation, persona and file fields use
 * `customerId` / `relatedIds` (see `relationProperty`), everything else its
 * name. Form strings are coerced: numbers, money (`'12.34'` → 1234 cents;
 * plain numbers are already cents), booleans (`'on'`, `'true'`, `'1'`),
 * comma-separated tags and JSON text. Blank optional values become `null`
 * (or the field default on create); blank required values fail with
 * "<Label> is required". Unknown keys are dropped.
 */

export type EntityInput = Record<string, unknown>;

export interface EntityInputSchemas {
  /** Required fields must be present and non-blank; absent optional fields get their default or `null`. */
  create: z.ZodType<EntityInput, unknown>;
  /** Partial: only keys present in the input are validated and returned. */
  update: z.ZodType<EntityInput, unknown>;
}

type Check = { ok: true; value: unknown } | { ok: false; message: string };

const ok = (value: unknown): Check => ({ ok: true, value });
const fail = (message: string): Check => ({ ok: false, message });

/** `dueOn` → `Due on`, unless the field has a `label`. */
export function fieldLabel(field: Pick<BlueprintField, 'name' | 'label'>): string {
  if (field.label) return field.label;
  const words = field.name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Row property that holds a field's value in inputs and rows. */
export function inputProperty(field: BlueprintField): string {
  return relationProperty(field) ?? field.name;
}

const isBlank = (value: unknown) =>
  value === undefined ||
  value === null ||
  (typeof value === 'string' && value.trim() === '') ||
  (Array.isArray(value) && value.length === 0);

/**
 * Major-unit money text to integer cents without floating point:
 * `'1,234.5'` → 123450, `'-$3'` → -300. Returns null for anything else.
 */
export function parseMoneyText(text: string): number | null {
  // Bound work before parsing. This is deliberately linear and avoids the
  // backtracking behavior of the former grouped-number regular expression.
  if (text.length > 128) return null;
  let source = text.trim();
  let sign = 1;
  if (source.startsWith('-')) {
    sign = -1;
    source = source.slice(1).trimStart();
  }
  if (source.length > 0 && !/[\d.,\s]/.test(source[0] as string)) {
    source = source.slice(1).trimStart();
  }
  if (!source) return null;
  const parts = source.split('.');
  if (parts.length > 2) return null;
  const whole = parts[0] as string;
  const fraction = parts[1] ?? '';
  if (!/^\d+(?:,\d{3})*$/.test(whole) || (parts.length === 2 && !/^\d{1,2}$/.test(fraction))) {
    return null;
  }
  const units = Number(whole.replace(/,/g, ''));
  const cents = units * 100 + Number(fraction.padEnd(2, '0') || '0');
  if (!Number.isSafeInteger(cents)) return null;
  return sign * cents;
}

const PHONE = /^\+?[\d\s().-]{4,32}$/;
const ID = /^\S{1,128}$/;

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && /^-?\d+(\.\d+)?(e[+-]?\d+)?$/i.test(value.trim())) {
    return Number(value.trim());
  }
  return null;
}

function bounds(label: string, value: number, min?: number, max?: number, unit = ''): Check {
  if (min !== undefined && value < min) return fail(`${label} must be at least ${min}${unit}`);
  if (max !== undefined && value > max) return fail(`${label} must be at most ${max}${unit}`);
  return ok(value);
}

function ids(label: string, value: unknown, many: boolean): Check {
  const list = many ? value : [value];
  if (!Array.isArray(list) || !list.every((id) => typeof id === 'string' && ID.test(id))) {
    return fail(`Pick ${many ? 'valid' : 'a valid'} ${label.toLowerCase()}`);
  }
  return ok(many ? [...new Set(list)] : list[0]);
}

/** Validates and coerces one non-blank value for a field. */
function checkValue(field: BlueprintField, value: unknown): Check {
  const label = fieldLabel(field);
  switch (field.kind) {
    case 'text':
    case 'longText': {
      if (typeof value !== 'string') return fail(`${label} must be text`);
      const text = field.kind === 'text' ? value.trim() : value.replace(/\s+$/, '');
      if (field.minLength !== undefined && text.length < field.minLength) {
        return fail(`${label} must have at least ${field.minLength} characters`);
      }
      if (text.length > field.maxLength) {
        return fail(`${label} must have at most ${field.maxLength} characters`);
      }
      return ok(text);
    }
    case 'number':
    case 'integer': {
      const n = toNumber(value);
      if (n === null) return fail(`${label} must be a number`);
      if (field.kind === 'integer' && !Number.isInteger(n)) {
        return fail(`${label} must be a whole number`);
      }
      return bounds(label, n, field.min, field.max);
    }
    case 'money': {
      const cents = typeof value === 'number' ? (Number.isSafeInteger(value) ? value : null) : null;
      const parsed = typeof value === 'string' ? parseMoneyText(value) : cents;
      if (parsed === null) return fail(`${label} must be an amount like 12.34`);
      const show = (c: number) => (c / 100).toFixed(2);
      if (field.min !== undefined && parsed < field.min) {
        return fail(`${label} must be at least ${show(field.min)} ${field.currency}`);
      }
      if (field.max !== undefined && parsed > field.max) {
        return fail(`${label} must be at most ${show(field.max)} ${field.currency}`);
      }
      return ok(parsed);
    }
    case 'boolean': {
      if (typeof value === 'boolean') return ok(value);
      const text = String(value).trim().toLowerCase();
      if (['true', 'on', '1', 'yes'].includes(text)) return ok(true);
      if (['false', 'off', '0', 'no'].includes(text)) return ok(false);
      return fail(`${label} must be yes or no`);
    }
    case 'date': {
      const text = typeof value === 'string' ? value.trim() : '';
      const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.test(text);
      const date = dateOnly
        ? new Date(`${text}T00:00:00.000Z`)
        : /^\d{4}-\d{2}-\d{2}T/.test(text)
          ? new Date(text)
          : null;
      if (
        !date ||
        Number.isNaN(date.getTime()) ||
        (dateOnly && date.toISOString().slice(0, 10) !== text)
      ) {
        return fail(`${label} must be a date like 2026-03-02`);
      }
      return ok(dateOnly ? text : date.toISOString());
    }
    case 'datetime': {
      const date =
        value instanceof Date
          ? value
          : typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value.trim())
            ? new Date(value.trim())
            : null;
      if (!date || Number.isNaN(date.getTime())) {
        return fail(`${label} must be a date and time`);
      }
      return ok(date.toISOString());
    }
    case 'enum': {
      const text = typeof value === 'string' ? value.trim() : '';
      if (!field.values.includes(text)) {
        const options = field.values.map((v) => field.labels?.[v] ?? v).join(', ');
        return fail(`${label} must be one of: ${options}`);
      }
      return ok(text);
    }
    case 'email': {
      const text = typeof value === 'string' ? value.trim().toLowerCase() : '';
      return z.email().safeParse(text).success ? ok(text) : fail('Enter a valid email address');
    }
    case 'url': {
      const text = typeof value === 'string' ? value.trim() : '';
      return z.url({ protocol: /^https?$/ }).safeParse(text).success
        ? ok(text)
        : fail('Enter a valid URL starting with https://');
    }
    case 'phone': {
      const text = typeof value === 'string' ? value.trim() : '';
      const digits = text.replace(/\D/g, '').length;
      return PHONE.test(text) && digits >= 4 && digits <= 20
        ? ok(text)
        : fail('Enter a valid phone number');
    }
    case 'tags': {
      const list = typeof value === 'string' ? value.split(',') : value;
      if (!Array.isArray(list) || !list.every((tag) => typeof tag === 'string')) {
        return fail(`${label} must be a list of tags`);
      }
      const tags = [...new Set(list.map((tag: string) => tag.trim()).filter(Boolean))];
      if (tags.some((tag) => tag.length > 32)) return fail('Tags must have at most 32 characters');
      if (tags.length > field.maxItems) {
        return fail(`${label} can have at most ${field.maxItems} tags`);
      }
      return ok(tags);
    }
    case 'relation':
      return ids(label, value, field.cardinality === 'many');
    case 'persona':
      return ids(label, value, false);
    case 'file':
      return ids(label, value, field.multiple);
    case 'json': {
      if (typeof value !== 'string') return ok(value);
      try {
        return ok(JSON.parse(value));
      } catch {
        return fail(`${label} must be valid JSON`);
      }
    }
  }
}

/** Value used on create when an optional field is blank or absent. */
function blankValue(field: BlueprintField): unknown {
  if ('default' in field && field.default !== undefined) return field.default;
  if (field.kind === 'boolean') return false;
  if (
    field.kind === 'tags' ||
    (field.kind === 'relation' && field.cardinality === 'many') ||
    (field.kind === 'file' && field.multiple)
  ) {
    return [];
  }
  return null;
}

function check(field: BlueprintField, value: unknown, mode: 'create' | 'update'): Check {
  if (!isBlank(value)) {
    const result = checkValue(field, value);
    if (result.ok && field.required && isBlank(result.value)) {
      return fail(`${fieldLabel(field)} is required`);
    }
    return result;
  }
  // An unchecked checkbox is `false`, never missing.
  if (field.kind === 'boolean') return ok(mode === 'create' ? blankValue(field) : false);
  const fallback = blankValue(field);
  const empty = Array.isArray(fallback) ? [] : null;
  if (field.required) {
    if (mode === 'create' && fallback !== null && !Array.isArray(fallback)) return ok(fallback);
    return fail(`${fieldLabel(field)} is required`);
  }
  return ok(mode === 'create' ? fallback : empty);
}

function build(
  entity: BlueprintEntity,
  mode: 'create' | 'update'
): z.ZodType<EntityInput, unknown> {
  const props = entity.fields.map((field) => [inputProperty(field), field] as const);
  const shape = Object.fromEntries(props.map(([prop]) => [prop, z.unknown().optional()]));
  return z.object(shape).transform((input, ctx) => {
    const output: EntityInput = {};
    for (const [prop, field] of props) {
      const value = (input as EntityInput)[prop];
      if (mode === 'update' && value === undefined) continue;
      const result = check(field, value, mode);
      if (result.ok) output[prop] = result.value;
      else ctx.issues.push({ code: 'custom', message: result.message, path: [prop], input: value });
    }
    return output;
  });
}

const cache = new WeakMap<BlueprintEntity, EntityInputSchemas>();

/** Create/update schemas for an entity, built once on first use and cached. */
export function deriveInputSchemas(entity: BlueprintEntity): EntityInputSchemas {
  let schemas = cache.get(entity);
  if (!schemas) {
    schemas = { create: build(entity, 'create'), update: build(entity, 'update') };
    cache.set(entity, schemas);
  }
  return schemas;
}
