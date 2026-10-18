import type { Blueprint, BlueprintEntity, BlueprintField } from '@protoyard/blueprint';
import type { Row } from '@protoyard/core';
import type { DataTableColumn } from '@protoyard/ui';
import { fieldLabel, formatFieldValue, inputProperty, readRowValue } from './format.ts';

export { formatEntityHeading as entityListHeading } from './format.ts';

export type EntityListDisplayNames = Readonly<Record<string, ReadonlyMap<string, string>>>;

export interface EntityListDisplayLookups {
  canReadEntity(entityName: string): boolean;
  listEntity(entityName: string): Promise<readonly Row[]>;
  listPersonas(): readonly { persona: { id: string; name: string } }[];
}

/** Load each related entity and the current workspace's personas once per list. */
export async function loadEntityListDisplayNames(
  entity: BlueprintEntity,
  blueprint: Blueprint,
  lookups: EntityListDisplayLookups
): Promise<EntityListDisplayNames> {
  const relationFields = entity.fields.filter(
    (field): field is Extract<BlueprintField, { kind: 'relation' }> => field.kind === 'relation'
  );
  const targets = [...new Set(relationFields.map((field) => field.to))];
  const targetNames = await Promise.all(
    targets.map(async (targetName) => {
      const target = blueprint.entities.find((candidate) => candidate.name === targetName);
      if (!target || !lookups.canReadEntity(targetName)) {
        return [targetName, new Map<string, string>()] as const;
      }
      const title = target.fields.find((field) => field.name === target.titleField);
      const rows = await lookups.listEntity(targetName);
      const names = new Map(
        rows.map((row) => [
          String(row.id),
          title ? String(readRowValue(row, title) ?? row.id) : String(row.id),
        ])
      );
      return [targetName, names] as const;
    })
  );
  const byTarget = new Map(targetNames);
  const displayNames: Record<string, ReadonlyMap<string, string>> = {};

  for (const field of relationFields) {
    displayNames[field.name] = byTarget.get(field.to) ?? new Map();
  }

  if (entity.fields.some((field) => field.kind === 'persona')) {
    const personas = new Map(
      lookups.listPersonas().map(({ persona }) => [persona.id, persona.name])
    );
    for (const field of entity.fields) {
      if (field.kind === 'persona') displayNames[field.name] = personas;
    }
  }

  return displayNames;
}

const LIST_KINDS = new Set([
  'text',
  'email',
  'url',
  'phone',
  'enum',
  'integer',
  'number',
  'money',
  'boolean',
  'date',
  'datetime',
  'tags',
  'relation',
  'persona',
]);

/** Columns for EntityList: title field first, then other list-friendly fields. */
export function entityListColumns(
  entity: BlueprintEntity,
  displayNames: EntityListDisplayNames = {}
): DataTableColumn<Row>[] {
  const ordered = [
    ...entity.fields.filter((f) => f.name === entity.titleField),
    ...entity.fields.filter((f) => f.name !== entity.titleField && LIST_KINDS.has(f.kind)),
  ].slice(0, 8);

  return ordered.map((field) => columnFor(field, displayNames[field.name]));
}

function columnFor(
  field: BlueprintField,
  displayNames?: ReadonlyMap<string, string>
): DataTableColumn<Row> {
  const key = inputProperty(field);
  return {
    key,
    header: fieldLabel(field),
    sortable: field.kind !== 'json' && field.kind !== 'file' && field.kind !== 'longText',
    align:
      field.kind === 'money' || field.kind === 'integer' || field.kind === 'number'
        ? 'right'
        : 'left',
    accessor: (row) => {
      const value = readRowValue(row, field);
      if (field.kind === 'money') return formatFieldValue(field, value);
      if (typeof value === 'number' || typeof value === 'boolean' || value instanceof Date)
        return value;
      if (value === null || value === undefined) return null;
      return formatFieldValue(field, value, displayNames);
    },
  };
}

/** Search keys for DataTable (title + searchable + text-like fields). */
export function entitySearchKeys(entity: BlueprintEntity): string[] {
  const keys = new Set<string>();
  const title = entity.fields.find((f) => f.name === entity.titleField);
  if (title) keys.add(inputProperty(title));
  for (const name of entity.searchable) {
    const field = entity.fields.find((f) => f.name === name);
    if (field) keys.add(inputProperty(field));
  }
  for (const field of entity.fields) {
    if (['text', 'email', 'enum', 'phone'].includes(field.kind)) keys.add(inputProperty(field));
  }
  return [...keys];
}
