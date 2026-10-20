import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  importSqliteSchema,
  SQLITE_SCHEMA_MAX_BYTES,
  SQLITE_SCHEMA_MAX_COLUMNS,
  SQLITE_SCHEMA_MAX_TABLES,
  SqliteSchemaError,
} from '../../src/import/sqlite-schema.ts';
import { parseBlueprint } from '../../src/schema.ts';

function expectImportError(action: () => unknown, code: SqliteSchemaError['code']): void {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(SqliteSchemaError);
    expect(error).toMatchObject({ code });
    expect((error as Error).message).toContain(':');
    return;
  }
  throw new Error(`Expected SQLite schema error ${code}`);
}

describe('SQLite DDL schema import', () => {
  it('publishes the parser only through its lazy authoring subpath', () => {
    const manifest = JSON.parse(
      readFileSync(resolve(process.cwd(), 'packages/blueprint/package.json'), 'utf8')
    ) as { exports: Record<string, string> };
    expect(manifest.exports['./import/sqlite-schema']).toBe('./src/import/sqlite-schema.ts');
  });

  it('infers a complete, validated entity draft from CREATE TABLE declarations', () => {
    const result = importSqliteSchema(`
      -- schema only; row values are never loaded
      CREATE TABLE customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        full_name TEXT NOT NULL,
        email VARCHAR(240),
        joined DATE DEFAULT '2025-01-01'
      );
      CREATE TABLE orders (
        id INTEGER PRIMARY KEY,
        customer_id INTEGER NOT NULL,
        amount_cents INTEGER NOT NULL,
        CONSTRAINT fk_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
      );
    `);
    const customer = result.entities.find((entity) => entity.name === 'customers');
    const order = result.entities.find((entity) => entity.name === 'orders');

    expect(result.tablesImported).toBe(2);
    expect(customer?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'fullName', kind: 'text', required: true }),
        expect.objectContaining({ name: 'email', kind: 'text', required: false }),
        expect.objectContaining({ name: 'joined', kind: 'date', required: false }),
      ])
    );
    expect(order?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'customer',
          kind: 'relation',
          to: 'customers',
          cardinality: 'one',
          onDelete: 'cascade',
          required: true,
        }),
        expect.objectContaining({ name: 'amountCents', kind: 'integer', required: true }),
      ])
    );
    expect(result.primaryKeys).toEqual([
      { entity: 'customers', fields: [], representedByPlatformId: true },
      { entity: 'orders', fields: [], representedByPlatformId: true },
    ]);
    expect(result.notes).toContain(
      "customers: INTEGER PRIMARY KEY maps to Protoyard's generated platform id."
    );
    expect(
      parseBlueprint({
        formatVersion: 1,
        name: 'Imported SQLite schema',
        entities: result.entities,
        roles: [{ name: 'owner', permissions: { '*': ['*'] } }],
      }).entities
    ).toEqual(result.entities);
  });

  it('handles quoted identifiers, table primary keys and nullable delete behavior', () => {
    const result = importSqliteSchema(`
      CREATE TABLE "Project Space" (
        "Project Key" TEXT,
        title TEXT NOT NULL,
        PRIMARY KEY ("Project Key")
      );
      CREATE TABLE tasks (
        task_key TEXT PRIMARY KEY,
        "Project Key" TEXT REFERENCES "Project Space"("Project Key") ON DELETE SET NULL
      );
    `);
    const project = result.entities.find((entity) => entity.name === 'project-space');
    const task = result.entities.find((entity) => entity.name === 'tasks');
    expect(project?.fields).toContainEqual(
      expect.objectContaining({ name: 'projectKey', kind: 'text', required: true })
    );
    expect(task?.fields).toContainEqual(
      expect.objectContaining({
        name: 'projectKey',
        kind: 'relation',
        to: 'project-space',
        onDelete: 'nullify',
        required: false,
      })
    );
    expect(result.primaryKeys).toContainEqual({
      entity: 'project-space',
      fields: ['projectKey'],
      representedByPlatformId: false,
    });
    expect(result.notes.some((note) => note.includes('uniqueness is not represented'))).toBe(true);
  });

  it('discards defaults and SQL literals without echoing them into drafts or errors', () => {
    const secret = 'sensitive-fixture-value';
    const result = importSqliteSchema(
      `CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT DEFAULT '${secret}');`
    );
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(result.entities[0]?.fields).toContainEqual(
      expect.objectContaining({ name: 'body', kind: 'text' })
    );
    expect(result.notes.join(' ')).not.toContain(secret);
  });

  it('rejects unsupported statements, types, malformed references and composite relations safely', () => {
    expectImportError(() => importSqliteSchema('DROP TABLE users;'), 'unsupported-ddl');
    expectImportError(
      () => importSqliteSchema('CREATE TABLE users (id UUID);'),
      'unsupported-type'
    );
    expectImportError(
      () =>
        importSqliteSchema(
          'CREATE TABLE users (id INTEGER, team_id INTEGER REFERENCES teams(id));'
        ),
      'invalid-reference'
    );
    expectImportError(
      () =>
        importSqliteSchema(
          'CREATE TABLE a (x INTEGER, y INTEGER, FOREIGN KEY (x, y) REFERENCES b(x, y)); CREATE TABLE b (x INTEGER, y INTEGER);'
        ),
      'unsupported-ddl'
    );
  });

  it('is deterministic and enforces byte, table, column and token bounds', () => {
    const sql = 'CREATE TABLE widgets (id INTEGER PRIMARY KEY, name TEXT NOT NULL);';
    expect(importSqliteSchema(sql)).toEqual(importSqliteSchema(sql));
    expectImportError(() => importSqliteSchema(sql, { maxBytes: 4 }), 'input-too-large');
    expectImportError(
      () =>
        importSqliteSchema('CREATE TABLE a (x TEXT); CREATE TABLE b (y TEXT);', { maxTables: 1 }),
      'too-many-tables'
    );
    expectImportError(
      () => importSqliteSchema('CREATE TABLE a (x TEXT, y TEXT);', { maxColumns: 1 }),
      'too-many-columns'
    );
    expect(SQLITE_SCHEMA_MAX_BYTES).toBe(256 * 1024);
    expect(SQLITE_SCHEMA_MAX_COLUMNS).toBe(100);
    expect(SQLITE_SCHEMA_MAX_TABLES).toBe(50);
  });
});
