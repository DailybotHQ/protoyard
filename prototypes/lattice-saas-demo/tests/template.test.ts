import { PermissionDeniedError } from '@protoyard/core';
import { createPrototypeRuntime } from '@protoyard/runtime';
import { saasKnobs } from '@protoyard/saas';
import {
  composeScenario,
  createGenerateContext,
  PRESETS,
  resolveScenarios,
  validateWorld,
} from '@protoyard/scenarios';
import { afterEach, describe, expect, it } from 'vitest';
import { createProjectServices } from '../src/domain/projects.ts';
import { definition } from '../src/prototype.ts';
import { generateB2bSaasWorld } from '../src/scenarios/generators.ts';

const resolved = resolveScenarios(definition.scenarios, PRESETS);

describe('Lattice SaaS flagship', () => {
  it('registers the eight intended walkthrough scenarios', () => {
    expect(resolved.map((scenario) => scenario.id)).toEqual([
      'signed-out',
      'mid-onboarding',
      'trial-ending',
      'past-due',
      'multi-workspace-admin',
      'viewer',
      'mfa-enrolled',
      'pending-invite',
    ]);
    expect(resolved.find((scenario) => scenario.id === 'trial-ending')).toMatchObject({
      generators: { saas: { trialEndsInDays: 2 } },
    });
    expect(resolved.find((scenario) => scenario.id === 'viewer')?.actor?.role).toBe('viewer');
    expect(resolved.find((scenario) => scenario.id === 'mid-onboarding')?.actor).toMatchObject({
      onboardingComplete: false,
      onboardingProgress: 0.5,
    });
    expect(
      saasKnobs(resolved.find((scenario) => scenario.id === 'multi-workspace-admin')!).workspaces
    ).toBe(3);
  });

  it('generates deterministic, valid SaaS worlds for each scenario', () => {
    for (const scenario of resolved) {
      const first = generateB2bSaasWorld(createGenerateContext(scenario));
      const second = generateB2bSaasWorld(createGenerateContext(scenario));
      expect(first).toEqual(second);
      expect(first.tables.projects).toHaveLength(6);
      expect(
        validateWorld(first, { ...definition.integrity, referenceTime: scenario.referenceTime })
      ).toEqual([]);
    }
  });

  describe('project services', () => {
    let runtime: Awaited<ReturnType<typeof createPrototypeRuntime>> | undefined;
    afterEach(async () => {
      await runtime?.destroy();
      runtime = undefined;
    });

    it('creates, updates, lists, and deletes workspace-scoped projects', async () => {
      runtime = await createPrototypeRuntime(definition, {
        link: { scenario: 'multi-workspace-admin' },
        sleep: async () => {},
      });
      await runtime.scenarios.ensureSeeded();
      await runtime.session.signIn('user_0001');
      const services = createProjectServices(runtime);
      const created = await services.create({ name: '  Launch plan  ', summary: 'First release' });
      expect(created).toMatchObject({
        name: 'Launch plan',
        status: 'planning',
        ownerPersonaId: 'user_0001',
      });
      expect((await services.list()).some((project) => project.id === created.id)).toBe(true);
      await services.update({
        id: created.id,
        name: created.name,
        summary: created.summary,
        status: 'active',
      });
      expect(await runtime.db.table('projects').get(created.id)).toMatchObject({
        status: 'active',
      });
      await services.remove(created.id);
      expect(await runtime.db.table('projects').get(created.id)).toBeUndefined();
    });

    it('validates input and enforces capabilities at the service boundary', async () => {
      runtime = await createPrototypeRuntime(definition, {
        link: { scenario: 'multi-workspace-admin' },
        sleep: async () => {},
      });
      await runtime.scenarios.ensureSeeded();
      await runtime.session.signIn('user_0001');
      const services = createProjectServices(runtime);
      await expect(services.create({ name: 'x' })).rejects.toThrow();
      await runtime.destroy();
      const viewerScenario = composeScenario(PRESETS['active-month'], {
        id: 'viewer-test',
        name: 'Viewer access test',
        seed: 83_007,
        referenceTime: '2026-10-18T14:00:00.000Z',
        organization: { id: 'org_viewer_test', name: 'Viewer Test', size: 2 },
        actor: { id: 'user_0001', role: 'viewer', onboardingComplete: true, onboardingProgress: 1 },
      });
      runtime = await createPrototypeRuntime(
        { ...definition, scenarios: [...definition.scenarios, viewerScenario] },
        { link: { scenario: 'viewer-test' }, sleep: async () => {} }
      );
      await runtime.scenarios.ensureSeeded();
      await runtime.session.signIn('user_0001');
      const viewerServices = createProjectServices(runtime);
      await expect(viewerServices.create({ name: 'Restricted project' })).rejects.toBeInstanceOf(
        PermissionDeniedError
      );
      const existingProject = (await viewerServices.list())[0];
      expect(existingProject).toBeDefined();
      await expect(
        viewerServices.update({ ...existingProject!, status: 'complete' })
      ).rejects.toBeInstanceOf(PermissionDeniedError);
      await expect(viewerServices.remove(existingProject!.id)).rejects.toBeInstanceOf(
        PermissionDeniedError
      );
    });
  });
});
