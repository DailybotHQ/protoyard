import { validateWorld } from '@protoyard/scenarios';
import { describe, expect, it } from 'vitest';
import { contextFor } from '../../../tests/support/generate-context.ts';
import { createHarness } from '../../../tests/support/runtime.ts';
import type {
  Alert,
  Device,
  Incident,
  MonitoringDatabase,
  Telemetry,
} from '../src/database/schema.ts';
import { definition } from '../src/prototype.ts';
import { generateMonitoringWorld } from '../src/scenarios/generators.ts';
import { scenarios } from '../src/scenarios/index.ts';

type MonitoringWorld = {
  devices: Device[];
  telemetry: Telemetry[];
  alerts: Alert[];
  incidents: Incident[];
};
const worldRows = (tables: Record<string, unknown>) => tables as unknown as MonitoringWorld;

describe('iot-monitoring scenario generation', () => {
  it.each(scenarios.map((scenario) => scenario.id))(
    'is deterministic and valid for scenario %s',
    async (scenarioId) => {
      const ctx = contextFor(definition.scenarios, scenarioId);
      const first = generateMonitoringWorld(ctx);
      const second = generateMonitoringWorld(contextFor(definition.scenarios, scenarioId));
      const rows = worldRows(first.tables);
      expect(second).toEqual(first);
      expect(() =>
        validateWorld(first, { ...definition.integrity, referenceTime: ctx.scenario.referenceTime })
      ).not.toThrow();
      expect(rows.devices).toHaveLength(
        Number(
          (ctx.scenario.generators.monitoring as { devices?: number } | undefined)?.devices ?? 12
        )
      );
      expect(rows.telemetry.length).toBeGreaterThanOrEqual(rows.devices.length);
    }
  );

  it('generates at least one thousand devices and bounded per-device history for massive', () => {
    const world = worldRows(
      generateMonitoringWorld(contextFor(definition.scenarios, 'massive')).tables
    );
    expect(world.devices).toHaveLength(1_000);
    expect(world.telemetry).toHaveLength(7_000);
    expect(world.devices.every((row) => row.point.lat < 0 && row.point.lng < 0)).toBe(true);
  });

  it('seeds an active threshold alert and corresponding incident in active and storm scenarios', () => {
    for (const id of ['active', 'storm']) {
      const world = worldRows(generateMonitoringWorld(contextFor(definition.scenarios, id)).tables);
      expect(world.alerts.length).toBeGreaterThan(0);
      expect(world.incidents.some((incident) => incident.status === 'investigating')).toBe(true);
      expect(world.alerts.every((alert) => alert.status === 'open')).toBe(true);
    }
  });

  it('keeps the quiet scenario below thresholds with no alerts', () => {
    const world = worldRows(
      generateMonitoringWorld(contextFor(definition.scenarios, 'quiet')).tables
    );
    expect(world.alerts).toHaveLength(0);
    expect(world.telemetry.every((row) => !row.breached)).toBe(true);
  });

  it('stores telemetry keyed by device and UTC day with a threshold result', () => {
    const world = worldRows(
      generateMonitoringWorld(contextFor(definition.scenarios, 'active')).tables
    );
    const ids = world.telemetry.map((row) => row.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(
      world.telemetry.every((row) => row.id === `${row.deviceId}:${row.at.slice(0, 10)}`)
    ).toBe(true);
    expect(world.telemetry.every((row) => row.breached === row.value >= row.threshold)).toBe(true);
  });
});

describe('monitoring timeline', () => {
  it('records stable per-device daily telemetry and creates threshold incidents on time advance', async () => {
    const harness = createHarness<MonitoringDatabase>(definition);
    try {
      const runtime = await harness.boot('active');
      const before = await runtime.db.telemetry.count();
      await runtime.scenarios.advance({ days: 1 });
      const rows = await runtime.db.telemetry.toArray();
      expect(rows.length).toBe(before + 12);
      expect(rows.filter((row) => row.at.startsWith('2026-10-20'))).toHaveLength(12);
      const events = await runtime.db.table('py_events').toArray();
      expect(
        events.some((event: { id: string }) =>
          event.id.startsWith('telemetry:device_0001:2026-10-20')
        )
      ).toBe(true);
      expect(await runtime.db.incidents.get('incident:device_0001')).toMatchObject({
        status: 'monitoring',
        updatedAt: '2026-10-20T00:00:00.000Z',
        normalSamples: 1,
      });
    } finally {
      harness.closeAll();
    }
  });

  it('produces identical next-day telemetry for repeated scenario loads', async () => {
    const results = [];
    for (let run = 0; run < 2; run++) {
      const harness = createHarness<MonitoringDatabase>(definition);
      try {
        const runtime = await harness.boot('active');
        await runtime.scenarios.advance({ days: 1 });
        results.push(
          await runtime.db.telemetry.where('at').above('2026-10-19T23:59:59.999Z').toArray()
        );
      } finally {
        harness.closeAll();
      }
    }
    expect(results[1]).toEqual(results[0]);
  });

  it('keeps quiet telemetry clear during simulated time', async () => {
    const harness = createHarness<MonitoringDatabase>(definition);
    try {
      const runtime = await harness.boot('quiet');
      await runtime.scenarios.advance({ days: 1 });
      expect(await runtime.db.alerts.toArray()).toHaveLength(0);
      expect((await runtime.db.telemetry.toArray()).some((row) => row.breached)).toBe(false);
    } finally {
      harness.closeAll();
    }
  });
});
