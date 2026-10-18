import type { BlueprintField } from '@protoyard/blueprint';
import { fieldLabel, inputProperty } from '@protoyard/blueprint';
import type { Row } from '@protoyard/core';

/** Money is integer cents → major units via Intl. */
export function formatMoney(cents: unknown, currency = 'USD', locale = 'en-US'): string {
  if (typeof cents !== 'number' || !Number.isFinite(cents)) return '—';
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(cents / 100);
}

export function formatFieldValue(field: BlueprintField, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  switch (field.kind) {
    case 'money':
      return formatMoney(value, field.currency);
    case 'boolean':
      return value ? 'Yes' : 'No';
    case 'tags':
      return Array.isArray(value) ? value.join(', ') : String(value);
    case 'enum':
      return field.labels?.[String(value)] ?? String(value);
    case 'relation':
    case 'persona':
      if (Array.isArray(value)) return value.join(', ');
      return String(value);
    case 'json':
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    default:
      return String(value);
  }
}

export function readRowValue(row: Row, field: BlueprintField): unknown {
  return row[inputProperty(field)];
}

export { fieldLabel, inputProperty };
