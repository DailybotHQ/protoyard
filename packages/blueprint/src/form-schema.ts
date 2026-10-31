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
 * Kinds Texuli has no control for (a paged relation picker, map points, the
 * face library, uploads) are *hosted*: they are Texuli `custom` fields (G113)
 * whose `kind` is the blueprint kind, so the host paints them with its own
 * controls inside the same form, and Texuli labels, validates and submits
 * them with the rest.
 */

/** The `@texuli/forms` field types this mapping emits. */
export type EntityFormFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'email'
  | 'url'
  | 'date'
  | 'datetime'
  | 'select'
  | 'checkbox'
  | 'tags'
  | 'custom';

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
  /** Url fields: the schemes the service accepts. */
  readonly protocols?: readonly ('http' | 'https')[];
  /** Custom fields: the blueprint field kind the host paints. */
  readonly kind?: string;
  /** Conditions; this mapping only emits a constant `enable` (a read-only form). */
  readonly when?: { readonly enable: { readonly op: 'bool'; readonly value: boolean } };
}

/** A one-page `@texuli/forms` `FormSchema` (structurally assignable to it). */
export interface EntityFormSchema {
  readonly title: string;
  readonly submitLabel?: string;
  readonly fields: readonly EntityFormField[];
}

/**
 * Field kinds the host paints itself (no matching `@texuli/forms` control),
 * as Texuli `custom` fields. Persona fields without people to pick and enums
 * past Texuli's option cap are hosted too (see `ENTITY_FORM_CUSTOM_KINDS`).
 */
export const HOSTED_FORM_KINDS: ReadonlySet<FieldKind> = new Set<FieldKind>([
  'relation',
  'geo',
  'avatar',
  'file',
]);

/**
 * Every `kind` a hosted (`custom`) field of this mapping can carry. Pass it
 * as `validateFormSchema(schema, { kinds })` so Texuli checks them.
 */
export const ENTITY_FORM_CUSTOM_KINDS: readonly FieldKind[] = [
  ...HOSTED_FORM_KINDS,
  'persona',
  'enum',
];

/**
 * @deprecated No longer emitted. Since Texuli 0.10.0 an optional persona
 * select offers its own empty "None" choice (G118), so the mapping adds no
 * sentinel option. `fromFormValues` still reads it as unassigned.
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
   * fields are neither validated nor submitted by Texuli. A host that only
   * needs a disabled form can pass SchemaForm's own `disabled` (G116).
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
  /** Fields Texuli paints with its own controls, in blueprint order. */
  readonly painted: readonly BlueprintField[];
  /** Fields the host paints, as Texuli `custom` fields of the same form, in blueprint order. */
  readonly hosted: readonly BlueprintField[];
  /**
   * The schema field name of each field, by `inputProperty`. It is the
   * `inputProperty` itself unless Texuli refuses that name (`FORM_NAME`, an
   * `Object.prototype` member); then it is `field_<index>`.
   */
  readonly names: ReadonlyMap<string, string>;
  /** The blueprint field behind a schema field name. */
  fieldFor(name: string): BlueprintField | undefined;
  /**
   * Starting form values by schema field name: the row's values (an edited
   * record, or a create prefill), then the field defaults on create.
   */
  toFormValues(row: Readonly<Record<string, unknown>> | null | undefined): Record<string, unknown>;
  /** Submitted form values → entity service input (keyed by `inputProperty`). */
  fromFormValues(values: Readonly<Record<string, unknown>>): EntityInput;
}

/** `support-ticket` → `support ticket`. */
function entityNoun(entity: BlueprintEntity): string {
  return entity.name.replace(/-/g, ' ');
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) : text;
}

function personaOptionsFor(options: readonly EntityFormOption[]): EntityFormOption[] | null {
  const list = [...options];
  const seen = new Set<string>();
  for (const option of list) {
    if (!option.value || seen.has(option.value)) return null;
    seen.add(option.value);
  }
  return list.length > 0 && list.length <= MAX_OPTIONS ? list : null;
}

/** The schema field name of a blueprint field (its `inputProperty`, unless Texuli refuses it). */
function schemaName(field: BlueprintField, index: number): string {
  const name = inputProperty(field);
  return TEXULI_NAME.test(name) && !RESERVED_NAMES.has(name) ? name : `field_${index}`;
}

/** A hosted field: a Texuli `custom` field the host paints for its blueprint kind. */
function customField(field: BlueprintField, name: string): EntityFormField {
  return {
    name,
    type: 'custom',
    kind: field.kind,
    label: fieldLabel(field),
    ...(field.description ? { description: field.description } : {}),
    ...(field.required ? { required: true } : {}),
  };
}

/** The Texuli field for a blueprint field, or `null` when the host paints it. */
function paintField(
  field: BlueprintField,
  name: string,
  personaOptions: readonly EntityFormOption[] | undefined
): EntityFormField | null {
  if (HOSTED_FORM_KINDS.has(field.kind)) return null;
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
    case 'datetime':
      // `YYYY-MM-DDTHH:MM`, the value the service stores for a datetime field.
      return { ...base, type: 'datetime' };
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
      // The service accepts http and https (G121).
      return { ...base, type: 'url', placeholder: 'https://', protocols: ['http', 'https'] };
    case 'phone':
      return { ...base, type: 'text' };
    case 'tags':
      return { ...base, type: 'tags', maxItems: field.maxItems };
    case 'persona': {
      // An optional select offers Texuli's empty "None" choice (G118).
      const options = personaOptions ? personaOptionsFor(personaOptions) : null;
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
    case 'datetime': {
      // The UTC wall time (`YYYY-MM-DDTHH:MM`) of the stored instant, the same on every machine.
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return null;
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 16);
    }
    case 'enum':
      return typeof value === 'string' && field.values.includes(value) ? value : null;
    case 'persona':
      return typeof value === 'string' && value ? value : null;
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

/** A hosted field's starting value (any JSON its host control holds). */
function toHostedValue(field: BlueprintField, value: unknown): unknown {
  if (value !== undefined && value !== null) return value;
  return field.kind === 'boolean' ? false : field.kind === 'tags' ? [] : null;
}

/** A submitted Texuli value → the entity service input value. */
function fromFormValue(field: BlueprintField, value: unknown): unknown {
  switch (field.kind) {
    case 'money':
      return typeof value === 'number' && Number.isFinite(value) ? Math.round(value * 100) : null;
    case 'persona':
      return typeof value === 'string' && value !== '' && value !== UNASSIGNED_OPTION
        ? value
        : null;
    case 'json':
      return typeof value === 'string' && value.trim() !== '' ? value : null;
    case 'datetime':
      // Texuli edits the stored instant's UTC wall time (`toFormValue`), so it goes back as UTC.
      return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)
        ? `${value}:00.000Z`
        : typeof value === 'string' && value !== ''
          ? value
          : null;
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
  const names = new Map<string, string>();
  const byName = new Map<string, BlueprintField>();
  entity.fields.forEach((field, index) => {
    const name = schemaName(field, index);
    names.set(inputProperty(field), name);
    byName.set(name, field);
    const mapped = paintField(field, name, options.personaOptions);
    const emitted = mapped ?? customField(field, name);
    fields.push(options.readOnly ? { ...emitted, when: READ_ONLY } : emitted);
    (mapped ? painted : hosted).push(field);
  });
  const title = truncate(
    options.title ?? `${mode === 'create' ? 'New' : 'Edit'} ${entityNoun(entity)}`,
    200
  );
  const schema: EntityFormSchema = {
    title,
    ...(options.submitLabel ? { submitLabel: truncate(options.submitLabel, 200) } : {}),
    fields,
  };

  const isHosted = (field: BlueprintField) => hosted.includes(field);
  return {
    schema,
    painted,
    hosted,
    names,
    fieldFor: (name) => byName.get(name),
    toFormValues(row) {
      const values: Record<string, unknown> = {};
      for (const field of entity.fields) {
        const key = inputProperty(field);
        const name = names.get(key) ?? key;
        const convert = isHosted(field) ? toHostedValue : toFormValue;
        if (row && key in row) values[name] = convert(field, row[key]);
        else if (mode === 'create' && 'default' in field && field.default !== undefined) {
          values[name] = convert(field, field.default);
        } else values[name] = convert(field, null);
      }
      return values;
    },
    fromFormValues(values) {
      const input: EntityInput = {};
      for (const field of entity.fields) {
        const key = inputProperty(field);
        const name = names.get(key) ?? key;
        if (!Object.hasOwn(values, name)) continue;
        input[key] = isHosted(field) ? (values[name] ?? null) : fromFormValue(field, values[name]);
      }
      return input;
    },
  };
}
