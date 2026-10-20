import { CAPABILITIES } from '@protoyard/blueprint';
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
    await expect(services.transaction!.create({})).rejects.toBeInstanceOf(PermissionDeniedError);
  });

  it('allows an admin to export analytics and denies the viewer', async () => {
    const exportCapability = CAPABILITIES(blueprint).transaction?.export;
    if (!exportCapability) throw new Error('transactions expose a CSV export capability');

    const admin = await harness.boot('launch-spike');
    expect(() => admin.session.assert(exportCapability)).not.toThrow();

    const viewerHarness = createHarness(definition);
    try {
      const viewer = await viewerHarness.boot('viewer');
      expect(() => viewer.session.assert(exportCapability)).toThrow(PermissionDeniedError);
    } finally {
      viewerHarness.closeAll();
    }
  });
});
