import { describe, expect, it } from 'vitest';
import { inferCsvEntity } from '../../src/import/csv-shape.ts';
import { inferJsonShape, JsonShapeError } from '../../src/import/json-shape.ts';
import { importSqliteSchema, SqliteSchemaError } from '../../src/import/sqlite-schema.ts';

describe('schema import security bounds', () => {
  it('keeps imported values out of every generated draft and review note', () => {
    const privateValue = 'DO_NOT_COPY_PRIVATE_CELL_9f4a';
    const csv = inferCsvEntity(`name,notes\nAda,${privateValue}`);
    const json = inferJsonShape(JSON.stringify({ name: 'Ada', notes: privateValue }));
    const sqlite = importSqliteSchema(
      `CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT DEFAULT '${privateValue}');`
    );

    for (const draft of [csv, json, sqlite]) {
      expect(JSON.stringify(draft)).not.toContain(privateValue);
    }
  });

  it('reports malformed input without echoing source cell values', () => {
    const privateCsv = 'name,notes\nAda,"PRIVATE_CSV_VALUE';
    const privateJson = '{"notes":"PRIVATE_JSON_VALUE",';
    const privateSql = 'CREATE TABLE notes ("PRIVATE_SQL_VALUE"';

    for (const [parse, input] of [
      [() => inferCsvEntity(privateCsv), privateCsv],
      [() => inferJsonShape(privateJson), privateJson],
      [() => importSqliteSchema(privateSql), privateSql],
    ] as const) {
      try {
        parse();
        throw new Error('Expected malformed input to be rejected');
      } catch (error) {
        expect((error as Error).message).not.toContain(input.replace(/.*PRIVATE_/, 'PRIVATE_'));
        expect((error as Error).message).not.toContain('PRIVATE_');
      }
    }
  });

  it('rejects JSON prototype keys, control-bearing keys, and oversized keys without echoing them', () => {
    for (const source of [
      '{"__proto__":{"polluted":true}}',
      '{"constructor":"private"}',
      '{"bad\\u202ename":"private"}',
      JSON.stringify({ ['k'.repeat(16 * 1024 + 1)]: 'private' }),
    ]) {
      try {
        inferJsonShape(source);
        throw new Error('Expected hostile JSON key to be rejected');
      } catch (error) {
        expect(error).toBeInstanceOf(JsonShapeError);
        expect((error as Error).message).not.toContain('private');
        expect((error as Error).message).not.toContain('constructor');
        expect((error as Error).message).not.toContain('__proto__');
      }
    }
  });

  it('bounds nesting, node counts, rows, bytes, headers, and SQLite tokens', () => {
    const deepJson = `${'{"a":'.repeat(9)}0${'}'.repeat(9)}`;
    expect(() => inferJsonShape(deepJson)).toThrow(expect.objectContaining({ code: 'too-deep' }));
    expect(() => inferJsonShape(JSON.stringify(Array.from({ length: 2_001 }, () => ({}))))).toThrow(
      expect.objectContaining({ code: 'too-many-objects' })
    );

    const tooManyCsvRows = `name\n${Array(10_001).fill('Ada').join('\n')}`;
    expect(() => inferCsvEntity(tooManyCsvRows)).toThrow(/more than 10,000 data rows/);
    expect(() => inferCsvEntity(`name\n${'x'.repeat(16 * 1024 + 1)}`)).toThrow(
      /sample cell exceeds/
    );
    expect(() => inferCsvEntity(`${'x'.repeat(16 * 1024 + 1)}\nAda`)).toThrow(/header exceeds/);

    const deepSql = `CREATE TABLE t (name TEXT DEFAULT ${'('.repeat(9)}1${')'.repeat(9)});`;
    expect(() => importSqliteSchema(deepSql)).toThrow(
      expect.objectContaining({ code: 'too-deep' })
    );
    const tokenFlood = `CREATE TABLE t (${Array(14_000).fill('item TEXT').join(',')});`;
    expect(() => importSqliteSchema(tokenFlood)).toThrow(
      expect.objectContaining({ code: 'too-many-tokens' })
    );
  });

  it('clamps caller limits and keeps typed parser errors value-free', () => {
    const oversizedCsv = `name\n${'x'.repeat(2 * 1024 * 1024)}`;
    expect(() => inferCsvEntity(oversizedCsv, { maxBytes: Number.MAX_SAFE_INTEGER })).toThrow(
      /bytes/
    );
    const oversizedJson = JSON.stringify({ value: 'x'.repeat(2 * 1024 * 1024) });
    expect(() => inferJsonShape(oversizedJson, { maxBytes: Number.MAX_SAFE_INTEGER })).toThrow(
      expect.objectContaining({ code: 'input-too-large' })
    );

    const oversizedSql = `CREATE TABLE t (name TEXT DEFAULT '${'x'.repeat(256 * 1024)}');`;
    try {
      importSqliteSchema(oversizedSql, { maxBytes: Number.MAX_SAFE_INTEGER });
      throw new Error('Expected oversized SQLite schema to be rejected');
    } catch (error) {
      expect(error).toBeInstanceOf(SqliteSchemaError);
      expect((error as SqliteSchemaError).code).toBe('input-too-large');
      expect((error as Error).message).not.toContain('x'.repeat(100));
    }
  });
});
