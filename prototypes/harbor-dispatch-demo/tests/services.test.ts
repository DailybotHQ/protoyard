import { PermissionDeniedError } from '@protoyard/core';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import { expectBootableWorld } from '../../../tests/support/smoke.ts';
import { createServices } from '../src/generated/services.ts';
import { definition } from '../src/prototype.ts';

describe('generated services', () => {
  let harness = createHarness(definition);
  afterEach(() => {
    harness.closeAll();
    harness = createHarness(definition);
  });

  it('generates deterministic worlds and boots the default scenario', async () => {
    await expectBootableWorld(definition, harness);
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
});
