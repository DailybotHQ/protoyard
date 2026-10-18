import { createRng } from '@protoyard/core';
import { describe, expect, it } from 'vitest';
import {
  CSV_MAX_BYTES,
  CSV_MAX_ROWS,
  CsvError,
  escapeCsvCell,
  parseCsv,
  serializeCsv,
  serializeEntityCsv,
  validateCsv,
} from '../src/csv.ts';
import { parseBlueprint } from '../src/index.ts';

const entity = parseBlueprint({
  formatVersion: 1,
  name: 'CSV fixture',
  entities: [
    {
      name: 'customer',
      plural: 'customers',
      fields: [{ name: 'name', kind: 'text', required: true }],
      titleField: 'name',
    },
    {
      name: 'deal',
      plural: 'deals',
      fields: [
        { name: 'title', kind: 'text', required: true, label: 'Deal title' },
        { name: 'amount', kind: 'money', currency: 'USD', min: 0 },
        { name: 'closeOn', kind: 'date' },
        { name: 'active', kind: 'boolean', default: true },
        { name: 'customer', kind: 'relation', to: 'customer', required: true },
        { name: 'tags', kind: 'tags', maxItems: 4 },
        {
          name: 'stage',
          kind: 'enum',
          values: ['lead', 'won', 'lost'],
          default: 'lead',
          required: true,
        },
      ],
      titleField: 'title',
    },
  ],
  roles: [{ name: 'owner', permissions: { '*': ['*'] } }],
}).entities[1]!;

describe('parseCsv / serializeCsv', () => {
  it('parses quotes, escaped quotes, CRLF and a leading BOM', () => {
    const text = `\uFEFFname,note\r\n"Ada ""Lovelace""","line1\r\nline2"\r\nBob,plain\n`;
    expect(parseCsv(text)).toEqual([
      ['name', 'note'],
      ['Ada "Lovelace"', 'line1\r\nline2'],
      ['Bob', 'plain'],
    ]);
  });

  it('round-trips arbitrary cells including commas and quotes', () => {
    const rows = [
      ['a', 'b,c', 'say "hi"'],
      ['', 'x', 'y\nz'],
    ];
    expect(parseCsv(serializeCsv(rows))).toEqual(rows);
  });

  it('guards formula injection on export', () => {
    expect(escapeCsvCell('=1+1')).toBe("'=1+1");
    expect(escapeCsvCell('+cmd')).toBe("'+cmd");
    expect(escapeCsvCell('-1')).toBe("'-1");
    expect(escapeCsvCell('@sum')).toBe("'@sum");
    expect(escapeCsvCell('safe')).toBe('safe');
    expect(escapeCsvCell('=1+1', { guardFormulas: false })).toBe('=1+1');

    const csv = serializeCsv([['name'], ["=cmd|'/c calc'!A0"]]);
    expect(csv).toContain("'=cmd");
    // Re-parse keeps the leading quote so spreadsheets see text, not a formula.
    expect(parseCsv(csv)[1]![0]).toBe("'=cmd|'/c calc'!A0");
  });

  it('enforces byte and row limits', () => {
    expect(() => parseCsv('a,b\n1,2', { maxBytes: 3 })).toThrow(CsvError);
    expect(() => parseCsv('a,b\n1,2', { maxBytes: 3 })).toThrow(/bytes/);

    const many = ['h', ...Array.from({ length: 5 }, (_, i) => String(i))].join('\n');
    expect(() => parseCsv(many, { maxRows: 3 })).toThrow(/data rows/);
    expect(CSV_MAX_BYTES).toBeGreaterThan(0);
    expect(CSV_MAX_ROWS).toBeGreaterThan(0);
  });

  it('rejects an unclosed quote', () => {
    expect(() => parseCsv('a,"b')).toThrow(/closing quote/);
  });
});

describe('validateCsv', () => {
  it('maps headers by label or name and validates rows', () => {
    const csv = [
      'Deal title,amount,closeOn,active,customerId,tags,stage',
      'Acme seat,12.50,2026-03-02,yes,customer_0001,"vip,pilot",won',
      ',not-money,2026-13-40,maybe,, ,bogus',
    ].join('\r\n');

    const result = validateCsv(entity, csv);
    expect(result.valid).toHaveLength(1);
    expect(result.valid[0]).toMatchObject({
      title: 'Acme seat',
      amount: 1250,
      closeOn: '2026-03-02',
      active: true,
      customerId: 'customer_0001',
      tags: ['vip', 'pilot'],
      stage: 'won',
    });
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.every((e) => e.row === 2)).toBe(true);
    expect(result.errors.map((e) => e.field).sort()).toEqual(
      expect.arrayContaining(['title', 'amount', 'closeOn', 'active', 'customerId', 'stage'])
    );
  });

  it('accepts field names as headers', () => {
    const csv = 'title,customerId,stage\nHello,customer_1,lead\n';
    const result = validateCsv(entity, csv);
    expect(result.valid).toEqual([
      expect.objectContaining({ title: 'Hello', customerId: 'customer_1', stage: 'lead' }),
    ]);
  });

  it('rejects unknown headers', () => {
    expect(() => validateCsv(entity, 'nope,title\n1,2\n')).toThrow(/Unknown CSV column/);
  });

  it('round-trips entity records with seeded values', () => {
    const rng = createRng(42);
    const records = Array.from({ length: 20 }, (_, i) => {
      const cents = rng.int(0, 50_000);
      const month = rng.int(1, 12);
      const day = rng.int(1, 28);
      return {
        title: `Deal ${i} "Q${rng.int(1, 4)}"`,
        amount: cents,
        closeOn: `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        active: rng.int(0, 1) === 1,
        customerId: `customer_${String(rng.int(1, 99)).padStart(4, '0')}`,
        tags: rng.int(0, 1) === 1 ? ['alpha', 'beta'] : [],
        stage: (['lead', 'won', 'lost'] as const)[rng.int(0, 2)] as string,
      };
    });

    const csv = serializeEntityCsv(entity, records);
    // Injection-safe: a title starting with = would be quoted-prefixed on export.
    const sneaky = serializeEntityCsv(entity, [
      {
        title: '=cmd',
        amount: 100,
        closeOn: '2026-01-15',
        active: true,
        customerId: 'customer_0001',
        tags: [],
        stage: 'lead',
      },
    ]);
    expect(sneaky).toContain("'=cmd");

    const again = validateCsv(entity, csv);
    expect(again.errors).toEqual([]);
    expect(again.valid).toHaveLength(20);
    for (let i = 0; i < records.length; i++) {
      expect(again.valid[i]).toMatchObject({
        title: records[i]!.title,
        amount: records[i]!.amount,
        closeOn: records[i]!.closeOn,
        active: records[i]!.active,
        customerId: records[i]!.customerId,
        stage: records[i]!.stage,
      });
      expect(again.valid[i]!.tags).toEqual(records[i]!.tags);
    }
  });
});
