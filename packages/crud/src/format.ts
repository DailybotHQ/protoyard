import type { BlueprintEntity, BlueprintField } from '@protoyard/blueprint';
import { fieldLabel, inputProperty } from '@protoyard/blueprint';
import type { Row } from '@protoyard/core';

/** Money is integer cents → major units via Intl. */
export function formatMoney(cents: unknown, currency = 'USD', locale = 'en-US'): string {
  if (typeof cents !== 'number' || !Number.isFinite(cents)) return '—';
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(cents / 100);
}

export function formatEntityHeading(entity: Pick<BlueprintEntity, 'label' | 'plural'>): string {
  return (entity.label ?? entity.plural)
    .replace(/[-_]+/g, ' ')
    .toLocaleLowerCase('en-US')
    .replace(/(^|\s)\p{L}/gu, (letter) => letter.toLocaleUpperCase('en-US'));
}

export function formatFieldValue(
  field: BlueprintField,
  value: unknown,
  displayNames?: ReadonlyMap<string, string>
): string {
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
      return (Array.isArray(value) ? value : [value])
        .map((id) => displayNames?.get(String(id)) ?? String(id))
        .join(', ');
    case 'avatar':
      // The library id; screens render the face next to it (RecordAvatar).
      return String(value);
    case 'geo': {
      const { lat, lng } = value as { lat?: unknown; lng?: unknown };
      return typeof lat === 'number' && typeof lng === 'number'
        ? `${lat.toFixed(5)}, ${lng.toFixed(5)}`
        : '—';
    }
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
