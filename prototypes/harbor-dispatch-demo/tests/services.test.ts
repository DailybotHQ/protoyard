import { PermissionDeniedError } from '@protoyard/core';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import { blueprint } from '../src/generated/blueprint.ts';
import { createServices } from '../src/generated/services.ts';
import { definition } from '../src/prototype.ts';

describe('generated services', () => {
  let harness = createHarness(definition);
  afterEach(() => {
    harness.closeAll();
    harness = createHarness(definition);
  });

  it('lists every entity for the owner', async () => {
    const services = createServices(await harness.boot('active'));
    for (const entity of blueprint.entities) {
      expect(Array.isArray(await services[entity.name]!.list()), entity.name).toBe(true);
    }
  });

  it('denies a viewer from creating in the service layer', async () => {
    const services = createServices(await harness.boot('viewer'));
    await expect(services.shipment!.create({})).rejects.toBeInstanceOf(PermissionDeniedError);
  });

  it('moves a queued shipment and keeps the board column after a runtime reload', async () => {
    const runtime = await harness.boot('active');
    const services = createServices(runtime);
    const shipment = (await services.shipment!.list()).find(
      (row) => row.trackingCode === 'HB-4100'
    );
    if (!shipment) throw new Error('active scenario seeds shipment HB-4100');

    await services.shipment!.update(shipment.id, { status: 'dispatched' });
    const reloaded = await harness.reload(runtime);
    const stored = await createServices(reloaded).shipment!.get(shipment.id);
    expect(stored?.status).toBe('dispatched');
  });

  it('denies a viewer from moving a shipment', async () => {
    const runtime = await harness.boot('viewer');
    const services = createServices(runtime);
    const shipment = (await services.shipment!.list())[0];
    if (!shipment) throw new Error('viewer scenario seeds a shipment');

    await expect(
      services.shipment!.update(shipment.id, { status: 'dispatched' })
    ).rejects.toBeInstanceOf(PermissionDeniedError);
  });

  it('rejects a shipment move offline without changing its status', async () => {
    const runtime = await harness.boot('active');
    const services = createServices(runtime);
    const shipment = (await services.shipment!.list()).find(
      (row) => row.trackingCode === 'HB-4100'
    );
    if (!shipment) throw new Error('active scenario seeds shipment HB-4100');

    await runtime.overrides.set({ environment: { network: 'offline' } });
    await expect(
      services.shipment!.update(shipment.id, { status: 'dispatched' })
    ).rejects.toMatchObject({ code: 'offline' });
    expect((await services.shipment!.get(shipment.id))?.status).toBe('queued');
  });
});
