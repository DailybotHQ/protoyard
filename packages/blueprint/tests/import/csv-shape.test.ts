import { describe, expect, it } from 'vitest';
import {
  CSV_SHAPE_MAX_COLUMNS,
  CSV_SHAPE_MAX_SAMPLE_ROWS,
  inferCsvEntity,
} from '../../src/import/csv-shape.ts';
import { parseBlueprint } from '../../src/schema.ts';

describe('CSV shape inference', () => {
  it('returns a valid entity draft without copying sample values', () => {
    const csv = [
      'Name,Email,Amount,Active,Created At,Notes',
      'Ada Lovelace,ada@example.com,12.50,true,2025-01-02T03:04:05Z,PRIVATE SAMPLE VALUE',
      'Grace Hopper,grace@example.com,9.25,false,2025-01-03T03:04:05Z,another private value',
    ].join('\n');

    const result = inferCsvEntity(csv, { entityName: 'invoice' });
    const fields = Object.fromEntries(result.entity.fields.map((field) => [field.name, field]));

    expect(
      parseBlueprint({
        formatVersion: 1,
        name: 'Imported invoice',
        entities: [result.entity],
        roles: [{ name: 'owner', permissions: { '*': ['*'] } }],
      }).entities[0]
    ).toEqual(result.entity);
    expect(result.entity.name).toBe('invoice');
    expect(result.entity.titleField).toBe('name');
    expect(fields.name).toMatchObject({ kind: 'text', label: 'Name' });
    expect(fields.email).toMatchObject({ kind: 'email', label: 'Email' });
    expect(fields.amount).toMatchObject({ kind: 'money', currency: 'USD' });
    expect(fields.active).toMatchObject({ kind: 'boolean' });
    expect(fields.fieldCreatedAt).toMatchObject({ kind: 'datetime' });
    expect(fields.notes).toMatchObject({ kind: 'longText' });
    expect(JSON.stringify(result)).not.toContain('Ada Lovelace');
    expect(JSON.stringify(result)).not.toContain('PRIVATE SAMPLE VALUE');
    expect(result.rowsInspected).toBe(2);
  });

  it('normalizes names deterministically and reports ambiguous columns', () => {
    const csv = ['First Name,first_name,Status', 'A,1,open', 'B,unknown,closed'].join('\n');
    const first = inferCsvEntity(csv);
    const second = inferCsvEntity(csv);

    expect(first).toEqual(second);
    expect(first.entity.fields.map((field) => field.name)).toEqual([
      'firstName',
      'firstName2',
      'status',
    ]);
    expect(first.entity.fields.find((field) => field.name === 'status')?.kind).toBe('text');
    expect(first.notes.some((note) => note.includes('ambiguous'))).toBe(true);
  });

  it('inspects a bounded sample and rejects oversized shapes', () => {
    const rows = Array.from(
      { length: CSV_SHAPE_MAX_SAMPLE_ROWS + 5 },
      (_, index) => `row-${index}`
    );
    const result = inferCsvEntity(['Value', ...rows].join('\n'));
    expect(result.rowsInspected).toBe(CSV_SHAPE_MAX_SAMPLE_ROWS);
    expect(result.notes[0]).toContain('first 100');

    const wide = `${Array.from({ length: CSV_SHAPE_MAX_COLUMNS + 1 }, (_, index) => `c${index}`).join(',')}\n`;
    expect(() => inferCsvEntity(wide)).toThrow(/columns/);
  });

  it('does not expose sample values when a formula-like cell is present', () => {
    const result = inferCsvEntity(
      ['Description', '\'=HYPERLINK("https://example.com")'].join('\n')
    );
    expect(JSON.stringify(result)).not.toContain('HYPERLINK');
    expect(result.entity.fields).toContainEqual(
      expect.objectContaining({ name: 'description', kind: 'longText' })
    );
    expect(result.entity.titleField).toBe('name');
  });
});
