import { PermissionDeniedError, SimulatedServiceError, ValidationError } from '@protoyard/core';
import type { ProtoyardRuntime } from '@protoyard/runtime';
import { createOnboarding, type SaasOnboarding } from '@protoyard/saas';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import { expectBootableWorld } from '../../../tests/support/smoke.ts';
import { latticeOnboardingSteps } from '../src/domain/onboarding.ts';
import { definition } from '../src/prototype.ts';

/**
 * Lattice's essential regressions on the real runtime (in-memory IndexedDB):
 * onboarding steps commit atomically (offline writes nothing) and a viewer
 * cannot rename or invite through the wizard.
 */

let harness = createHarness(definition);
afterEach(() => {
  harness.closeAll();
  harness = createHarness(definition);
});

const boot = async (scenario: string) =>
  (await harness.boot(scenario)) as unknown as ProtoyardRuntime;

describe('bug 5: onboarding steps commit atomically through the service pipeline', () => {
  async function ownerWizard() {
    const runtime = await boot('signed-out');
    await runtime.session.signIn('user_0001');
    const onboarding = createOnboarding(runtime, { steps: latticeOnboardingSteps(runtime) });
    return { runtime, onboarding };
  }
  const row = (runtime: ProtoyardRuntime) =>
    runtime.db.rows<SaasOnboarding>('saas_onboarding').get('user_0001');

  it('generates deterministic worlds and boots the default scenario', async () => {
    await expectBootableWorld(definition, harness);
  });

  it('offline writes neither the profile nor the step', async () => {
    const { runtime, onboarding } = await ownerWizard();
    const before = runtime.session.principal()?.persona.name;
    runtime.environment.set({ network: 'offline' });
    await expect(
      onboarding.submit('profile', { fullName: 'Kai Example', jobTitle: 'Lead' })
    ).rejects.toBeInstanceOf(SimulatedServiceError);
    expect((await runtime.db.rows<Persona>('py_personas').get('user_0001'))?.name).toBe(before);
    expect(await row(runtime)).toBeUndefined();

    runtime.environment.set({ network: 'online' });
    const saved = await onboarding.submit('profile', { fullName: 'Kai Example', jobTitle: 'Lead' });
    expect(saved.completedSteps).toEqual(['profile']);
    expect(runtime.session.principal()?.persona).toMatchObject({
      name: 'Kai Example',
      title: 'Lead',
    });
  });

  it('a viewer cannot rename or invite through the wizard, and nothing is written', async () => {
    const runtime = await boot('viewer');
    await runtime.session.signIn('user_0001');
    const onboarding = createOnboarding(runtime, { steps: latticeOnboardingSteps(runtime) });
    const persona = runtime.session.principal()?.persona;
    await onboarding.submit('profile', { fullName: persona?.name ?? '', jobTitle: '' });
    const before = await row(runtime);
    const name = runtime.session.principal()?.organization?.name ?? '';
    await expect(onboarding.submit('workspace', { name: 'Viewer Rename' })).rejects.toBeInstanceOf(
      PermissionDeniedError
    );
    await expect(
      onboarding.submit('invite', { emails: ['new.person@example.com'] })
    ).rejects.toThrow(ValidationError);
    expect(runtime.session.principal()?.organization?.name).toBe(name);
    expect(await row(runtime)).toEqual(before);
    // Confirming the unchanged name read-only is allowed.
    await expect(onboarding.submit('workspace', { name })).resolves.toBeTruthy();
  });
});
