import { PermissionDeniedError, SimulatedServiceError, ValidationError } from '@protoyard/core';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import type { MonitoringDatabase } from '../src/database/schema.ts';
import { createMonitoringServices } from '../src/domain/services.ts';
import { definition } from '../src/prototype.ts';

let harness = createHarness<MonitoringDatabase>(definition);
afterEach(() => harness.closeAll());
const fresh = () => {
  harness = createHarness<MonitoringDatabase>(definition);
};
async function openAlert(runtime: Awaited<ReturnType<typeof harness.boot>>) {
  const alert = await runtime.db.alerts.where('status').equals('open').first();
  if (!alert) throw new Error('active scenario has an open threshold alert');
  return alert;
}

describe('monitoring alert services on the real runtime', () => {
  it('acknowledges an alert and moves its incident into monitoring', async () => {
    fresh();
    const runtime = await harness.boot('active');
    const alert = await openAlert(runtime);
    await createMonitoringServices(runtime).acknowledgeAlert({ alertId: alert.id });
    expect(await runtime.db.alerts.get(alert.id)).toMatchObject({
      status: 'acknowledged',
      acknowledgedAt: runtime.clock.now().toISOString(),
    });
    expect(await runtime.db.incidents.get(`incident:${alert.deviceId}`)).toMatchObject({
      status: 'monitoring',
    });
  });

  it('resolves an alert and its incident through one persisted action', async () => {
    fresh();
    const runtime = await harness.boot('active');
    const alert = await openAlert(runtime);
    await createMonitoringServices(runtime).resolveAlert({ alertId: alert.id });
    expect(await runtime.db.alerts.get(alert.id)).toMatchObject({
      status: 'resolved',
      resolvedAt: runtime.clock.now().toISOString(),
    });
    expect(await runtime.db.incidents.get(`incident:${alert.deviceId}`)).toMatchObject({
      status: 'resolved',
      activeAlertId: null,
    });
  });

  it('survives a runtime reload after acknowledgement', async () => {
    fresh();
    let runtime = await harness.boot('active');
    const alert = await openAlert(runtime);
    await createMonitoringServices(runtime).acknowledgeAlert({ alertId: alert.id });
    runtime = await harness.reload(runtime);
    expect((await runtime.db.alerts.get(alert.id))?.status).toBe('acknowledged');
  });

  it('denies acknowledgement and resolution for a viewer without writes', async () => {
    fresh();
    const runtime = await harness.boot('active');
    const alert = await openAlert(runtime);
    const beforeAlerts = await runtime.db.alerts.orderBy('id').toArray();
    const beforeIncidents = await runtime.db.incidents.orderBy('id').toArray();
    await runtime.session.switchActor('user_0004');
    const services = createMonitoringServices(runtime);
    await expect(services.acknowledgeAlert({ alertId: alert.id })).rejects.toBeInstanceOf(
      PermissionDeniedError
    );
    await expect(services.resolveAlert({ alertId: alert.id })).rejects.toBeInstanceOf(
      PermissionDeniedError
    );
    expect(await runtime.db.alerts.orderBy('id').toArray()).toEqual(beforeAlerts);
    expect(await runtime.db.incidents.orderBy('id').toArray()).toEqual(beforeIncidents);
  });

  it('surfaces offline failures for acknowledgement and resolution without writes', async () => {
    fresh();
    const runtime = await harness.boot('network-offline');
    const alert = await openAlert(runtime);
    const beforeAlerts = await runtime.db.alerts.orderBy('id').toArray();
    const services = createMonitoringServices(runtime);
    await expect(services.acknowledgeAlert({ alertId: alert.id })).rejects.toBeInstanceOf(
      SimulatedServiceError
    );
    await expect(services.resolveAlert({ alertId: alert.id })).rejects.toBeInstanceOf(
      SimulatedServiceError
    );
    expect(await runtime.db.alerts.orderBy('id').toArray()).toEqual(beforeAlerts);
  });

  it('validates alert ids and rejects acknowledgement of a resolved alert', async () => {
    fresh();
    const runtime = await harness.boot('active');
    const services = createMonitoringServices(runtime);
    await expect(services.acknowledgeAlert({ alertId: '' })).rejects.toBeInstanceOf(
      ValidationError
    );
    const alert = await openAlert(runtime);
    await services.resolveAlert({ alertId: alert.id });
    await expect(services.acknowledgeAlert({ alertId: alert.id })).rejects.toBeInstanceOf(
      ValidationError
    );
  });
});
