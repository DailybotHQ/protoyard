import { type BlueprintEntity, parseBlueprint } from '../schema.ts';

export const SQLITE_SCHEMA_MAX_BYTES = 256 * 1024;
export const SQLITE_SCHEMA_MAX_TABLES = 50;
export const SQLITE_SCHEMA_MAX_COLUMNS = 100;
export const SQLITE_SCHEMA_MAX_TOKENS = 40_000;

export interface SqliteSchemaOptions {
  /** Maximum UTF-8 bytes accepted. Overrides are clamped to the hard maximum. */
  maxBytes?: number;
  /** Maximum CREATE TABLE statements accepted. Overrides are clamped to the hard maximum. */
  maxTables?: number;
  /** Maximum columns and constraints per table. Overrides are clamped to the hard maximum. */
  maxColumns?: number;
}

export type SqliteSchemaErrorCode =
  | 'invalid-ddl'
  | 'unsupported-ddl'
  | 'unsupported-type'
  | 'invalid-reference'
  | 'input-too-large'
  | 'too-many-tables'
  | 'too-many-columns'
  | 'too-many-tokens'
  | 'invalid-options';

export class SqliteSchemaError extends Error {
  readonly code: SqliteSchemaErrorCode;
  readonly path: string;

  constructor(code: SqliteSchemaErrorCode, path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = 'SqliteSchemaError';
    this.code = code;
    this.path = path;
  }
}

export interface SqlitePrimaryKeyDraft {
  entity: string;
  fields: string[];
  /** SQLite rowid alias `INTEGER PRIMARY KEY` is represented by platform `id`. */
  representedByPlatformId: boolean;
}

export interface SqliteSchemaResult {
  /** Validated, value-free entity drafts. */
  entities: BlueprintEntity[];
  /** Primary-key shape that blueprint fields cannot express as uniqueness constraints. */
  primaryKeys: SqlitePrimaryKeyDraft[];
  /** Review notes never include SQL literals or database rows. */
  notes: string[];
  tablesImported: number;
}

interface Limits {
  maxBytes: number;
  maxTables: number;
  maxColumns: number;
}

type TokenKind = 'identifier' | 'string' | 'number' | 'symbol';
interface Token {
  kind: TokenKind;
  value: string;
  offset: number;
}

interface ForeignKey {
  columns: string[];
  target: string;
  targetColumns: string[];
  onDelete: 'restrict' | 'cascade' | 'nullify';
}

interface ColumnDraft {
  sourceName: string;
  name: string;
  kind: string;
  notNull: boolean;
  primaryKey: boolean;
  inlineReference?: ForeignKey;
}

interface TableDraft {
  sourceName: string;
  name: string;
  label: string;
  columns: ColumnDraft[];
  primaryKey: string[];
  foreignKeys: ForeignKey[];
}

const RESERVED_FIELDS = new Set(['id', 'createdAt', 'updatedAt', 'deletedAt', 'deletedBy']);
const CONSTRAINT_WORDS = new Set([
  'CONSTRAINT',
  'PRIMARY',
  'NOT',
  'NULL',
  'UNIQUE',
  'CHECK',
  'DEFAULT',
  'COLLATE',
  'REFERENCES',
  'GENERATED',
]);

function fail(code: SqliteSchemaErrorCode, path: string, message: string): never {
  throw new SqliteSchemaError(code, path, message);
}

function bounded(value: number | undefined, fallback: number, maximum: number): number {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value) || value < 1) {
    return fail('invalid-options', 'options', 'limits must be positive finite numbers');
  }
  return Math.min(Math.floor(value), maximum);
}

function parseLimits(options: SqliteSchemaOptions): Limits {
  return {
    maxBytes: bounded(options.maxBytes, SQLITE_SCHEMA_MAX_BYTES, SQLITE_SCHEMA_MAX_BYTES),
    maxTables: bounded(options.maxTables, SQLITE_SCHEMA_MAX_TABLES, SQLITE_SCHEMA_MAX_TABLES),
    maxColumns: bounded(options.maxColumns, SQLITE_SCHEMA_MAX_COLUMNS, SQLITE_SCHEMA_MAX_COLUMNS),
  };
}

function tokenize(sql: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < sql.length) {
    const start = index;
    const char = sql[index] ?? '';
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    if (char === '-' && sql[index + 1] === '-') {
      index += 2;
      while (index < sql.length && sql[index] !== '\n') index += 1;
      continue;
    }
    if (char === '/' && sql[index + 1] === '*') {
      const end = sql.indexOf('*/', index + 2);
      if (end < 0) fail('invalid-ddl', 'sql', 'unterminated comment');
      index = end + 2;
      continue;
    }
    if (char === '"' || char === '`' || char === '[' || char === "'") {
      const closing = char === '[' ? ']' : char;
      const kind: TokenKind = char === "'" ? 'string' : 'identifier';
      index += 1;
      let value = '';
      let closed = false;
      while (index < sql.length) {
        const current = sql[index] ?? '';
        if (current === closing) {
          if (sql[index + 1] === closing && char !== '[') {
            value += closing;
            index += 2;
            continue;
          }
          index += 1;
          closed = true;
          break;
        }
        value += current;
        index += 1;
      }
      if (!closed) fail('invalid-ddl', 'sql', 'unterminated quoted token');
      tokens.push({ kind, value, offset: start });
    } else if (/[A-Za-z_$]/.test(char)) {
      index += 1;
      while (index < sql.length && /[A-Za-z0-9_$]/.test(sql[index] ?? '')) index += 1;
      tokens.push({ kind: 'identifier', value: sql.slice(start, index), offset: start });
    } else if (
      /[0-9]/.test(char) ||
      ((char === '+' || char === '-') && /[0-9]/.test(sql[index + 1] ?? ''))
    ) {
      const number = sql.slice(index).match(/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/)?.[0];
      if (!number) fail('invalid-ddl', 'sql', 'contains an invalid numeric token');
      index += number.length;
      tokens.push({ kind: 'number', value: number, offset: start });
    } else if ('(),.;+-*/%<>=!|&~'.includes(char)) {
      tokens.push({ kind: 'symbol', value: char, offset: start });
      index += 1;
    } else {
      fail('unsupported-ddl', 'sql', 'contains an unsupported token');
    }
    if (tokens.length > SQLITE_SCHEMA_MAX_TOKENS) {
      fail('too-many-tokens', 'sql', `exceeds the ${SQLITE_SCHEMA_MAX_TOKENS} token limit`);
    }
  }
  return tokens;
}

function isWord(token: Token | undefined, word: string): boolean {
  return token?.kind === 'identifier' && token.value.toUpperCase() === word;
}

function safeName(source: string, fallback: string): { name: string; label: string } {
  const words = source
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const label = (words.join(' ') || fallback).slice(0, 60);
  let name = words.map((part) => part.toLowerCase()).join('-') || fallback;
  if (!/^[a-z]/.test(name)) name = `imported-${name}`;
  return { name: name.slice(0, 60).replace(/-+$/g, '') || fallback, label };
}

function fieldName(source: string, fallback: string, used: Set<string>): string {
  const words = source
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  let name = words
    .map((part, index) => {
      const lower = part.toLowerCase();
      return index === 0 ? lower : `${lower[0]?.toUpperCase() ?? ''}${lower.slice(1)}`;
    })
    .join('');
  if (!name) name = fallback;
  if (/^\d/.test(name)) name = `field${name}`;
  if (RESERVED_FIELDS.has(name)) name = `field${name[0]?.toUpperCase() ?? ''}${name.slice(1)}`;
  name = name.slice(0, 64);
  const base = name;
  let suffix = 2;
  while (used.has(name)) name = `${base.slice(0, 64 - String(suffix).length)}${suffix++}`;
  used.add(name);
  return name;
}

class Parser {
  private index = 0;
  readonly tables: TableDraft[] = [];
  private readonly tokens: Token[];
  private readonly limits: Limits;
  private readonly notes: string[];

  constructor(tokens: Token[], limits: Limits, notes: string[]) {
    this.tokens = tokens;
    this.limits = limits;
    this.notes = notes;
  }

  parse(): TableDraft[] {
    while (this.index < this.tokens.length) {
      if (this.peek()?.value === ';') {
        this.index += 1;
        continue;
      }
      const table = this.parseTable();
      if (
        this.tables.some(
          (existing) => existing.sourceName.toLowerCase() === table.sourceName.toLowerCase()
        )
      ) {
        fail('invalid-ddl', 'tables', 'contains duplicate table declarations');
      }
      this.tables.push(table);
      if (this.tables.length > this.limits.maxTables) {
        fail('too-many-tables', 'tables', `exceeds the ${this.limits.maxTables} table limit`);
      }
      if (this.peek()?.value === ';') this.index += 1;
      else if (this.index < this.tokens.length)
        fail('unsupported-ddl', 'sql', 'expected a semicolon between CREATE TABLE statements');
    }
    if (this.tables.length === 0)
      fail('invalid-ddl', 'sql', 'expected at least one CREATE TABLE declaration');
    return this.tables;
  }

  private peek(offset = 0): Token | undefined {
    return this.tokens[this.index + offset];
  }

  private take(): Token {
    const token = this.peek();
    if (!token) fail('invalid-ddl', 'sql', 'ended before the declaration was complete');
    this.index += 1;
    return token;
  }

  private expectSymbol(value: string, path: string): void {
    if (this.peek()?.value !== value) fail('invalid-ddl', path, `expected ${value}`);
    this.index += 1;
  }

  private identifier(path: string): string {
    const token = this.take();
    if (token.kind !== 'identifier') fail('invalid-ddl', path, 'expected an identifier');
    return token.value;
  }

  private parseTable(): TableDraft {
    const path = `tables[${this.tables.length}]`;
    if (!isWord(this.take(), 'CREATE'))
      fail('unsupported-ddl', path, 'only CREATE TABLE is supported');
    if (isWord(this.peek(), 'TEMP') || isWord(this.peek(), 'TEMPORARY')) this.index += 1;
    if (!isWord(this.take(), 'TABLE'))
      fail('unsupported-ddl', path, 'only CREATE TABLE is supported');
    if (isWord(this.peek(), 'IF')) {
      this.index += 1;
      if (!isWord(this.take(), 'NOT') || !isWord(this.take(), 'EXISTS')) {
        fail('invalid-ddl', path, 'malformed IF NOT EXISTS clause');
      }
    }
    const sourceName = this.identifier(`${path}.name`);
    const normalized = safeName(sourceName, `table-${this.tables.length + 1}`);
    this.expectSymbol('(', `${path}.columns`);
    const definitions: Token[][] = [];
    let current: Token[] = [];
    let depth = 0;
    while (this.index < this.tokens.length) {
      const token = this.take();
      if (token.value === '(') depth += 1;
      if (token.value === ')') {
        if (depth === 0) {
          if (current.length > 0) definitions.push(current);
          break;
        }
        depth -= 1;
      }
      if (token.value === ',' && depth === 0) {
        if (current.length === 0)
          fail('invalid-ddl', `${path}.columns`, 'contains an empty declaration');
        definitions.push(current);
        current = [];
      } else {
        current.push(token);
      }
    }
    if (this.tokens[this.index - 1]?.value !== ')')
      fail('invalid-ddl', `${path}.columns`, 'missing closing parenthesis');
    const columns: ColumnDraft[] = [];
    const primaryKey: string[] = [];
    const foreignKeys: ForeignKey[] = [];
    for (const definition of definitions) {
      if (isWord(definition[0], 'CONSTRAINT')) {
        definition.shift();
        definition.shift();
      }
      if (isWord(definition[0], 'PRIMARY')) {
        this.parseTablePrimaryKey(definition, primaryKey, normalized.name);
      } else if (isWord(definition[0], 'FOREIGN')) {
        foreignKeys.push(this.parseTableForeignKey(definition, normalized.name));
      } else if (isWord(definition[0], 'UNIQUE') || isWord(definition[0], 'CHECK')) {
        this.notes.push(
          `${normalized.label}: a table constraint is omitted because blueprint drafts do not model it.`
        );
      } else {
        columns.push(this.parseColumn(definition, normalized.name, columns.length));
      }
    }
    if (columns.length > this.limits.maxColumns) {
      fail(
        'too-many-columns',
        `${path}.columns`,
        `exceeds the ${this.limits.maxColumns} column limit`
      );
    }
    if (columns.length === 0)
      fail('invalid-ddl', `${path}.columns`, 'a table must declare at least one column');
    for (const column of columns) {
      if (column.primaryKey && !primaryKey.includes(column.sourceName))
        primaryKey.push(column.sourceName);
      if (primaryKey.some((key) => key.toLowerCase() === column.sourceName.toLowerCase())) {
        column.primaryKey = true;
      }
    }
    return {
      sourceName,
      name: normalized.name,
      label: normalized.label,
      columns,
      primaryKey,
      foreignKeys,
    };
  }

  private parseTablePrimaryKey(definition: Token[], keys: string[], entity: string): void {
    if (!isWord(definition[1], 'KEY'))
      fail('invalid-ddl', `tables.${entity}.primaryKey`, 'malformed PRIMARY KEY');
    let cursor = 2;
    if (
      definition[cursor]?.value.toUpperCase() === 'ASC' ||
      definition[cursor]?.value.toUpperCase() === 'DESC'
    )
      cursor += 1;
    if (definition[cursor]?.value !== '(')
      fail('invalid-ddl', `tables.${entity}.primaryKey`, 'expected a primary-key column list');
    cursor += 1;
    while (cursor < definition.length && definition[cursor]?.value !== ')') {
      const token = definition[cursor];
      if (token?.kind !== 'identifier')
        fail('invalid-ddl', `tables.${entity}.primaryKey`, 'expected a primary-key column');
      keys.push(token.value);
      cursor += 1;
      if (definition[cursor]?.value === ',') cursor += 1;
      else break;
    }
    if (definition[cursor]?.value !== ')')
      fail('invalid-ddl', `tables.${entity}.primaryKey`, 'malformed primary-key column list');
  }

  private parseTableForeignKey(definition: Token[], entity: string): ForeignKey {
    if (!isWord(definition[1], 'KEY'))
      fail('invalid-ddl', `tables.${entity}.foreignKeys`, 'malformed FOREIGN KEY');
    let cursor = 2;
    const columns = this.identifierList(definition, cursor, `tables.${entity}.foreignKeys`);
    cursor = columns.next;
    if (!isWord(definition[cursor], 'REFERENCES'))
      fail('invalid-ddl', `tables.${entity}.foreignKeys`, 'expected REFERENCES');
    cursor += 1;
    const target = definition[cursor]?.value;
    if (!target || definition[cursor]?.kind !== 'identifier')
      fail('invalid-ddl', `tables.${entity}.foreignKeys`, 'expected referenced table');
    cursor += 1;
    let targetColumns: string[] = [];
    if (definition[cursor]?.value === '(') {
      const parsed = this.identifierList(definition, cursor, `tables.${entity}.foreignKeys`);
      targetColumns = parsed.values;
      cursor = parsed.next;
    }
    return {
      columns: columns.values,
      target,
      targetColumns,
      onDelete: this.parseDeleteAction(definition, cursor, `tables.${entity}.foreignKeys`),
    };
  }

  private identifierList(
    tokens: Token[],
    start: number,
    path: string
  ): { values: string[]; next: number } {
    if (tokens[start]?.value !== '(') fail('invalid-ddl', path, 'expected a column list');
    const values: string[] = [];
    let cursor = start + 1;
    while (cursor < tokens.length && tokens[cursor]?.value !== ')') {
      const token = tokens[cursor];
      if (token?.kind !== 'identifier') fail('invalid-ddl', path, 'expected a column name');
      values.push(token.value);
      cursor += 1;
      if (tokens[cursor]?.value === ',') cursor += 1;
      else break;
    }
    if (tokens[cursor]?.value !== ')' || values.length === 0)
      fail('invalid-ddl', path, 'malformed column list');
    return { values, next: cursor + 1 };
  }

  private parseDeleteAction(tokens: Token[], start: number, path: string): ForeignKey['onDelete'] {
    for (let cursor = start; cursor < tokens.length; cursor += 1) {
      if (!isWord(tokens[cursor], 'ON') || !isWord(tokens[cursor + 1], 'DELETE')) continue;
      const action = tokens[cursor + 2]?.value.toUpperCase();
      if (action === 'CASCADE') return 'cascade';
      if (action === 'SET' && isWord(tokens[cursor + 3], 'NULL')) return 'nullify';
      if (action === 'RESTRICT' || action === 'NO') return 'restrict';
      fail('unsupported-ddl', path, 'uses an unsupported ON DELETE action');
    }
    return 'restrict';
  }

  private parseColumn(definition: Token[], entity: string, columnIndex: number): ColumnDraft {
    const sourceName = definition[0]?.kind === 'identifier' ? definition[0].value : undefined;
    if (!sourceName)
      fail('invalid-ddl', `tables.${entity}.columns[${columnIndex}]`, 'expected a column name');
    const path = `tables.${entity}.columns.${safeName(sourceName, 'field').name}`;
    let cursor = 1;
    const typeTokens: Token[] = [];
    let parenDepth = 0;
    while (cursor < definition.length) {
      const token = definition[cursor];
      if (
        parenDepth === 0 &&
        token?.kind === 'identifier' &&
        CONSTRAINT_WORDS.has(token.value.toUpperCase())
      )
        break;
      if (token?.value === '(') parenDepth += 1;
      if (token?.value === ')') parenDepth -= 1;
      typeTokens.push(token as Token);
      cursor += 1;
    }
    const type = typeTokens
      .map((token) => token.value)
      .join('')
      .toUpperCase();
    let primaryKey = false;
    let notNull = false;
    let inlineReference: ForeignKey | undefined;
    while (cursor < definition.length) {
      const token = definition[cursor];
      if (isWord(token, 'CONSTRAINT')) {
        cursor += 2;
      } else if (isWord(token, 'PRIMARY') && isWord(definition[cursor + 1], 'KEY')) {
        primaryKey = true;
        cursor += 2;
      } else if (isWord(token, 'NOT') && isWord(definition[cursor + 1], 'NULL')) {
        notNull = true;
        cursor += 2;
      } else if (isWord(token, 'NULL')) {
        cursor += 1;
      } else if (isWord(token, 'UNIQUE')) {
        this.notes.push(
          `${path}: UNIQUE is omitted because blueprint fields do not express uniqueness.`
        );
        cursor += 1;
      } else if (isWord(token, 'CHECK')) {
        cursor = this.skipExpression(definition, cursor + 1, path);
        this.notes.push(`${path}: CHECK is omitted because blueprint drafts do not model checks.`);
      } else if (isWord(token, 'DEFAULT')) {
        cursor = this.skipDefault(definition, cursor + 1, path);
      } else if (isWord(token, 'COLLATE')) {
        cursor += 2;
        this.notes.push(`${path}: collation is omitted from the draft.`);
      } else if (isWord(token, 'REFERENCES')) {
        const parsed = this.parseInlineReference(definition, cursor + 1, path);
        inlineReference = parsed.reference;
        cursor = parsed.next;
      } else if (isWord(token, 'AUTOINCREMENT') || isWord(token, 'ASC') || isWord(token, 'DESC')) {
        cursor += 1;
      } else {
        fail('unsupported-ddl', path, 'contains an unsupported column constraint');
      }
    }
    const name = fieldName(sourceName, `field${columnIndex + 1}`, new Set());
    return {
      sourceName,
      name,
      kind: type,
      notNull,
      primaryKey,
      ...(inlineReference ? { inlineReference } : {}),
    };
  }

  private parseInlineReference(
    tokens: Token[],
    start: number,
    path: string
  ): { reference: ForeignKey; next: number } {
    const targetToken = tokens[start];
    if (targetToken?.kind !== 'identifier') fail('invalid-ddl', path, 'expected referenced table');
    let cursor = start + 1;
    let targetColumns: string[] = [];
    if (tokens[cursor]?.value === '(') {
      const parsed = this.identifierList(tokens, cursor, path);
      targetColumns = parsed.values;
      cursor = parsed.next;
    }
    const onDelete = this.parseDeleteAction(tokens, cursor, path);
    while (cursor < tokens.length) {
      if (isWord(tokens[cursor], 'ON')) {
        cursor += isWord(tokens[cursor + 2], 'SET') ? 4 : 3;
      } else if (isWord(tokens[cursor], 'MATCH')) cursor += 2;
      else if (isWord(tokens[cursor], 'DEFERRABLE')) cursor += 1;
      else if (isWord(tokens[cursor], 'INITIALLY')) cursor += 2;
      else if (isWord(tokens[cursor], 'NOT') && isWord(tokens[cursor + 1], 'DEFERRABLE'))
        cursor += 2;
      else fail('unsupported-ddl', path, 'contains an unsupported REFERENCES clause');
    }
    return {
      reference: { columns: [], target: targetToken.value, targetColumns, onDelete },
      next: tokens.length,
    };
  }

  private skipDefault(tokens: Token[], start: number, path: string): number {
    const first = tokens[start];
    if (!first) fail('invalid-ddl', path, 'DEFAULT is missing a value');
    if (first.value === '(') return this.skipExpression(tokens, start, path);
    if (first.kind === 'string' || first.kind === 'number' || first.kind === 'identifier')
      return start + 1;
    fail('unsupported-ddl', path, 'uses an unsupported DEFAULT expression');
  }

  private skipExpression(tokens: Token[], start: number, path: string): number {
    if (tokens[start]?.value !== '(')
      fail('invalid-ddl', path, 'expected a parenthesized expression');
    let depth = 0;
    for (let cursor = start; cursor < tokens.length; cursor += 1) {
      if (tokens[cursor]?.value === '(') depth += 1;
      if (tokens[cursor]?.value === ')') depth -= 1;
      if (depth === 0) return cursor + 1;
    }
    fail('invalid-ddl', path, 'has an unterminated expression');
  }
}

function fieldKind(sqlType: string, path: string, notes: string[]): string {
  const base = sqlType.replace(/\(.*\)$/, '').trim();
  if (!base) {
    notes.push(
      `${path}: SQLite's implicit BLOB affinity is represented as text for author review.`
    );
    return 'text';
  }
  if (/INT/.test(base)) return 'integer';
  if (/CHAR|CLOB|TEXT/.test(base)) return 'text';
  if (/REAL|FLOA|DOUB|NUMERIC|DECIMAL/.test(base)) return 'number';
  if (/BOOL/.test(base)) return 'boolean';
  if (/DATETIME|TIMESTAMP/.test(base)) return 'datetime';
  if (/^DATE$/.test(base)) return 'date';
  if (/BLOB/.test(base)) {
    notes.push(
      `${path}: BLOB is represented as JSON metadata for author review; binary content is never imported.`
    );
    return 'json';
  }
  fail('unsupported-type', path, 'uses a SQLite type outside the documented mapping');
}

function plural(name: string): string {
  if (name.endsWith('s')) return name;
  return `${name}s`;
}

/** Parse bounded CREATE TABLE text into a validated, value-free blueprint draft. */
export function importSqliteSchema(
  sql: string,
  options: SqliteSchemaOptions = {}
): SqliteSchemaResult {
  const limits = parseLimits(options);
  if (new TextEncoder().encode(sql).length > limits.maxBytes) {
    fail('input-too-large', 'sql', `exceeds the ${limits.maxBytes}-byte limit`);
  }
  const notes: string[] = [];
  const tables = new Parser(tokenize(sql), limits, notes).parse();
  const sourceToEntity = new Map(
    tables.map((table) => [table.sourceName.toLowerCase(), table.name])
  );
  const usedEntityNames = new Set<string>();
  for (const table of tables) {
    if (usedEntityNames.has(table.name))
      fail('invalid-ddl', 'tables', 'table names normalize to a duplicate entity name');
    usedEntityNames.add(table.name);
  }
  const primaryKeys: SqlitePrimaryKeyDraft[] = [];
  const entityInputs = tables.map((table) => {
    const usedFields = new Set<string>();
    const sourceFieldNames = new Map<string, string>();
    const fields: Record<string, unknown>[] = [];
    const primaryFields = table.primaryKey.map((key) => {
      const column = table.columns.find(
        (candidate) => candidate.sourceName.toLowerCase() === key.toLowerCase()
      );
      if (!column)
        fail('invalid-reference', `tables.${table.name}.primaryKey`, 'names an unknown column');
      return column;
    });
    const platformId =
      primaryFields.length === 1 &&
      primaryFields[0]?.sourceName.toLowerCase() === 'id' &&
      primaryFields[0]?.kind === 'INTEGER';
    const pkNames: string[] = [];
    for (const column of table.columns) {
      if (column.sourceName.toLowerCase() === 'id' && platformId) continue;
      let sourceField = column.sourceName;
      let relation: ForeignKey | undefined;
      if (column.inlineReference)
        relation = { ...column.inlineReference, columns: [column.sourceName] };
      else
        relation = table.foreignKeys.find(
          (key) =>
            key.columns.length === 1 &&
            key.columns[0]?.toLowerCase() === column.sourceName.toLowerCase()
        );
      if (relation) {
        const targetName = sourceToEntity.get(relation.target.toLowerCase());
        if (!targetName)
          fail(
            'invalid-reference',
            `tables.${table.name}.columns.${column.name}`,
            'references an undeclared table'
          );
        const targetTable = tables.find((candidate) => candidate.name === targetName);
        const targetColumn = relation.targetColumns[0];
        if (relation.targetColumns.length > 1 || !targetTable)
          fail(
            'unsupported-ddl',
            `tables.${table.name}.columns.${column.name}`,
            'composite foreign keys are not representable'
          );
        if (
          targetColumn &&
          !targetTable.columns.some(
            (candidate) => candidate.sourceName.toLowerCase() === targetColumn.toLowerCase()
          )
        ) {
          fail(
            'invalid-reference',
            `tables.${table.name}.columns.${column.name}`,
            'references an unknown target column'
          );
        }
        sourceField = sourceField.replace(/_?id$/i, '') || sourceField;
        const name = fieldName(sourceField, `field${fields.length + 1}`, usedFields);
        sourceFieldNames.set(column.sourceName.toLowerCase(), name);
        fields.push({
          name,
          label: safeName(sourceField, 'Relation').label,
          kind: 'relation',
          required: column.notNull || column.primaryKey,
          to: targetName,
          cardinality: 'one',
          onDelete: relation.onDelete,
        });
        continue;
      }
      const name = fieldName(sourceField, `field${fields.length + 1}`, usedFields);
      sourceFieldNames.set(column.sourceName.toLowerCase(), name);
      const kind = fieldKind(column.kind, `tables.${table.name}.columns.${name}`, notes);
      fields.push({
        name,
        label: safeName(sourceField, 'Field').label,
        kind,
        required: column.notNull || column.primaryKey,
        ...(kind === 'text' ? { maxLength: 200 } : {}),
        ...(kind === 'json' && /BLOB/i.test(column.kind) ? {} : {}),
      });
      if (table.primaryKey.some((key) => key.toLowerCase() === column.sourceName.toLowerCase()))
        pkNames.push(name);
    }
    for (const foreignKey of table.foreignKeys) {
      if (foreignKey.columns.length !== 1)
        fail(
          'unsupported-ddl',
          `tables.${table.name}.foreignKeys`,
          'composite foreign keys are not representable'
        );
      const column = table.columns.find(
        (candidate) => candidate.sourceName.toLowerCase() === foreignKey.columns[0]?.toLowerCase()
      );
      if (!column)
        fail(
          'invalid-reference',
          `tables.${table.name}.foreignKeys`,
          'names an unknown local column'
        );
      if (!sourceFieldNames.has(column.sourceName.toLowerCase())) {
        const targetName = sourceToEntity.get(foreignKey.target.toLowerCase());
        if (!targetName)
          fail(
            'invalid-reference',
            `tables.${table.name}.foreignKeys`,
            'references an undeclared table'
          );
        const relName = fieldName(
          column.sourceName.replace(/_?id$/i, '') || column.sourceName,
          `field${fields.length + 1}`,
          usedFields
        );
        sourceFieldNames.set(column.sourceName.toLowerCase(), relName);
        fields.push({
          name: relName,
          label: safeName(column.sourceName, 'Relation').label,
          kind: 'relation',
          required: column.notNull || column.primaryKey,
          to: targetName,
          cardinality: 'one',
          onDelete: foreignKey.onDelete,
        });
      }
    }
    if (fields.length === 0) {
      fields.push({ name: 'name', label: 'Name', kind: 'text', maxLength: 200, required: false });
      notes.push(
        `${table.label}: added a blank Name field because the only declared column is SQLite's platform id.`
      );
    }
    const title =
      fields.find((field) =>
        ['text', 'longText', 'integer', 'email', 'url', 'phone'].includes(String(field.kind))
      ) ?? fields[0];
    const mappedKeys = primaryFields
      .map((column) => sourceFieldNames.get(column.sourceName.toLowerCase()))
      .filter((name): name is string => Boolean(name));
    primaryKeys.push({
      entity: table.name,
      fields: mappedKeys,
      representedByPlatformId: platformId,
    });
    if (primaryFields.length > 0 && !platformId)
      notes.push(
        `${table.label}: primary-key columns are marked required; uniqueness is not represented by blueprint fields.`
      );
    if (platformId)
      notes.push(`${table.label}: INTEGER PRIMARY KEY maps to Protoyard's generated platform id.`);
    return {
      name: table.name,
      plural: plural(table.name),
      label: table.label,
      fields,
      titleField: title?.name,
      searchable: fields
        .filter((field) => ['text', 'email', 'url', 'phone'].includes(String(field.kind)))
        .slice(0, 3)
        .map((field) => String(field.name)),
    };
  });
  for (const table of tables) {
    for (const foreignKey of table.foreignKeys) {
      if (foreignKey.columns.length !== 1)
        fail(
          'unsupported-ddl',
          `tables.${table.name}.foreignKeys`,
          'composite foreign keys are not representable'
        );
      const local = table.columns.find(
        (column) => column.sourceName.toLowerCase() === foreignKey.columns[0]?.toLowerCase()
      );
      const targetName = sourceToEntity.get(foreignKey.target.toLowerCase());
      const target = tables.find((candidate) => candidate.name === targetName);
      if (!local || !targetName || !target)
        fail(
          'invalid-reference',
          `tables.${table.name}.foreignKeys`,
          'references an unknown table or column'
        );
      if (foreignKey.targetColumns.length > 1)
        fail(
          'unsupported-ddl',
          `tables.${table.name}.foreignKeys`,
          'composite foreign keys are not representable'
        );
      if (
        foreignKey.targetColumns[0] &&
        !target.columns.some(
          (column) => column.sourceName.toLowerCase() === foreignKey.targetColumns[0]?.toLowerCase()
        )
      ) {
        fail(
          'invalid-reference',
          `tables.${table.name}.foreignKeys`,
          'references an unknown target column'
        );
      }
    }
  }
  const parsed = parseBlueprint({
    formatVersion: 1,
    name: 'Imported SQLite schema',
    entities: entityInputs,
    roles: [{ name: 'owner', permissions: { '*': ['*'] } }],
  });
  return { entities: parsed.entities, primaryKeys, notes, tablesImported: tables.length };
}
