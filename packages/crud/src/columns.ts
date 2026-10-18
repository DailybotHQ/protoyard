import type { BlueprintEntity, BlueprintField } from '@protoyard/blueprint';
import type { Row } from '@protoyard/core';
import type { DataTableColumn } from '@protoyard/ui';
import { fieldLabel, formatFieldValue, inputProperty, readRowValue } from './format.ts';

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
export function entityListColumns(entity: BlueprintEntity): DataTableColumn<Row>[] {
  const ordered = [
    ...entity.fields.filter((f) => f.name === entity.titleField),
    ...entity.fields.filter((f) => f.name !== entity.titleField && LIST_KINDS.has(f.kind)),
  ].slice(0, 8);

  return ordered.map((field) => columnFor(field));
}

function columnFor(field: BlueprintField): DataTableColumn<Row> {
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
      if (typeof value === 'number' || typeof value === 'boolean' || value instanceof Date)
        return value;
      if (value === null || value === undefined) return null;
      return formatFieldValue(field, value);
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
