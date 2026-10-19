import { parseInput, parseScenario, type Row } from '@protoyard/core';
import {
  createGenerateContext,
  GEO_REGIONS,
  inGeoRegion,
  validateWorld,
} from '@protoyard/scenarios';
import { describe, expect, it } from 'vitest';
import { entityCsvColumns, serializeEntityCsv, validateCsv } from '../src/csv.ts';
import { createBlueprintGenerator, DEFAULT_GEO_REGION } from '../src/generator.ts';
import {
  type BlueprintInput,
  defaultForField,
  deriveDatabaseVersions,
  deriveInputSchemas,
  deriveIntegrity,
  deriveStores,
  diffBlueprints,
  parseBlueprint,
  safeParseBlueprint,
} from '../src/index.ts';

/** A fictional depot network: depots with a required location, stops with an optional one. */
function input(): BlueprintInput {
  return {
    formatVersion: 1,
    name: 'Depots',
    entities: [
      {
        name: 'depot',
        plural: 'depots',
        fields: [
          { name: 'name', kind: 'text', required: true },
          { name: 'location', kind: 'geo', required: true, region: 'harbor-bay' },
        ],
        titleField: 'name',
        features: { csv: true },
      },
      {
        name: 'stop',
        plural: 'stops',
        fields: [
          { name: 'label', kind: 'text', required: true },
          { name: 'depot', kind: 'relation', to: 'depot' },
          { name: 'position', kind: 'geo' },
        ],
        titleField: 'label',
      },
    ],
    roles: [{ name: 'owner', permissions: { '*': ['*'] } }],
    screens: [{ type: 'map', entity: 'stop', geoField: 'position' }],
  };
}
const blueprint = parseBlueprint(input());
const depot = blueprint.entities[0]!;
const stop = blueprint.entities[1]!;

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

describe('geo field schema', () => {
  it('parses geo fields with and without a region, and a map screen over one', () => {
    expect(depot.fields[1]).toMatchObject({ kind: 'geo', region: 'harbor-bay', required: true });
    expect(stop.fields[2]).toMatchObject({ kind: 'geo' });
    expect(blueprint.screens[0]).toMatchObject({ type: 'map', geoField: 'position' });
  });

  it('rejects unknown regions and indexing, searching or sorting by a geo field', () => {
    expect(
      issuesAfter((bp) => {
        bp.entities[0]!.fields[1]!.region = 'atlantis';
      })[0]
    ).toMatch(/^entities\.0\.fields\.1\.region: Invalid option/);
    expect(
      issuesAfter((bp) => {
        bp.entities[0]!.indexes = ['location'];
      })
    ).toContain('entities.0.indexes.0: geo field "location" cannot be indexed');
    expect(
      issuesAfter((bp) => {
        bp.entities[0]!.searchable = ['location'];
      })
    ).toContain('entities.0.searchable.0: geo field "location" cannot be searched');
    expect(
      issuesAfter((bp) => {
        bp.entities[0]!.defaultSort = { field: 'location' };
      })
    ).toContain('entities.0.defaultSort.field: geo field "location" cannot sort a list');
  });

  it('keeps geo out of the Dexie store string', () => {
    expect(deriveStores(blueprint).depots).toBe('id, name, createdAt, updatedAt');
    expect(deriveStores(blueprint).stops).toBe('id, depotId, label, createdAt, updatedAt');
  });
});

describe('geo validation', () => {
  const { create, update } = deriveInputSchemas(stop);
  const depotSchemas = deriveInputSchemas(depot);

  it('accepts objects and "lat, lng" text, rounding to 5 decimals', () => {
    expect(
      parseInput(create, { label: 'A', position: { lat: '1.234567', lng: 2 } }).position
    ).toEqual({ lat: 1.23457, lng: 2 });
    expect(parseInput(update, { position: '-45.5, 170.25' }).position).toEqual({
      lat: -45.5,
      lng: 170.25,
    });
  });

  it('treats both halves blank as no value, and requires both for a required field', () => {
    expect(parseInput(create, { label: 'A', position: { lat: '', lng: '' } }).position).toBeNull();
    expect(parseInput(create, { label: 'A' }).position).toBeNull();
    expect(() =>
      parseInput(depotSchemas.create, { name: 'North', location: { lat: '', lng: '' } })
    ).toThrow(/Location is required/);
  });

  it('enforces latitude and longitude bounds', () => {
    expect(() => parseInput(update, { position: { lat: -90.01, lng: 0 } })).toThrow(
      /latitude must be between -90 and 90/
    );
    expect(() => parseInput(update, { position: { lat: 0, lng: 181 } })).toThrow(
      /longitude must be between -180 and 180/
    );
  });
});

describe('geo generation', () => {
  const ctx = (seed: number) =>
    createGenerateContext(
      parseScenario({
        id: 'geo',
        name: 'Geo',
        seed,
        referenceTime: '2026-06-01T09:00:00.000Z',
        density: 'dense',
      })
    );
  const generator = createBlueprintGenerator(blueprint);

  it('is deterministic per seed and differs across seeds', () => {
    const a = generator.generate(ctx(7));
    expect(generator.generate(ctx(7))).toEqual(a);
    expect(generator.generate(ctx(8)).tables.depots).not.toEqual(a.tables.depots);
  });

  it('places points inside the field region (default region otherwise) and fills required ones', () => {
    const world = generator.generate(ctx(7));
    const depots = world.tables.depots as Row[];
    expect(depots.length).toBeGreaterThan(0);
    for (const row of depots) {
      expect(row.location).not.toBeNull();
      expect(inGeoRegion(row.location as { lat: number; lng: number }, 'harbor-bay')).toBe(true);
    }
    const positions = (world.tables.stops as Row[]).map((row) => row.position);
    expect(positions.some((p) => p === null) || positions.length < 10).toBe(true);
    for (const p of positions.filter(Boolean)) {
      expect(inGeoRegion(p as { lat: number; lng: number }, DEFAULT_GEO_REGION)).toBe(true);
    }
    expect(Object.keys(GEO_REGIONS)).toContain(DEFAULT_GEO_REGION);
  });

  it('produces a world that passes integrity and validates against the input schema', () => {
    const world = generator.generate(ctx(11));
    expect(validateWorld(world, deriveIntegrity(blueprint))).toEqual([]);
    const { update } = deriveInputSchemas(depot);
    for (const row of world.tables.depots as Row[]) {
      expect(parseInput(update, { location: row.location }).location).toEqual(row.location);
    }
  });
});

describe('geo CSV', () => {
  it('exports two columns and round-trips through import', () => {
    expect(entityCsvColumns(depot).map((c) => c.header)).toEqual([
      'Name',
      'locationLat',
      'locationLng',
    ]);
    const records = [
      { name: 'North pier', location: { lat: -30.4, lng: -18.6 } },
      { name: 'Old mill', location: { lat: -31.10001, lng: -19.2 } },
    ];
    const text = serializeEntityCsv(depot, records);
    expect(text.split('\r\n')[1]).toBe('North pier,-30.4,-18.6');
    const result = validateCsv(depot, text);
    expect(result.errors).toEqual([]);
    expect(result.valid).toEqual(records);
  });

  it('matches "<label> lat" headers and reports a missing half', () => {
    const ok = validateCsv(depot, 'name,Location lng,Location lat\nSouth,-17.9,-31.5');
    expect(ok.valid).toEqual([{ name: 'South', location: { lat: -31.5, lng: -17.9 } }]);
    const missing = validateCsv(depot, 'name,locationLat\nSouth,-31.5');
    expect(missing.errors).toEqual([
      { row: 1, field: 'location', message: 'Location needs a latitude and a longitude' },
    ]);
    const optional = validateCsv(stop, 'label,positionLat,positionLng\nGate,,');
    expect(optional.valid).toEqual([{ label: 'Gate', depotId: null, position: null }]);
  });
});

describe('geo migrations', () => {
  it('adding an optional geo field backfills null without a store change for the field', () => {
    const prev = parseBlueprint({ ...input(), screens: [], entities: [input().entities[0]!] });
    const next = parseBlueprint({
      ...input(),
      screens: [],
      entities: [
        {
          ...input().entities[0]!,
          fields: [...input().entities[0]!.fields, { name: 'dock', kind: 'geo' }],
        },
      ],
    });
    expect(defaultForField(next.entities[0]!.fields[2]!)).toBeNull();
    const migration = diffBlueprints(prev, next, { fromVersion: 1 });
    expect(migration?.ops).toEqual([
      { op: 'backfill', table: 'depots', field: 'dock', value: null },
    ]);

    const base = { ...input(), screens: [], entities: [input().entities[0]!] };
    const withHistory = parseBlueprint({
      ...base,
      entities: next.entities,
      history: [{ schemaVersion: 1, blueprint: base as Record<string, unknown> }],
    } as BlueprintInput);
    const versions = deriveDatabaseVersions(withHistory);
    expect(versions.map((v) => v.version)).toEqual([1, 2]);
  });
});
