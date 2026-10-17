import { PermissionDeniedError, SimulatedServiceError } from '@protoyard/core';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import type { OnboardingDatabase } from '../src/database/schema.ts';
import { createOnboardingServices } from '../src/domain/services.ts';
import { ValidationError } from '../src/domain/validation.ts';
import { definition } from '../src/prototype.ts';

/**
 * Wizard behaviour on the REAL runtime with an in-memory IndexedDB.
 * `reload()` closes the runtime and opens a new one on the same storage —
 * exactly what a browser reload does — so these tests prove resumability.
 */

let harness = createHarness<OnboardingDatabase>(definition);
afterEach(() => {
  harness.closeAll();
  harness = createHarness<OnboardingDatabase>(definition);
});

const profile = {
  fullName: 'Olivia Hart',
  jobTitle: 'Founder',
  department: 'Product' as const,
  timezone: 'Europe/Madrid',
};

describe('onboarding services on the real runtime', () => {
  it('persists every step so a reload resumes exactly where the person left off', async () => {
    let runtime = await harness.boot('not-started');
    let services = createOnboardingServices(runtime);
    expect((await services.state()).currentStep).toBe('profile');
    expect(await runtime.db.onboarding.count()).toBe(0);

    await services.saveProfile(profile);
    runtime = await harness.reload(runtime);
    services = createOnboardingServices(runtime);
    expect(await services.state()).toMatchObject({
      currentStep: 'workspace',
      completedSteps: ['profile'],
      profile,
    });

    await services.saveWorkspace({
      name: 'Acme Cloud',
      slug: 'acme',
      teamSize: '2-10',
      useCase: 'projects',
    });
    runtime = await harness.reload(runtime);
    services = createOnboardingServices(runtime);
    expect((await services.state()).currentStep).toBe('invite');
    expect(await runtime.db.workspaces.get('org_0001')).toMatchObject({
      slug: 'acme',
      teamSize: '2-10',
    });

    // Back is persisted too.
    await services.goTo('profile');
    runtime = await harness.reload(runtime);
    services = createOnboardingServices(runtime);
    expect((await services.state()).currentStep).toBe('profile');
    await services.goTo('invite');

    await services.saveInvites({
      invites: [
        { email: 'Sam@example.com', role: 'member' },
        { email: 'lee@example.com', role: 'admin' },
      ],
    });
    // Re-submitting replaces this wizard's invitations instead of duplicating them.
    await services.goTo('invite');
    await services.saveInvites({ invites: [{ email: 'sam@example.com', role: 'admin' }] });
    expect((await runtime.db.invitations.toArray()).map((i) => [i.email, i.role])).toEqual([
      ['sam@example.com', 'admin'],
    ]);

    // Skipping an answered step keeps it answered (and keeps its invitations).
    await services.goTo('invite');
    await services.skip('invite');
    expect((await services.state()).completedSteps).toContain('invite');
    expect(await runtime.db.invitations.count()).toBe(1);

    await services.skip('preferences');
    runtime = await harness.reload(runtime);
    services = createOnboardingServices(runtime);
    expect(await services.state()).toMatchObject({
      currentStep: 'done',
      skippedSteps: ['preferences'],
    });

    await services.complete();
    runtime = await harness.reload(runtime);
    services = createOnboardingServices(runtime);
    expect((await services.state()).completedAt).toBe(runtime.clock.now().toISOString());

    await services.restart();
    runtime = await harness.reload(runtime);
    services = createOnboardingServices(runtime);
    expect(await services.state()).toMatchObject({
      currentStep: 'profile',
      completedSteps: [],
      completedAt: null,
      profile,
    });
    expect(await runtime.db.invitations.count()).toBe(1);
  });

  it('skip() cannot jump past unfinished required steps', async () => {
    const runtime = await harness.boot('not-started');
    const services = createOnboardingServices(runtime);
    const before = await services.state();
    expect(before.currentStep).toBe('profile');
    await expect(services.skip('preferences')).rejects.toMatchObject({
      issues: { form: expect.stringMatching(/Finish the earlier steps/) },
    });
    expect(await services.state()).toEqual(before);
  });

  it('resumes the half-complete scenario at step 3', async () => {
    const runtime = await harness.boot('half-complete');
    const services = createOnboardingServices(runtime);
    expect((await services.state()).currentStep).toBe('invite');
    await expect(services.goTo('done')).rejects.toBeInstanceOf(ValidationError);
    await expect(services.complete()).resolves.toBeDefined();
  });

  it('validates each step with field-level messages', async () => {
    const runtime = await harness.boot('not-started');
    const services = createOnboardingServices(runtime);
    const err = (p: Promise<unknown>) =>
      p.then(
        () => null,
        (e: unknown) => e as ValidationError
      );

    const p = await err(services.saveProfile({ ...profile, fullName: ' ', timezone: '' }));
    expect(Object.keys(p?.issues ?? {}).sort()).toEqual(['fullName', 'timezone']);

    const w = await err(
      services.saveWorkspace({ name: 'A', slug: 'Bad Slug', teamSize: '2-10', useCase: 'projects' })
    );
    expect(Object.keys(w?.issues ?? {}).sort()).toEqual(['name', 'slug']);

    const i = await err(
      services.saveInvites({
        invites: [
          { email: 'a@example.com', role: 'member' },
          { email: 'A@example.com', role: 'member' },
          { email: 'nope', role: 'member' },
        ],
      })
    );
    expect(i?.issues).toMatchObject({
      'invites.1.email': expect.any(String),
      'invites.2.email': expect.any(String),
    });
    expect((await err(services.saveInvites({ invites: [] })))?.issues.invites).toMatch(/skip/);
    expect(
      (
        await err(
          services.saveInvites({ invites: [{ email: 'olivia@example.com', role: 'member' }] })
        )
      )?.issues['invites.0.email']
    ).toMatch(/own email/);

    await expect(services.skip('profile')).rejects.toBeInstanceOf(ValidationError);
    await expect(services.complete()).rejects.toBeInstanceOf(ValidationError);
    expect(await runtime.db.onboarding.count()).toBe(0);
  });

  it('lets a viewer finish onboarding without changing the workspace or inviting', async () => {
    const runtime = await harness.boot('viewer');
    const services = createOnboardingServices(runtime);
    expect(runtime.session.principal()?.persona.id).toBe('user_0004');
    expect((await services.state()).currentStep).toBe('workspace');
    const before = await runtime.db.workspaces.get('org_0001');

    await expect(
      services.saveWorkspace({
        name: 'Hijacked',
        slug: 'hijacked',
        teamSize: '1',
        useCase: 'other',
      })
    ).rejects.toBeInstanceOf(PermissionDeniedError);
    await services.acknowledgeWorkspace();
    await expect(
      services.saveInvites({ invites: [{ email: 'x@example.com', role: 'member' }] })
    ).rejects.toBeInstanceOf(PermissionDeniedError);
    await services.skip('invite');
    await services.savePreferences({
      mode: 'dark',
      digest: 'never',
      productUpdates: false,
      mentions: true,
    });
    await services.complete();

    expect(await runtime.db.workspaces.get('org_0001')).toEqual(before);
    expect(runtime.theme.appearance().mode.value).toBe('dark');
    expect((await services.state()).completedAt).not.toBeNull();
  });

  it('keeps the step when the simulated network fails', async () => {
    const runtime = await harness.boot('half-complete');
    const services = createOnboardingServices(runtime);
    await runtime.overrides.set({ environment: { network: 'offline' } });
    await expect(services.skip('invite')).rejects.toBeInstanceOf(SimulatedServiceError);
    expect((await services.state()).currentStep).toBe('invite');
  });
});
