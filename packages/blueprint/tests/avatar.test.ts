import {
  type DataDensity,
  PermissionDeniedError,
  type PrototypeRuntime,
  parseScenario,
  type Row,
  ValidationError,
} from '@protoyard/core';
import { createGenerateContext, validateWorld } from '@protoyard/scenarios';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createBlueprintDefinition,
  helpdeskBlueprint,
} from '../../../tests/fixtures/blueprint-prototype.ts';
import { createHarness } from '../../../tests/support/runtime.ts';
import { serializeEntityCsv, validateCsv } from '../src/csv.ts';
import { createBlueprintGenerator } from '../src/generator.ts';
import {
  AVATAR_IDS,
  avatarFields,
  type Blueprint,
  type BlueprintInput,
  createAuditService,
  createEntityServices,
  defaultForField,
  deriveIntegrity,
  deriveStores,
  diffBlueprints,
  isAvatarId,
  nextAvatar,
  parseBlueprint,
  primaryAvatarField,
  safeParseBlueprint,
} from '../src/index.ts';

/** A fictional clinic: patients with a face, visits without one. */
function input(): BlueprintInput {
  return {
    formatVersion: 1,
    name: 'Clinic',
    entities: [
      {
        name: 'patient',
        plural: 'patients',
        seedCount: 12,
        fields: [
          { name: 'name', kind: 'text', required: true, fake: 'person.fullName' },
          { name: 'avatar', kind: 'avatar', label: 'Photo' },
          { name: 'backup', kind: 'avatar' },
        ],
        titleField: 'name',
        features: { csv: true },
      },
      {
        name: 'visit',
        plural: 'visits',
        fields: [
          { name: 'reason', kind: 'text', required: true },
          { name: 'patient', kind: 'relation', to: 'patient' },
        ],
        titleField: 'reason',
      },
    ],
    roles: [{ name: 'owner', permissions: { '*': ['*'] } }],
  };
}
const blueprint = parseBlueprint(input());
const patient = blueprint.entities[0]!;

type Mutable = {
  entities: Array<Record<string, unknown> & { fields: Array<Record<string, unknown>> }>;
};
function issuesAfter(mutate: (bp: Mutable) => void): string[] {
  const bp = input() as unknown as Mutable;
  mutate(bp);
  const result = safeParseBlueprint(bp);
  return result.success
    ? []
    : result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
}

describe('avatar field schema', () => {
  it('parses an optional avatar field and finds the primary one', () => {
    expect(patient.fields[1]).toEqual({
      name: 'avatar',
      kind: 'avatar',
      label: 'Photo',
      required: false,
      sensitive: false,
    });
    expect(avatarFields(patient).map((f) => f.name)).toEqual(['avatar', 'backup']);
    expect(primaryAvatarField(patient)?.name).toBe('avatar');
    expect(primaryAvatarField(blueprint.entities[1]!)).toBeUndefined();
  });

  it('rejects unknown keys and indexing, searching or sorting by an avatar field', () => {
    expect(
      issuesAfter((bp) => {
        bp.entities[0]!.fields[1]!.region = 'metro-grid';
      })[0]
    ).toMatch(/^entities\.0\.fields\.1: Unrecognized key/);
    expect(
      issuesAfter((bp) => {
        bp.entities[0]!.indexes = ['avatar'];
      })
    ).toContain('entities.0.indexes.0: avatar field "avatar" cannot be indexed');
    expect(
      issuesAfter((bp) => {
        bp.entities[0]!.searchable = ['avatar'];
      })
    ).toContain('entities.0.searchable.0: avatar field "avatar" cannot be searched');
    expect(
      issuesAfter((bp) => {
        bp.entities[0]!.defaultSort = { field: 'avatar' };
      })
    ).toContain('entities.0.defaultSort.field: avatar field "avatar" cannot sort a list');
    expect(
      issuesAfter((bp) => {
        bp.entities[0]!.titleField = 'avatar';
      })
    ).toContain('entities.0.titleField: titleField "avatar" must be a text-like field, not avatar');
  });

  it('keeps avatars out of the Dexie store string and backfills null on migration', () => {
    expect(deriveStores(blueprint).patients).toBe('id, name, createdAt, updatedAt');
    expect(defaultForField(patient.fields[1]!)).toBeNull();
    const prev = parseBlueprint({
      ...input(),
      entities: [{ ...input().entities[0]!, fields: [input().entities[0]!.fields[0]!] }],
    });
    const next = parseBlueprint({ ...input(), entities: [input().entities[0]!] });
    expect(diffBlueprints(prev, next, { fromVersion: 1 })?.ops).toEqual([
      { op: 'backfill', table: 'patients', field: 'avatar', value: null },
      { op: 'backfill', table: 'patients', field: 'backup', value: null },
    ]);
  });
});

describe('avatar CSV', () => {
  it('exports the id and imports only library ids', () => {
    const csv = serializeEntityCsv(patient, [{ name: 'Ada Example', avatar: 'av-007' }]);
    expect(csv.split('\r\n')).toEqual(['Name,Photo,Backup', 'Ada Example,av-007,']);
    const ok = validateCsv(patient, 'name,Photo\nAda Example,av-007');
    expect(ok.valid).toEqual([{ name: 'Ada Example', avatar: 'av-007', backup: null }]);
    const bad = validateCsv(patient, 'name,avatar\nAda Example,https://example.com/a.png');
    expect(bad.errors).toEqual([
      { row: 1, field: 'avatar', message: 'Photo must be a library face from av-001 to av-175' },
    ]);
  });
});

function generate(seed: number, density: DataDensity = 'normal', bp: Blueprint = blueprint) {
  const scenario = parseScenario({
    id: 'clinic',
    name: 'Clinic',
    seed,
    density,
    referenceTime: '2026-06-01T09:00:00.000Z',
    organization: { ageDays: 60, size: 6 },
  });
  return {
    scenario,
    world: createBlueprintGenerator(bp).generate(createGenerateContext(scenario)),
  };
}

describe('avatar generation', () => {
  it('gives every row distinct, valid, seeded faces that avoid the team', () => {
    const { scenario, world } = generate(21);
    const rows = world.tables.patients as Row[];
    expect(rows).toHaveLength(12);
    const faces = rows.map((row) => row.avatar);
    expect(faces.every(isAvatarId)).toBe(true);
    expect(rows.map((row) => row.backup).every(isAvatarId)).toBe(true);
    expect(new Set(faces).size).toBe(rows.length);
    const team = new Set(world.personas.map((persona) => persona.avatar));
    expect(faces.filter((face) => team.has(face as string))).toEqual([]);
    expect(
      validateWorld(world, { ...deriveIntegrity(blueprint), referenceTime: scenario.referenceTime })
    ).toEqual([]);
  });

  it('is deterministic per seed and stable when rows are added', () => {
    const faces = (seed: number, density: DataDensity = 'normal') =>
      (generate(seed, density).world.tables.patients as Row[]).map((row) => row.avatar);
    expect(faces(21)).toEqual(faces(21));
    expect(faces(22)).not.toEqual(faces(21));
    const dense = faces(21, 'dense');
    expect(dense.length).toBeGreaterThan(12);
    expect(dense.slice(0, 12)).toEqual(faces(21));
  });

  it('does not shift the other fields of the row', () => {
    const without = parseBlueprint({
      ...input(),
      entities: [
        { ...input().entities[0]!, fields: [input().entities[0]!.fields[0]!] },
        input().entities[1]!,
      ],
    });
    const names = (bp: Blueprint) =>
      (generate(21, 'normal', bp).world.tables.patients as Row[]).map((row) => row.name);
    expect(names(blueprint)).toEqual(names(without));
  });
});

describe('nextAvatar', () => {
  it('is deterministic, never repeats the current face and visits every face', () => {
    const key = 'patient:patient_0001:avatar';
    expect(nextAvatar('av-010', key)).toBe(nextAvatar('av-010', key));
    expect(isAvatarId(nextAvatar(null, key))).toBe(true);
    expect(nextAvatar('not-a-face', key)).toBe(nextAvatar(undefined, key));
    const seen = new Set<string>();
    let face: string = nextAvatar(null, key);
    for (let i = 0; i < AVATAR_IDS.length; i++) {
      const next = nextAvatar(face, key);
      expect(next).not.toBe(face);
      seen.add(next);
      face = next;
    }
    expect(seen.size).toBe(AVATAR_IDS.length);
    expect(nextAvatar('av-010', 'patient:patient_0002:avatar')).not.toBe(nextAvatar('av-010', key));
  });
});

describe('EntityService.shuffleAvatar', () => {
  // The help desk fixture with a face on customers (avatars add no index, so stores match).
  const withFaces = structuredClone(helpdeskBlueprint);
  withFaces.entities[0]!.fields.push({
    name: 'avatar',
    kind: 'avatar',
    required: false,
    sensitive: false,
  });
  withFaces.entities[0]!.features.audit = true;
  const definition = () => {
    const base = createBlueprintDefinition('avatar-fixture');
    return {
      ...base,
      database: { ...base.database, versions: [{ version: 1, stores: deriveStores(withFaces) }] },
    };
  };

  let harness = createHarness(definition());
  beforeEach(() => {
    harness = createHarness(definition());
  });
  afterEach(() => harness.closeAll());

  async function boot(scenario = 'owner') {
    const runtime = await harness.boot(scenario);
    return { runtime, services: createEntityServices(runtime, withFaces) };
  }
  const customers = (runtime: PrototypeRuntime) =>
    (runtime.db as { table(name: string): { toArray(): Promise<Row[]> } })
      .table('customers')
      .toArray();

  it('saves the next deterministic face, audits it and survives a reload', async () => {
    const { runtime, services } = await boot();
    const created = await services.customer!.create({ name: 'Ada Example', avatar: 'av-010' });
    const row = await services.customer!.shuffleAvatar(created.id);
    expect(row.avatar).toBe(nextAvatar('av-010', `customer:${created.id}:avatar`));
    expect(row.avatar).not.toBe('av-010');
    expect(row.name).toBe('Ada Example');
    const again = await services.customer!.shuffleAvatar(created.id, 'avatar');
    expect(again.avatar).toBe(nextAvatar(row.avatar, `customer:${created.id}:avatar`));

    const history = await createAuditService(runtime, withFaces).listForRecord(
      'customer',
      created.id
    );
    expect(history[0]?.changes).toEqual({ avatar: { before: row.avatar, after: again.avatar } });

    const reloaded = await harness.reload(runtime);
    const stored = await createEntityServices(reloaded, withFaces).customer!.get(created.id);
    expect(stored?.avatar).toBe(again.avatar);
  });

  it('gives a face to a record that has none', async () => {
    const { services } = await boot();
    const created = await services.customer!.create({ name: 'Faceless Example' });
    expect(created.avatar).toBeNull();
    const row = await services.customer!.shuffleAvatar(created.id);
    expect(isAvatarId(row.avatar)).toBe(true);
  });

  it('checks the update capability and writes nothing when denied or offline', async () => {
    const viewer = await boot('viewer');
    const [first] = await viewer.services.customer!.list();
    const before = JSON.stringify(await customers(viewer.runtime));
    await expect(viewer.services.customer!.shuffleAvatar(first!.id)).rejects.toMatchObject({
      capability: 'customer:update',
    });
    await expect(viewer.services.customer!.shuffleAvatar(first!.id)).rejects.toBeInstanceOf(
      PermissionDeniedError
    );
    expect(JSON.stringify(await customers(viewer.runtime))).toBe(before);
    harness.closeAll();

    harness = createHarness(definition());
    const owner = await boot();
    const ownerBefore = JSON.stringify(await customers(owner.runtime));
    await owner.runtime.overrides.set({ environment: { network: 'offline' } });
    await expect(owner.services.customer!.shuffleAvatar('customer_0001')).rejects.toMatchObject({
      code: 'offline',
    });
    expect(JSON.stringify(await customers(owner.runtime))).toBe(ownerBefore);
  });

  it('rejects unknown fields, entities without avatars and missing records', async () => {
    const { services } = await boot();
    await expect(services.customer!.shuffleAvatar('customer_0001', 'name')).rejects.toEqual(
      new ValidationError({ field: 'Pick one of: avatar' })
    );
    await expect(services.ticket!.shuffleAvatar('ticket_0001')).rejects.toMatchObject({
      issues: { field: 'ticket has no avatar field' },
    });
    await expect(services.customer!.shuffleAvatar('customer_9999')).rejects.toMatchObject({
      code: 'not-found',
    });
  });
});
