import type { BlueprintEntity, BlueprintField, FieldKind } from './schema.ts';
import { type EntityInput, fieldLabel, inputProperty } from './validation.ts';

/**
 * Blueprint fields → a `@texuli/forms` schema (plain data, no Texuli import
 * at runtime). `@protoyard/crud` paints entity forms with Texuli's
 * `SchemaForm` from this mapping; the entity services stay the source of
 * truth for validation (session.assert → zod → environment.run →
 * db.transaction), so the schema only carries the rules that agree with the
 * service: required, length and number bounds, whole-number and cent steps,
 * and the tag count.
 *
 * Kinds Texuli has no control for (a paged relation picker, date and time in
 * one value, map points, the face library, uploads) are *hosted*: the host
 * paints them with its own controls next to the Texuli form and merges their
 * values into the same service input.
 */

/** The `@texuli/forms` field types this mapping emits. */
export type EntityFormFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'email'
  | 'date'
  | 'select'
  | 'checkbox'
  | 'tags';

/** One choice of a `select` field (`@texuli/forms` `FormOption`). */
export interface EntityFormOption {
  readonly value: string;
  readonly label: string;
}

/**
 * One field of the emitted schema: the subset of `@texuli/forms` `FormField`
 * this mapping uses (structurally assignable to it).
 */
export interface EntityFormField {
  readonly name: string;
  readonly type: EntityFormFieldType;
  readonly label: string;
  readonly description?: string;
  readonly placeholder?: string;
  readonly required?: boolean;
  readonly options?: readonly EntityFormOption[];
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly maxItems?: number;
  readonly rows?: number;
  /** Conditions; this mapping only emits a constant `enable` (a read-only form). */
  readonly when?: { readonly enable: { readonly op: 'bool'; readonly value: boolean } };
}

/** A one-page `@texuli/forms` `FormSchema` (structurally assignable to it). */
export interface EntityFormSchema {
  readonly title: string;
  readonly submitLabel?: string;
  readonly fields: readonly EntityFormField[];
}

/** Field kinds the host paints itself (no matching `@texuli/forms` control). */
export const HOSTED_FORM_KINDS: ReadonlySet<FieldKind> = new Set<FieldKind>([
  'relation',
  'datetime',
  'geo',
  'avatar',
  'file',
]);

/**
 * The option value that clears an optional persona field. A persona whose id
 * equals it would collide, so the field is then hosted instead.
 */
export const UNASSIGNED_OPTION = '~unassigned';

/** A `when` whose `enable` is never true. */
const READ_ONLY = { enable: { op: 'bool', value: false } } as const;

/** `@texuli/forms` field-name rule and the names it refuses (`FORM_NAME`, `FORM_RESERVED_NAMES`). */
const TEXULI_NAME = /^[a-z][A-Za-z0-9_]{0,63}$/;
const RESERVED_NAMES = new Set(
  Object.getOwnPropertyNames(Object.prototype).filter((name) => TEXULI_NAME.test(name))
);
/** `@texuli/forms` `FORM_LIMITS.options`. */
const MAX_OPTIONS = 200;
/** `@texuli/forms` `FORM_LIMITS.valueLength`. */
const MAX_TEXT = 10_000;

export interface EntityFormSchemaOptions {
  /** Create or edit (the default title and submit label follow it). Default `create`. */
  mode?: 'create' | 'edit';
  /** Form title (Texuli forms always have one). Default `New <entity>` / `Edit <entity>`. */
  title?: string;
  submitLabel?: string;
  /**
   * Paint every field disabled (`when.enable` is never true). Disabled
   * fields are neither validated nor submitted by Texuli.
   */
  readOnly?: boolean;
  /**
   * The people a persona field can pick. Without them persona fields are
   * hosted (the host paints its own picker).
   */
  personaOptions?: readonly EntityFormOption[];
}

export interface EntityFormModel {
  /** The schema to pass to `validateFormSchema` from `@texuli/forms`. */
  readonly schema: EntityFormSchema;
  /** Fields Texuli paints, in blueprint order (schema field name = `inputProperty`). */
  readonly painted: readonly BlueprintField[];
  /** Fields the host paints, in blueprint order. */
  readonly hosted: readonly BlueprintField[];
  /**
   * Starting form values of the painted fields: the row's values (an edited
   * record, or a create prefill), then the field defaults on create.
   */
  toFormValues(row: Readonly<Record<string, unknown>> | null | undefined): Record<string, unknown>;
  /** Submitted form values of the painted fields → entity service input (keyed by `inputProperty`). */
  fromFormValues(values: Readonly<Record<string, unknown>>): EntityInput;
}

/** `support-ticket` → `support ticket`. */
function entityNoun(entity: BlueprintEntity): string {
  return entity.name.replace(/-/g, ' ');
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) : text;
}

function personaOptionsFor(
  field: BlueprintField,
  options: readonly EntityFormOption[]
): EntityFormOption[] | null {
  const list = field.required
    ? [...options]
    : [{ value: UNASSIGNED_OPTION, label: 'Unassigned' }, ...options];
  const seen = new Set<string>();
  for (const option of list) {
    if (!option.value || seen.has(option.value)) return null;
    seen.add(option.value);
  }
  return list.length > 0 && list.length <= MAX_OPTIONS ? list : null;
}

/** The Texuli field for a blueprint field, or `null` when the host paints it. */
function paintField(
  field: BlueprintField,
  personaOptions: readonly EntityFormOption[] | undefined
): EntityFormField | null {
  if (HOSTED_FORM_KINDS.has(field.kind)) return null;
  const name = inputProperty(field);
  if (!TEXULI_NAME.test(name) || RESERVED_NAMES.has(name)) return null;
  const label = fieldLabel(field);
  const base = {
    name,
    label,
    ...(field.description ? { description: field.description } : {}),
    ...(field.required ? { required: true } : {}),
  };
  switch (field.kind) {
    case 'text':
      return {
        ...base,
        type: 'text',
        ...(field.minLength ? { minLength: field.minLength } : {}),
        maxLength: Math.min(field.maxLength, MAX_TEXT),
      };
    case 'longText':
      return {
        ...base,
        type: 'textarea',
        rows: 4,
        ...(field.minLength ? { minLength: field.minLength } : {}),
        maxLength: Math.min(field.maxLength, MAX_TEXT),
      };
    case 'json':
      // The service parses the text and reports "must be valid JSON" inline.
      return { ...base, type: 'textarea', rows: 6 };
    case 'number':
      return {
        ...base,
        type: 'number',
        ...(field.min !== undefined ? { min: field.min } : {}),
        ...(field.max !== undefined ? { max: field.max } : {}),
      };
    case 'integer':
      return {
        ...base,
        type: 'number',
        step: 1,
        ...(field.min !== undefined ? { min: field.min } : {}),
        ...(field.max !== undefined ? { max: field.max } : {}),
      };
    case 'money':
      // Shown in major units; stored as integer cents (see `fromFormValues`).
      return {
        ...base,
        type: 'number',
        step: 0.01,
        placeholder: '0.00',
        ...(field.min !== undefined ? { min: field.min / 100 } : {}),
        ...(field.max !== undefined ? { max: field.max / 100 } : {}),
      };
    case 'boolean': {
      // A required checkbox means "must be checked" in Texuli; a blueprint
      // boolean is required to have a value, which a checkbox always has.
      const { required: _required, ...rest } = base as typeof base & { required?: boolean };
      return { ...rest, type: 'checkbox' };
    }
    case 'date':
      return { ...base, type: 'date' };
    case 'enum': {
      if (field.values.length > MAX_OPTIONS) return null;
      return {
        ...base,
        type: 'select',
        placeholder: `Select ${label.toLowerCase()}`,
        options: field.values.map((value) => ({ value, label: field.labels?.[value] ?? value })),
      };
    }
    case 'email':
      return { ...base, type: 'email' };
    case 'url':
      // Texuli's `url` type insists on https://; the service accepts http and https.
      return { ...base, type: 'text', placeholder: 'https://' };
    case 'phone':
      return { ...base, type: 'text' };
    case 'tags':
      return { ...base, type: 'tags', maxItems: field.maxItems };
    case 'persona': {
      const options = personaOptions ? personaOptionsFor(field, personaOptions) : null;
      if (!options) return null;
      return {
        ...base,
        type: 'select',
        placeholder: `Select ${label.toLowerCase()}`,
        options,
      };
    }
    default:
      return null;
  }
}

/** A stored value → the value its Texuli control holds. */
function toFormValue(field: BlueprintField, value: unknown): unknown {
  switch (field.kind) {
    case 'money':
      return typeof value === 'number' && Number.isFinite(value) ? value / 100 : null;
    case 'number':
    case 'integer':
      return typeof value === 'number' && Number.isFinite(value) ? value : null;
    case 'boolean':
      return value === true;
    case 'date':
      return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)
        ? value.slice(0, 10)
        : null;
    case 'enum':
      return typeof value === 'string' && field.values.includes(value) ? value : null;
    case 'persona':
      return typeof value === 'string' && value ? value : field.required ? null : UNASSIGNED_OPTION;
    case 'tags':
      return Array.isArray(value)
        ? value.filter((tag): tag is string => typeof tag === 'string')
        : [];
    case 'json':
      if (value === null || value === undefined) return '';
      return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    default:
      return typeof value === 'string' ? value : value == null ? '' : String(value);
  }
}

/** A submitted Texuli value → the entity service input value. */
function fromFormValue(field: BlueprintField, value: unknown): unknown {
  switch (field.kind) {
    case 'money':
      return typeof value === 'number' && Number.isFinite(value) ? Math.round(value * 100) : null;
    case 'persona':
      return typeof value === 'string' && value !== UNASSIGNED_OPTION ? value : null;
    case 'json':
      return typeof value === 'string' && value.trim() !== '' ? value : null;
    case 'enum':
    case 'date':
      return typeof value === 'string' && value !== '' ? value : null;
    default:
      return value === undefined ? null : value;
  }
}

/**
 * Map an entity to a `@texuli/forms` schema plus the value converters for
 * the fields Texuli paints. Pure and deterministic.
 */
export function entityFormModel(
  entity: BlueprintEntity,
  options: EntityFormSchemaOptions = {}
): EntityFormModel {
  const mode = options.mode ?? 'create';
  const fields: EntityFormField[] = [];
  const painted: BlueprintField[] = [];
  const hosted: BlueprintField[] = [];
  for (const field of entity.fields) {
    const mapped = paintField(field, options.personaOptions);
    if (mapped) {
      fields.push(options.readOnly ? { ...mapped, when: READ_ONLY } : mapped);
      painted.push(field);
    } else hosted.push(field);
  }
  const title = truncate(
    options.title ?? `${mode === 'create' ? 'New' : 'Edit'} ${entityNoun(entity)}`,
    200
  );
  const schema: EntityFormSchema = {
    title,
    ...(options.submitLabel ? { submitLabel: truncate(options.submitLabel, 200) } : {}),
    fields,
  };

  return {
    schema,
    painted,
    hosted,
    toFormValues(row) {
      const values: Record<string, unknown> = {};
      for (const field of painted) {
        const key = inputProperty(field);
        if (row && key in row) values[key] = toFormValue(field, row[key]);
        else if (mode === 'create' && 'default' in field && field.default !== undefined) {
          values[key] = toFormValue(field, field.default);
        } else values[key] = toFormValue(field, null);
      }
      return values;
    },
    fromFormValues(values) {
      const input: EntityInput = {};
      for (const field of painted) {
        const key = inputProperty(field);
        if (!Object.hasOwn(values, key)) continue;
        input[key] = fromFormValue(field, values[key]);
      }
      return input;
    },
  };
}
