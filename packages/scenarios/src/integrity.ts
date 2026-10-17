import type { IntegrityRules, Row, WorldSeed } from '@protoyard/core';

/**
 * Referential-integrity rules for a generated world (core `IntegrityRules`:
 * `relations` are foreign keys, nullable allowed, arrays checked per item;
 * `timestamps` must lie between the row's organization creation — or the
 * oldest organization — and the reference time). Generators must produce zero
 * violations; the runtime checks on every scenario load so a broken generator
 * fails at authoring time, not as a mysterious UI bug.
 */
export interface WorldIntegrity extends IntegrityRules {
  /** Scenario reference time; enables "nothing happens in the future" checks. */
  referenceTime?: string;
}

export interface IntegrityViolation {
  table: string;
  rowId: string;
  field?: string;
  message: string;
}

const RESERVED_SOURCES: Record<string, (seed: WorldSeed) => readonly Row[]> = {
  py_organizations: (seed) => seed.organizations as unknown as Row[],
  py_personas: (seed) => seed.personas as unknown as Row[],
  py_memberships: (seed) => seed.memberships as unknown as Row[],
  py_events: (seed) => (seed.events ?? []) as unknown as Row[],
};

function rowsOf(seed: WorldSeed, table: string): readonly Row[] | undefined {
  const reserved = RESERVED_SOURCES[table];
  return reserved ? reserved(seed) : seed.tables?.[table];
}

function parseTime(value: unknown): number | undefined {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string' || typeof value === 'number') {
    const ms = typeof value === 'number' ? value : Date.parse(value);
    return Number.isNaN(ms) ? undefined : ms;
  }
  return undefined;
}

/**
 * Checks a seed. Built-in checks always run: unique ids per table, memberships
 * point at existing personas/organizations, identity dates are not in the
 * future and nobody joined before their organization existed.
 */
export function validateWorld(
  seed: WorldSeed,
  integrity: WorldIntegrity = {}
): IntegrityViolation[] {
  const violations: IntegrityViolation[] = [];
  const refMs = integrity.referenceTime ? Date.parse(integrity.referenceTime) : undefined;
  const push = (table: string, row: Row | { id?: unknown }, message: string, field?: string) => {
    violations.push({
      table,
      rowId: typeof row.id === 'string' ? row.id : String(row.id),
      ...(field ? { field } : {}),
      message,
    });
  };

  const ids = new Map<string, Set<string>>();
  const tableNames = [...Object.keys(RESERVED_SOURCES), ...Object.keys(seed.tables ?? {})];
  for (const table of tableNames) {
    const set = new Set<string>();
    for (const row of rowsOf(seed, table) ?? []) {
      if (typeof row.id !== 'string' || row.id.length === 0) {
        push(table, row, 'row has no string "id"', 'id');
        continue;
      }
      if (set.has(row.id)) push(table, row, `duplicate id "${row.id}"`, 'id');
      set.add(row.id);
    }
    ids.set(table, set);
  }

  const orgCreated = new Map<string, number>();
  for (const org of seed.organizations) {
    const ms = parseTime(org.createdAt);
    if (ms === undefined) push('py_organizations', org, 'createdAt is not a date', 'createdAt');
    else {
      orgCreated.set(org.id, ms);
      if (refMs !== undefined && ms > refMs) {
        push(
          'py_organizations',
          org,
          'organization is created after the reference time',
          'createdAt'
        );
      }
    }
  }
  const oldestOrg = orgCreated.size ? Math.min(...orgCreated.values()) : undefined;

  for (const persona of seed.personas) {
    const ms = parseTime(persona.joinedAt);
    if (ms === undefined) push('py_personas', persona, 'joinedAt is not a date', 'joinedAt');
    else if (refMs !== undefined && ms > refMs) {
      push('py_personas', persona, 'persona joins after the reference time', 'joinedAt');
    }
  }

  const personaIds = ids.get('py_personas') ?? new Set();
  const orgIds = ids.get('py_organizations') ?? new Set();
  for (const membership of seed.memberships) {
    if (!personaIds.has(membership.personaId)) {
      push('py_memberships', membership, `unknown persona "${membership.personaId}"`, 'personaId');
    }
    if (!orgIds.has(membership.organizationId)) {
      push(
        'py_memberships',
        membership,
        `unknown organization "${membership.organizationId}"`,
        'organizationId'
      );
    }
    const joined = parseTime(membership.joinedAt);
    const created = orgCreated.get(membership.organizationId);
    if (joined !== undefined && created !== undefined && joined < created) {
      push(
        'py_memberships',
        membership,
        'member joined before the organization existed',
        'joinedAt'
      );
    }
  }

  for (const [table, fields] of Object.entries(integrity.relations ?? {})) {
    const rows = rowsOf(seed, table);
    if (!rows) continue;
    for (const [field, target] of Object.entries(fields)) {
      const targetIds = ids.get(target);
      if (!targetIds) {
        violations.push({
          table,
          rowId: '*',
          field,
          message: `relation target table "${target}" is not in the seed`,
        });
        continue;
      }
      for (const row of rows) {
        const value = row[field];
        if (value === null || value === undefined) continue;
        const refs = Array.isArray(value) ? value : [value];
        for (const ref of refs) {
          if (typeof ref !== 'string' || !targetIds.has(ref)) {
            push(table, row, `${field} → "${String(ref)}" does not exist in ${target}`, field);
          }
        }
      }
    }
  }

  for (const [table, fields] of Object.entries(integrity.timestamps ?? {})) {
    for (const row of rowsOf(seed, table) ?? []) {
      const orgId = typeof row.organizationId === 'string' ? row.organizationId : undefined;
      const floor = (orgId ? orgCreated.get(orgId) : undefined) ?? oldestOrg;
      for (const field of fields) {
        const raw = row[field];
        if (raw === null || raw === undefined) continue;
        const ms = parseTime(raw);
        if (ms === undefined) {
          push(table, row, `${field} is not a date`, field);
          continue;
        }
        if (refMs !== undefined && ms > refMs) {
          push(table, row, `${field} is after the reference time`, field);
        }
        if (floor !== undefined && ms < floor) {
          push(table, row, `${field} is before the organization was created`, field);
        }
      }
    }
  }

  return violations;
}

export class WorldIntegrityError extends Error {
  readonly scenarioId: string;
  readonly violations: readonly IntegrityViolation[];

  constructor(scenarioId: string, violations: readonly IntegrityViolation[]) {
    const preview = violations
      .slice(0, 10)
      .map((v) => `  • ${v.table}#${v.rowId}${v.field ? `.${v.field}` : ''}: ${v.message}`)
      .join('\n');
    const more = violations.length > 10 ? `\n  …and ${violations.length - 10} more` : '';
    super(
      `Generator for scenario "${scenarioId}" produced ${violations.length} integrity violation(s):\n${preview}${more}`
    );
    this.name = 'WorldIntegrityError';
    this.scenarioId = scenarioId;
    this.violations = violations;
  }
}
