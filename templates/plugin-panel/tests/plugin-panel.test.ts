import { PermissionDeniedError, parseScenario } from '@protoyard/core';
import { createGenerateContext, validateWorld } from '@protoyard/scenarios';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import type { PluginDatabase } from '../src/database/schema.ts';
import { createPluginServices } from '../src/domain/services.ts';
import { definition } from '../src/prototype.ts';
import { generatePluginWorld } from '../src/scenarios/generators.ts';

const scenario = (id: string) => {
  const found = definition.scenarios.find((entry) => entry.id === id);
  if (!found) throw new Error(`missing scenario ${id}`);
  return parseScenario(found);
};

describe('plugin-panel scenarios', () => {
  it('generate deterministic worlds for every scenario', () => {
    for (const id of [
      'empty',
      'connected-workspace',
      'sync-paused',
      'connect-error',
      'read-only',
    ]) {
      const input = scenario(id);
      const world = generatePluginWorld(createGenerateContext(input));
      expect(generatePluginWorld(createGenerateContext(input)), id).toEqual(world);
      expect(
        validateWorld(world, { ...definition.integrity, referenceTime: input.referenceTime }),
        id
      ).toEqual([]);
    }
    expect(
      generatePluginWorld(createGenerateContext(scenario('empty'))).tables.connectedItems
    ).toEqual([]);
    expect(
      generatePluginWorld(createGenerateContext(scenario('connected-workspace'))).tables
        .connectedItems
    ).toHaveLength(2);
  });
});

describe('plugin-panel services on the real runtime', () => {
  let harness = createHarness<PluginDatabase>(definition);
  afterEach(() => {
    harness.closeAll();
    harness = createHarness<PluginDatabase>(definition);
  });

  it('simulates account consent and supports create, edit, pause and delete', async () => {
    let runtime = await harness.boot('empty');
    const services = createPluginServices(runtime);
    const linked = await services.connectAccount('Northstar Drive', 'olivia.hart@example.com');
    expect(linked).toMatchObject({ provider: 'Northstar Drive', syncState: 'active' });
    await services.update(linked.id, {
      label: 'Shared design files',
      provider: linked.provider,
      account: linked.account,
      syncState: 'active',
    });
    await services.setSyncState(linked.id, 'paused');
    runtime = await harness.reload(runtime);
    expect(await runtime.db.connectedItems.get(linked.id)).toMatchObject({
      label: 'Shared design files',
      syncState: 'paused',
    });
    await createPluginServices(runtime).remove(linked.id);
    expect(await runtime.db.connectedItems.count()).toBe(0);
  });

  it('rejects invalid records, respects viewer policy and persists preferences', async () => {
    const runtime = await harness.boot('empty');
    const services = createPluginServices(runtime);
    await expect(
      services.create({
        label: ' ',
        provider: 'Northstar Drive',
        account: 'not-an-email',
        syncState: 'active',
      })
    ).rejects.toMatchObject({ issues: { label: expect.any(String), account: expect.any(String) } });
    await services.saveSettings({ autoSync: false, notifyOnChange: true });
    expect(await runtime.db.settings.get('workspace')).toMatchObject({
      autoSync: false,
      notifyOnChange: true,
    });

    harness.closeAll();
    harness = createHarness<PluginDatabase>(definition);
    const viewer = await harness.boot('read-only');
    expect(viewer.session.principal()?.role).toBe('viewer');
    await expect(
      createPluginServices(viewer).connectAccount('Tandem Tasks', 'nora.kim@example.com')
    ).rejects.toBeInstanceOf(PermissionDeniedError);
    expect(await viewer.db.connectedItems.count()).toBe(1);
  });

  it('honors the scenario environment failure without creating a connection', async () => {
    const runtime = await harness.boot('connect-error');
    await expect(
      createPluginServices(runtime).connectAccount('Tandem Tasks', 'olivia.hart@example.com')
    ).rejects.toMatchObject({ code: 'server-error' });
    expect(await runtime.db.connectedItems.count()).toBe(1);
  });
});
