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

  it('denies a viewer from creating in the service layer', async () => {
    const services = createServices(await harness.boot('viewer'));
    await expect(services.booking!.create({})).rejects.toBeInstanceOf(PermissionDeniedError);
  });
});
