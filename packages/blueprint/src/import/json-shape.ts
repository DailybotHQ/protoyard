import { type BlueprintEntity, type BlueprintField, parseBlueprint } from '../schema.ts';
import {
  IMPORT_MAX_BYTES,
  IMPORT_MAX_DEPTH,
  IMPORT_MAX_FIELDS,
  IMPORT_MAX_JSON_NODES,
  IMPORT_MAX_JSON_OBJECTS,
  IMPORT_MAX_SAMPLE_RECORDS,
  IMPORT_MAX_STRING_BYTES,
} from './limits.ts';

export const JSON_SHAPE_MAX_BYTES = IMPORT_MAX_BYTES;
export const JSON_SHAPE_MAX_SAMPLE_OBJECTS = IMPORT_MAX_SAMPLE_RECORDS;
export const JSON_SHAPE_MAX_DEPTH = IMPORT_MAX_DEPTH;
export const JSON_SHAPE_MAX_OBJECTS = IMPORT_MAX_JSON_OBJECTS;
export const JSON_SHAPE_MAX_FIELDS = IMPORT_MAX_FIELDS;
export const JSON_SHAPE_MAX_STRING_BYTES = IMPORT_MAX_STRING_BYTES;

export interface JsonShapeOptions {
  /** Name for the root entity; normalized to blueprint kebab-case. */
  entityName?: string;
  /** Optional human label for the root entity. */
  entityLabel?: string;
  /** Maximum UTF-8 input bytes. Overrides are clamped to the hard maximum. */
  maxBytes?: number;
  /** Maximum representative objects sampled per entity. */
  maxSampleObjects?: number;
  /** Maximum accepted nested JSON depth. */
  maxDepth?: number;
  /** Maximum object and array nodes traversed. */
  maxObjects?: number;
  /** Maximum field keys inferred per entity. */
  maxFields?: number;
  /** Maximum bytes in any one JSON string value. */
  maxStringBytes?: number;
}

export type JsonShapeErrorCode =
  | 'invalid-json'
  | 'invalid-shape'
  | 'input-too-large'
  | 'too-deep'
  | 'too-many-objects'
  | 'too-many-fields'
  | 'string-too-large'
  | 'unsafe-key'
  | 'invalid-options';

export class JsonShapeError extends Error {
  readonly code: JsonShapeErrorCode;

  constructor(code: JsonShapeErrorCode, message: string) {
    super(message);
    this.name = 'JsonShapeError';
    this.code = code;
  }
}

export interface JsonShapeRelationCandidate {
  sourceEntity: string;
  field: string;
  targetEntity: string;
  cardinality: 'many';
  reason: string;
}

export interface JsonShapeResult {
  /** Validated entity drafts; the first is the supplied object or array shape. */
  entities: BlueprintEntity[];
  /** Normalized review notes that never include sampled values. */
  notes: string[];
  /** Candidate one-to-many links inferred from arrays of objects. */
  relationCandidates: JsonShapeRelationCandidate[];
  /** Number of representative record objects used across the inferred entities. */
  objectsInspected: number;
}

interface Limits {
  maxBytes: number;
  maxSampleObjects: number;
  maxDepth: number;
  maxObjects: number;
  maxFields: number;
  maxStringBytes: number;
}

const RESERVED_FIELDS = new Set(['id', 'createdAt', 'updatedAt', 'deletedAt', 'deletedBy']);
const BIDI_FORMATTING = /[\u202a-\u202e\u2066-\u2069]/u;
const TITLE_KINDS = new Set<BlueprintField['kind']>(['text', 'integer', 'email', 'url', 'phone']);
const SEARCHABLE_KINDS = new Set<BlueprintField['kind']>(['text', 'email', 'url', 'phone']);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_PATTERN = /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/;
const URL_PATTERN = /^https?:\/\/[^\s]+$/i;

type JsonRecord = Record<string, unknown>;
type FieldKind = BlueprintField['kind'];

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function limit(value: number | undefined, fallback: number, maximum: number): number {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value) || value < 1) {
    throw new JsonShapeError(
      'invalid-options',
      'JSON shape limits must be positive finite numbers'
    );
  }
  return Math.min(Math.floor(value), maximum);
}

function limits(options: JsonShapeOptions): Limits {
  return {
    maxBytes: limit(options.maxBytes, JSON_SHAPE_MAX_BYTES, JSON_SHAPE_MAX_BYTES),
    maxSampleObjects: limit(
      options.maxSampleObjects,
      JSON_SHAPE_MAX_SAMPLE_OBJECTS,
      JSON_SHAPE_MAX_SAMPLE_OBJECTS
    ),
    maxDepth: limit(options.maxDepth, JSON_SHAPE_MAX_DEPTH, JSON_SHAPE_MAX_DEPTH),
    maxObjects: limit(options.maxObjects, JSON_SHAPE_MAX_OBJECTS, JSON_SHAPE_MAX_OBJECTS),
    maxFields: limit(options.maxFields, JSON_SHAPE_MAX_FIELDS, JSON_SHAPE_MAX_FIELDS),
    maxStringBytes: limit(
      options.maxStringBytes,
      JSON_SHAPE_MAX_STRING_BYTES,
      JSON_SHAPE_MAX_STRING_BYTES
    ),
  };
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasUnsafeKeyCharacter(value: string): boolean {
  return (
    BIDI_FORMATTING.test(value) ||
    Array.from(value).some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint < 0x20 || (codePoint >= 0x7f && codePoint <= 0x9f);
    })
  );
}

function assertTextDepth(text: string, maximum: number): void {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (const character of text) {
    if (inString) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === '{' || character === '[') {
      depth += 1;
      if (depth > maximum) {
        throw new JsonShapeError(
          'too-deep',
          `JSON shape exceeds the maximum depth of ${maximum.toLocaleString()}`
        );
      }
    } else if ((character === '}' || character === ']') && depth > 0) {
      depth -= 1;
    }
  }
}

function validateTree(root: unknown, parsedLimits: Limits): void {
  const pending: Array<{ value: unknown; depth: number }> = [{ value: root, depth: 0 }];
  let objectNodes = 0;
  let valueNodes = 0;
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) continue;
    const { value, depth } = current;
    valueNodes += 1;
    if (valueNodes > IMPORT_MAX_JSON_NODES) {
      throw new JsonShapeError(
        'too-many-objects',
        `JSON shape exceeds the ${IMPORT_MAX_JSON_NODES.toLocaleString()} value-node limit`
      );
    }
    if (Array.isArray(value) || isRecord(value)) objectNodes += 1;
    if (objectNodes > parsedLimits.maxObjects) {
      throw new JsonShapeError(
        'too-many-objects',
        `JSON shape exceeds the ${parsedLimits.maxObjects.toLocaleString()} object and array limit`
      );
    }
    if (typeof value === 'string' && byteLength(value) > parsedLimits.maxStringBytes) {
      throw new JsonShapeError(
        'string-too-large',
        `A JSON string exceeds the ${parsedLimits.maxStringBytes.toLocaleString()}-byte limit`
      );
    }
    if (!Array.isArray(value) && !isRecord(value)) continue;
    const childDepth = depth + 1;
    if (childDepth > parsedLimits.maxDepth) {
      throw new JsonShapeError(
        'too-deep',
        `JSON shape exceeds the maximum depth of ${parsedLimits.maxDepth.toLocaleString()}`
      );
    }
    if (Array.isArray(value)) {
      if (valueNodes + pending.length + value.length > IMPORT_MAX_JSON_NODES) {
        throw new JsonShapeError(
          'too-many-objects',
          `JSON shape exceeds the ${IMPORT_MAX_JSON_NODES.toLocaleString()} value-node limit`
        );
      }
      for (const child of value) pending.push({ value: child, depth: childDepth });
      continue;
    }
    const keys = Object.keys(value);
    if (keys.length > parsedLimits.maxFields) {
      throw new JsonShapeError(
        'too-many-fields',
        `A JSON object exceeds the ${parsedLimits.maxFields.toLocaleString()} field limit`
      );
    }
    for (const key of keys) {
      if (byteLength(key) > parsedLimits.maxStringBytes) {
        throw new JsonShapeError(
          'string-too-large',
          `A JSON key exceeds the ${parsedLimits.maxStringBytes.toLocaleString()}-byte limit`
        );
      }
      if (
        key === '__proto__' ||
        key === 'constructor' ||
        key === 'prototype' ||
        hasUnsafeKeyCharacter(key)
      ) {
        throw new JsonShapeError('unsafe-key', 'JSON shape contains an unsupported field name');
      }
    }
    const children = Object.values(value);
    if (valueNodes + pending.length + children.length > IMPORT_MAX_JSON_NODES) {
      throw new JsonShapeError(
        'too-many-objects',
        `JSON shape exceeds the ${IMPORT_MAX_JSON_NODES.toLocaleString()} value-node limit`
      );
    }
    for (const child of children) pending.push({ value: child, depth: childDepth });
  }
}

function words(value: string): string[] {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function fieldName(key: string, index: number, used: Set<string>): string {
  const parts = words(key);
  let name = parts
    .map((part, partIndex) => {
      const lower = part.toLowerCase();
      return partIndex === 0 ? lower : `${lower[0]?.toUpperCase() ?? ''}${lower.slice(1)}`;
    })
    .join('');
  if (!name) name = `field${index + 1}`;
  if (/^\d/.test(name)) name = `field${name}`;
  if (RESERVED_FIELDS.has(name)) name = `field${name[0]?.toUpperCase() ?? ''}${name.slice(1)}`;
  name = name.slice(0, 64);
  const base = name;
  let suffix = 2;
  while (used.has(name)) {
    const tail = String(suffix++);
    name = `${base.slice(0, 64 - tail.length)}${tail}`;
  }
  used.add(name);
  return name;
}

function entityName(value: string | undefined, fallback: string): string {
  const parts = words(value ?? fallback);
  const slug = parts.map((part) => part.toLowerCase()).join('-');
  return slug || 'imported-record';
}

function singular(value: string): string {
  if (value.endsWith('ies') && value.length > 3) return `${value.slice(0, -3)}y`;
  if (/(?:ss|us|is)$/.test(value)) return value;
  if (value.endsWith('s') && value.length > 1) return value.slice(0, -1);
  return value;
}

function label(value: string, fallback: string): string {
  const text = value.trim().replace(/\s+/g, ' ');
  return (text || fallback).slice(0, 60);
}

function uniqueEntityName(value: string, used: Set<string>): string {
  const base = entityName(singular(value), 'related-record');
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) candidate = `${base}-${suffix++}`;
  used.add(candidate);
  return candidate;
}

function isoDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

/** Checks an email-shaped value in one pass; avoid backtracking on hostile cells. */
function isEmailAddress(value: string): boolean {
  if (value.length > 254) return false;
  let at = -1;
  let domainDot = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === undefined || /\s/u.test(character)) return false;
    if (character === '@') {
      if (at !== -1) return false;
      at = index;
      continue;
    }
    if (character === '.' && at !== -1) {
      if (index === at + 1 || index === value.length - 1 || value[index - 1] === '.') return false;
      domainDot = true;
    }
  }
  return at > 0 && at < value.length - 1 && value[at - 1] !== '.' && domainDot;
}

function stringKind(key: string, values: readonly string[]): FieldKind {
  if (values.length > 0 && values.every((value) => DATE_PATTERN.test(value) && isoDate(value))) {
    return 'date';
  }
  if (
    values.length > 0 &&
    values.every((value) => DATETIME_PATTERN.test(value) && !Number.isNaN(Date.parse(value)))
  ) {
    return 'datetime';
  }
  const normalizedKey = key.toLowerCase();
  if (normalizedKey.includes('email') && values.every(isEmailAddress)) {
    return 'email';
  }
  if (
    /(?:url|uri|website|link)/.test(normalizedKey) &&
    values.every((value) => URL_PATTERN.test(value))
  ) {
    return 'url';
  }
  if (values.every((value) => value.length > 200)) return 'longText';
  return 'text';
}

function scalarKind(key: string, values: readonly unknown[]): FieldKind | undefined {
  if (values.length === 0) return undefined;
  if (values.every((value) => typeof value === 'string')) {
    return stringKind(key, values as string[]);
  }
  if (values.every((value) => typeof value === 'boolean')) return 'boolean';
  if (values.every((value) => typeof value === 'number')) {
    return values.every((value) => Number.isSafeInteger(value)) ? 'integer' : 'number';
  }
  return undefined;
}

function inferredField(
  name: string,
  fieldLabel: string,
  kind: FieldKind,
  required: boolean,
  target?: string
): Record<string, unknown> {
  const common = { name, label: fieldLabel, kind, required };
  if (kind === 'text') return { ...common, maxLength: 200 };
  if (kind === 'longText') return { ...common, maxLength: 10_000 };
  if (kind === 'tags') return { ...common, maxItems: 8 };
  if (kind === 'relation') return { ...common, to: target, cardinality: 'many' };
  return common;
}

interface InferState {
  parsedLimits: Limits;
  notes: string[];
  relationCandidates: JsonShapeRelationCandidate[];
  usedEntityNames: Set<string>;
  relatedEntities: BlueprintEntity[];
  objectsInspected: number;
}

function inferOneEntity(
  name: string,
  entityLabel: string,
  rows: readonly JsonRecord[],
  depth: number,
  state: InferState
): BlueprintEntity {
  const sampledRows = rows.slice(0, state.parsedLimits.maxSampleObjects);
  state.objectsInspected += sampledRows.length;
  if (sampledRows.length === 1) {
    state.notes.push(
      `${entityLabel}: one sample cannot establish required fields; fields remain optional.`
    );
  }
  const allKeys = [...new Set(sampledRows.flatMap((row) => Object.keys(row)))].sort((a, b) =>
    a.localeCompare(b, 'en')
  );
  if (allKeys.length > state.parsedLimits.maxFields) {
    throw new JsonShapeError(
      'too-many-fields',
      `An inferred entity exceeds the ${state.parsedLimits.maxFields.toLocaleString()} field limit`
    );
  }
  const usedFieldNames = new Set<string>();
  const fields: Record<string, unknown>[] = [];
  let firstTitle: string | undefined;
  let preferredTitle: string | undefined;
  const searchable: string[] = [];

  for (const [index, key] of allKeys.entries()) {
    if (RESERVED_FIELDS.has(key)) {
      state.notes.push(`${entityLabel}: managed field "${key}" was omitted from the draft.`);
      continue;
    }
    const nameForField = fieldName(key, index, usedFieldNames);
    const fieldLabel = label(key.replace(/([a-z0-9])([A-Z])/g, '$1 $2'), `Field ${index + 1}`);
    const normalizedKey = words(key)
      .map((part, partIndex) => {
        const lower = part.toLowerCase();
        return partIndex === 0 ? lower : `${lower[0]?.toUpperCase() ?? ''}${lower.slice(1)}`;
      })
      .join('');
    if (nameForField !== normalizedKey) {
      state.notes.push(
        `${entityLabel}.${fieldLabel}: normalized to the field name "${nameForField}".`
      );
    }
    const values = sampledRows.map((row) => row[key]);
    const presentValues = values.filter((value) => value !== undefined && value !== null);
    const required = values.length > 1 && presentValues.length === values.length;
    if (!required && presentValues.length > 0) {
      state.notes.push(
        `${entityLabel}.${fieldLabel}: absent or null in some samples; kept optional.`
      );
    }

    let kind: FieldKind;
    let target: string | undefined;
    const arrays = presentValues.filter(Array.isArray) as unknown[][];
    const records = presentValues.filter(isRecord) as JsonRecord[];
    const scalars = presentValues.filter((value) => !Array.isArray(value) && !isRecord(value));
    const nonEmptyArrays = arrays.filter((value) => value.length > 0);
    const objectArrays = nonEmptyArrays.filter((array) => array.every(isRecord));

    if (
      presentValues.length > 0 &&
      arrays.length === presentValues.length &&
      objectArrays.length > 0
    ) {
      if (objectArrays.length !== nonEmptyArrays.length) {
        kind = 'json';
        state.notes.push(`${entityLabel}.${fieldLabel}: inconsistent array shapes; kept as JSON.`);
      } else if (depth >= state.parsedLimits.maxDepth) {
        kind = 'json';
        state.notes.push(
          `${entityLabel}.${fieldLabel}: relation depth limit reached; kept as JSON.`
        );
      } else {
        target = uniqueEntityName(key, state.usedEntityNames);
        kind = 'relation';
        const nestedRows = objectArrays.flat().slice(0, state.parsedLimits.maxSampleObjects);
        const nestedLabel = label(key.replace(/([a-z0-9])([A-Z])/g, '$1 $2'), target);
        const nestedEntity = inferOneEntity(target, nestedLabel, nestedRows, depth + 1, state);
        state.relatedEntities.push(nestedEntity);
        state.relationCandidates.push({
          sourceEntity: name,
          field: nameForField,
          targetEntity: target,
          cardinality: 'many',
          reason:
            'An array of objects suggests a one-to-many relationship; review before generation.',
        });
      }
    } else if (presentValues.length > 0 && arrays.length === presentValues.length) {
      const stringsOnly = arrays.every((array) =>
        array.every((value) => typeof value === 'string')
      );
      if (stringsOnly && arrays.some((array) => array.length > 0)) {
        kind = 'tags';
      } else {
        kind = 'json';
        state.notes.push(`${entityLabel}.${fieldLabel}: array shape is ambiguous; kept as JSON.`);
      }
    } else if (records.length > 0 && records.length === presentValues.length) {
      kind = 'json';
      state.notes.push(
        `${entityLabel}.${fieldLabel}: nested objects stay in a JSON field; review whether to model a relation.`
      );
    } else if (records.length > 0 || arrays.length > 0) {
      kind = 'json';
      state.notes.push(
        `${entityLabel}.${fieldLabel}: mixed nested and scalar shapes; kept as JSON.`
      );
    } else {
      const scalarTypes = new Set(scalars.map((value) => typeof value));
      const inferred = scalarKind(key, scalars);
      if (inferred) {
        kind = inferred;
      } else if (presentValues.length === 0) {
        kind = 'text';
        state.notes.push(`${entityLabel}.${fieldLabel}: no sample value; kept as text for review.`);
      } else {
        kind = 'json';
        state.notes.push(
          `${entityLabel}.${fieldLabel}: inconsistent scalar types (${[...scalarTypes].sort().join(', ')}); kept as JSON.`
        );
      }
    }

    fields.push(inferredField(nameForField, fieldLabel, kind, required, target));
    if (TITLE_KINDS.has(kind)) {
      firstTitle ??= nameForField;
      if (/name|title|label|subject/i.test(key)) preferredTitle ??= nameForField;
    }
    if (SEARCHABLE_KINDS.has(kind)) searchable.push(nameForField);
  }

  if (!firstTitle) {
    const fallbackName = fieldName('Name', fields.length, usedFieldNames);
    fields.push({
      name: fallbackName,
      label: 'Name',
      kind: 'text',
      maxLength: 200,
      required: false,
    });
    firstTitle = fallbackName;
    preferredTitle = fallbackName;
    state.notes.push(
      `${entityLabel}: no title-compatible field; added a blank Name field for review.`
    );
  }
  const titleField = preferredTitle ?? firstTitle;
  if (!titleField) {
    throw new JsonShapeError(
      'invalid-shape',
      'JSON shape inference could not create a title field'
    );
  }

  return {
    name,
    plural: `${name}s`,
    label: entityLabel,
    fields: fields as BlueprintEntity['fields'],
    titleField,
    searchable: searchable.filter((fieldNameValue) => fieldNameValue !== titleField).slice(0, 3),
    features: { csv: false },
  } as BlueprintEntity;
}

/**
 * Infer a validated, reviewable draft from one JSON record or an array of
 * records. Only names and shape metadata are returned; source values never
 * enter entities, relation candidates, notes, or errors.
 */
export function inferJsonShape(text: string, options: JsonShapeOptions = {}): JsonShapeResult {
  const parsedLimits = limits(options);
  if (byteLength(text) > parsedLimits.maxBytes) {
    throw new JsonShapeError(
      'input-too-large',
      `JSON shape input exceeds the ${parsedLimits.maxBytes.toLocaleString()}-byte limit`
    );
  }
  assertTextDepth(text, parsedLimits.maxDepth);

  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new JsonShapeError('invalid-json', 'JSON shape input is not valid JSON');
  }
  validateTree(parsed, parsedLimits);

  const notes: string[] = [];
  let rootRows: JsonRecord[];
  if (isRecord(parsed)) {
    rootRows = [parsed];
  } else if (Array.isArray(parsed)) {
    if (parsed.length === 0) {
      throw new JsonShapeError('invalid-shape', 'JSON shape input needs at least one object');
    }
    const nonNullRows = parsed.filter((row) => row !== null);
    if (!nonNullRows.every(isRecord)) {
      throw new JsonShapeError(
        'invalid-shape',
        'A top-level JSON array must contain only objects (or null samples)'
      );
    }
    rootRows = nonNullRows as JsonRecord[];
    if (rootRows.length === 0) {
      throw new JsonShapeError('invalid-shape', 'JSON shape input needs at least one object');
    }
    if (parsed.length > parsedLimits.maxSampleObjects) {
      notes.push(
        `Only the first ${parsedLimits.maxSampleObjects.toLocaleString()} top-level objects were inspected.`
      );
    }
    if (nonNullRows.length !== parsed.length) {
      notes.push('Null top-level samples were ignored.');
    }
  } else {
    throw new JsonShapeError(
      'invalid-shape',
      'JSON shape input must be an object or an array of objects'
    );
  }

  const rootName = entityName(options.entityName, 'imported-record');
  const rootLabel = label(options.entityLabel ?? rootName.replace(/-/g, ' '), 'Imported record');
  const usedEntityNames = new Set([rootName]);
  const state: InferState = {
    parsedLimits,
    notes,
    relationCandidates: [],
    usedEntityNames,
    relatedEntities: [],
    objectsInspected: 0,
  };
  const rootEntity = inferOneEntity(rootName, rootLabel, rootRows, 0, state);
  const blueprint = parseBlueprint({
    formatVersion: 1,
    name: `Imported ${rootLabel}`.slice(0, 80),
    entities: [
      rootEntity,
      ...state.relatedEntities.sort((left, right) => left.name.localeCompare(right.name, 'en')),
    ],
    roles: [{ name: 'owner', permissions: { '*': ['*'] } }],
  });
  return {
    entities: blueprint.entities,
    notes: state.notes,
    relationCandidates: state.relationCandidates.sort((left, right) =>
      `${left.sourceEntity}.${left.field}`.localeCompare(
        `${right.sourceEntity}.${right.field}`,
        'en'
      )
    ),
    objectsInspected: state.objectsInspected,
  };
}

/** Alias emphasizing this is authoring-only shape inference. */
export const inferJsonEntity = inferJsonShape;
