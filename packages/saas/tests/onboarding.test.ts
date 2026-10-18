import {
  definePolicy,
  definePrototype,
  PermissionDeniedError,
  type PrototypeDefinition,
  parseManifest,
  type Row,
  SimulatedServiceError,
} from '@protoyard/core';
import type { ProtoyardRuntime } from '@protoyard/runtime';
import { fragments, generateTeam, presetScenario } from '@protoyard/scenarios';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createHarness } from '../../../tests/support/runtime.ts';
import {
  createOnboarding,
  createOnboardingFlow,
  DONE_STEP,
  mergeIntegrity,
  type OnboardingStepDefinition,
  type SaasOnboarding,
  saasIntegrity,
  saasStores,
  saasTables,
  ValidationError,
} from '../src/index.ts';

/**
 * The engine on the REAL runtime with an in-memory IndexedDB, mirroring the
 * cases of templates/onboarding/tests/services.test.ts. `reload()` closes the
 * runtime and reopens it on the same storage, exactly like a browser reload.
 */

const REFERENCE_TIME = '2026-10-16T09:00:00.000Z';

const STEPS: OnboardingStepDefinition[] = [
  {
    id: 'profile',
    label: 'Profile',
    schema: z.object({ fullName: z.string().trim().min(2, 'Enter your full name') }),
  },
  {
    id: 'workspace',
    label: 'Workspace',
    capability: 'workspace:update',
    schema: z.object({ name: z.string().trim().min(2, 'Name your workspace') }),
    effect: async (answer, { at, organizationId }) => {
      // Runs inside the wizard's transaction, after validation.
      workspaceWrites.push({ id: organizationId ?? 'none', ...(answer as object), at });
    },
  },
  {
    id: 'invite',
    label: 'Invite teammates',
    optional: true,
    schema: z.object({ emails: z.array(z.email('Enter a valid email')).max(5) }),
  },
  { id: 'preferences', label: 'Preferences', optional: true },
];
const workspaceWrites: Row[] = [];

const organization = { id: 'org_0001', name: 'Acme Cloud', size: 4 };
const flow = createOnboardingFlow(STEPS);

const definition: PrototypeDefinition = definePrototype({
  manifest: parseManifest({
    id: 'example.saas-onboarding',
    slug: 'saas-onboarding',
    name: 'SaaS onboarding fixture',
    version: '0.1.0',
    defaultScenario: 'not-started',
    defaultTheme: 'violet',
    storage: { namespace: 'saas-onboarding', schemaVersion: 1 },
    scenarios: ['not-started', 'half-complete', 'viewer'],
  }),
  database: { versions: [{ version: 1, stores: saasStores(1, { tables: ['saas_onboarding'] }) }] },
  scenarios: [
    presetScenario('brand-new-signup', {
      id: 'not-started',
      name: 'Not started',
      seed: 11,
      referenceTime: REFERENCE_TIME,
      organization,
      actor: { id: 'user_0001', role: 'owner' },
    }),
    presetScenario('onboarding-in-progress', {
      id: 'half-complete',
      name: 'Half complete',
      seed: 22,
      referenceTime: REFERENCE_TIME,
      organization,
      actor: { id: 'user_0001', role: 'owner' },
    }),
    presetScenario('read-only-viewer', fragments.onboarding(0.25), {
      id: 'viewer',
      name: 'Viewer joins',
      seed: 44,
      referenceTime: REFERENCE_TIME,
      organization,
      actor: { id: 'user_0004', role: 'viewer', joinedDaysAgo: 0 },
    }),
  ],
  policy: definePolicy({
    roles: {
      owner: ['*'],
      admin: ['*'],
      member: ['onboarding:progress'],
      viewer: ['onboarding:progress'],
    },
  }),
  integrity: mergeIntegrity(saasIntegrity({ tables: ['saas_onboarding'] })),
  generate(ctx) {
    const team = generateTeam(ctx);
    const actor = ctx.scenario.actor;
    const progress = actor.onboardingProgress ?? (actor.onboardingComplete ? 1 : 0);
    const { completed, current } = flow.stepsForProgress(progress);
    const at = ctx.time.daysAgo(0).toISOString();
    const rows: SaasOnboarding[] =
      completed.length === 0
        ? []
        : [
            {
              ...flow.freshState(actor.id, at, team.organization.id),
              currentStep: current,
              completedSteps: completed,
              answers: Object.fromEntries(completed.map((s) => [s, { seeded: true }])),
              startedAt: at,
            },
          ];
    return {
      organizations: team.organizations,
      personas: team.personas.map((p) =>
        p.id === actor.id ? { ...p, onboardingComplete: progress >= 1 } : p
      ),
      memberships: team.memberships,
      tables: saasTables({ saas_onboarding: rows }, { tables: ['saas_onboarding'] }),
    };
  },
});

type Db = ProtoyardRuntime['db'];
let harness = createHarness<Db>(definition);
afterEach(() => {
  harness.closeAll();
  harness = createHarness<Db>(definition);
  workspaceWrites.length = 0;
});

const boot = async (scenario: string) => {
  const runtime = await harness.boot(scenario);
  return {
    runtime,
    onboarding: createOnboarding(runtime as unknown as ProtoyardRuntime, { steps: STEPS }),
  };
};

describe('createOnboardingFlow', () => {
  it('appends done, maps progress to steps and rejects bad definitions', () => {
    expect(flow.ids).toEqual(['profile', 'workspace', 'invite', 'preferences', DONE_STEP]);
    expect(flow.stepsForProgress(0.5)).toEqual({
      completed: ['profile', 'workspace'],
      current: 'invite',
    });
    expect(flow.stepsForProgress(1).current).toBe(DONE_STEP);
    expect(flow.missingRequired({ completedSteps: ['profile'] })).toEqual(['workspace']);
    expect(
      flow.progressOf({ completedSteps: ['profile'], skippedSteps: ['invite'], completedAt: null })
    ).toBe(2 / 5);
    expect(() => createOnboardingFlow([])).toThrow(/at least one step/);
    expect(() => createOnboardingFlow([{ id: 'done', label: 'Done' }])).toThrow(
      /added by the engine/
    );
    expect(() =>
      createOnboardingFlow([
        { id: 'a', label: 'A' },
        { id: 'a', label: 'A again' },
      ])
    ).toThrow(/unique/);
  });
});

describe('createOnboarding on the real runtime', () => {
  it('persists every step so a reload resumes exactly where the person left off', async () => {
    let { runtime, onboarding } = await boot('not-started');
    expect((await onboarding.state()).currentStep).toBe('profile');
    expect(await runtime.db.table('saas_onboarding').count()).toBe(0);

    await onboarding.submit('profile', { fullName: 'Olivia Hart' });
    runtime = await harness.reload(runtime);
    onboarding = createOnboarding(runtime as unknown as ProtoyardRuntime, { steps: STEPS });
    expect(await onboarding.state()).toMatchObject({
      currentStep: 'workspace',
      completedSteps: ['profile'],
      answers: { profile: { fullName: 'Olivia Hart' } },
      organizationId: 'org_0001',
    });

    await onboarding.submit('workspace', { name: 'Acme Cloud' });
    expect(workspaceWrites).toEqual([
      expect.objectContaining({ id: 'org_0001', name: 'Acme Cloud' }),
    ]);

    // Back is persisted too.
    await onboarding.goTo('profile');
    runtime = await harness.reload(runtime);
    onboarding = createOnboarding(runtime as unknown as ProtoyardRuntime, { steps: STEPS });
    expect((await onboarding.state()).currentStep).toBe('profile');
    await onboarding.goTo('invite');

    // Skip optional steps; the wizard lands on done and can be finished.
    await onboarding.skip('invite');
    await onboarding.skip('preferences');
    expect(await onboarding.state()).toMatchObject({
      currentStep: DONE_STEP,
      skippedSteps: ['invite', 'preferences'],
    });
    expect(runtime.session.principal()?.persona.onboardingComplete).toBe(false);
    const done = await onboarding.complete();
    expect(done.completedAt).not.toBeNull();
    expect(onboarding.flow.progressOf(done)).toBe(1);
    expect(runtime.session.principal()?.persona.onboardingComplete).toBe(true);

    runtime = await harness.reload(runtime);
    onboarding = createOnboarding(runtime as unknown as ProtoyardRuntime, { steps: STEPS });
    expect((await onboarding.state()).completedAt).not.toBeNull();
    expect(runtime.session.principal()?.persona.onboardingComplete).toBe(true);
  });

  it('restart goes back to step 1 and keeps earlier answers as defaults', async () => {
    let { runtime, onboarding } = await boot('not-started');
    await onboarding.submit('profile', { fullName: 'Olivia Hart' });
    await onboarding.submit('workspace', { name: 'Acme Cloud' });
    await onboarding.submit('invite', { emails: ['sam@example.com'] });
    await onboarding.submit('preferences');
    await onboarding.complete();

    await onboarding.restart();
    runtime = await harness.reload(runtime);
    onboarding = createOnboarding(runtime as unknown as ProtoyardRuntime, { steps: STEPS });
    expect(await onboarding.state()).toMatchObject({
      currentStep: 'profile',
      completedSteps: [],
      skippedSteps: [],
      completedAt: null,
      answers: {
        profile: { fullName: 'Olivia Hart' },
        workspace: { name: 'Acme Cloud' },
        invite: { emails: ['sam@example.com'] },
      },
    });
    expect(runtime.session.principal()?.persona.onboardingComplete).toBe(false);
  });

  it('skipping an answered optional step keeps it completed', async () => {
    const { onboarding } = await boot('half-complete');
    await onboarding.submit('invite', { emails: ['sam@example.com'] });
    await onboarding.goTo('invite');
    const state = await onboarding.skip('invite');
    expect(state.completedSteps).toContain('invite');
    expect(state.skippedSteps).not.toContain('invite');
  });

  it('resumes the half-complete scenario at step 3', async () => {
    const { onboarding } = await boot('half-complete');
    expect(await onboarding.state()).toMatchObject({
      currentStep: 'invite',
      completedSteps: ['profile', 'workspace'],
    });
  });

  it('cannot skip required steps or jump past unfinished ones', async () => {
    const { onboarding } = await boot('not-started');
    await expect(onboarding.skip('profile')).rejects.toThrow(/required and can't be skipped/);
    await expect(onboarding.skip('invite')).rejects.toThrow(/Finish the earlier steps/);
    await expect(onboarding.goTo('preferences')).rejects.toThrow(/Finish the earlier steps/);
    await expect(onboarding.complete()).rejects.toThrow(/Finish Profile and Workspace first/);
    await expect(onboarding.goTo('nowhere')).rejects.toThrow(/Unknown onboarding step/);
    expect((await onboarding.state()).currentStep).toBe('profile');
  });

  it('validates each step with field-level messages and writes nothing', async () => {
    const { runtime, onboarding } = await boot('not-started');
    const error = await onboarding.submit('profile', { fullName: 'O' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).issues).toEqual({ fullName: 'Enter your full name' });
    expect(await runtime.db.table('saas_onboarding').count()).toBe(0);
  });

  it('a viewer continues without changing the workspace', async () => {
    const { onboarding } = await boot('viewer');
    expect((await onboarding.state()).currentStep).toBe('workspace');
    await expect(onboarding.submit('workspace', { name: 'Mine now' })).rejects.toBeInstanceOf(
      PermissionDeniedError
    );
    expect(workspaceWrites).toEqual([]);
    const viewerSteps = STEPS.map((s) => (s.id === 'workspace' ? { id: s.id, label: s.label } : s));
    const { runtime } = await boot('viewer');
    const ack = createOnboarding(runtime as unknown as ProtoyardRuntime, { steps: viewerSteps });
    expect((await ack.submit('workspace')).currentStep).toBe('invite');
  });

  it('keeps the step when the simulated network fails', async () => {
    const { runtime, onboarding } = await boot('half-complete');
    await runtime.overrides.set({ environment: { network: 'offline' } });
    await expect(onboarding.skip('invite')).rejects.toBeInstanceOf(SimulatedServiceError);
    expect((await onboarding.state()).currentStep).toBe('invite');
  });
});
