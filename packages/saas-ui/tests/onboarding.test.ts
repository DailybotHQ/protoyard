import {
  definePolicy,
  definePrototype,
  type PrototypeDefinition,
  type PrototypeRuntime,
  parseManifest,
} from '@protoyard/core';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import {
  createOnboarding,
  createOnboardingFlow,
  type SaasOnboarding,
  saasIntegrity,
  saasStores,
  saasTables,
} from '../../saas/src/index.ts';
import { fragments, generateTeam, presetScenario } from '../../scenarios/src/index.ts';
import { defaultOnboardingSteps } from '../src/screens/onboarding/steps.ts';
import CustomStepHarness from './fixtures/CustomStepHarness.svelte';
import OnboardingHarness from './fixtures/OnboardingHarness.svelte';

/**
 * The onboarding wizard screen on the REAL runtime (in-memory IndexedDB).
 * `harness.reload()` closes the runtime and reopens it on the same storage,
 * exactly like a browser reload.
 */

const REFERENCE_TIME = '2026-10-16T09:00:00.000Z';
const organization = { id: 'org_0001', name: 'Acme Cloud', size: 4 };
const flow = createOnboardingFlow(defaultOnboardingSteps());

const definition: PrototypeDefinition = definePrototype({
  manifest: parseManifest({
    id: 'example.saas-ui-onboarding',
    slug: 'saas-ui-onboarding',
    name: 'Onboarding UI fixture',
    version: '0.1.0',
    defaultScenario: 'not-started',
    defaultTheme: 'violet',
    storage: { namespace: 'saas-ui-onboarding', schemaVersion: 1 },
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
  integrity: saasIntegrity({ tables: ['saas_onboarding'] }),
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
              answers: {
                profile: { fullName: 'Seeded Person', jobTitle: '' },
                workspace: { name: organization.name },
              },
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

let harness = createHarness(definition);
afterEach(() => {
  cleanup();
  harness.closeAll();
  harness = createHarness(definition);
  location.hash = '';
});

const activeStep = () => screen.getByRole('region', { name: /^Step \d of 5/ });
const expectStep = (label: string) =>
  waitFor(() => expect(activeStep().getAttribute('aria-label')).toBe(label));
const next = () => fireEvent.click(screen.getByRole('button', { name: /^(Next|Finish setup)/ }));
const field = (label: string) => screen.getByLabelText(new RegExp(`^${label}`));
const type = (label: string, value: string) => fireEvent.input(field(label), { target: { value } });

describe('onboarding wizard screen', () => {
  it('reload resumes at step 3 (half-complete scenario) and Back is persisted', async () => {
    let runtime = await harness.boot('half-complete');
    render(OnboardingHarness, { runtime });
    await expectStep('Step 3 of 5: Invite teammates');
    expect(screen.getByRole('progressbar', { name: /Setup progress/ })).toBeTruthy();

    cleanup();
    runtime = await harness.reload(runtime);
    render(OnboardingHarness, { runtime });
    await expectStep('Step 3 of 5: Invite teammates');

    await fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(async () =>
      expect(
        (await createOnboarding(runtime as never, { steps: defaultOnboardingSteps() }).state())
          .currentStep
      ).toBe('workspace')
    );
    cleanup();
    runtime = await harness.reload(runtime);
    render(OnboardingHarness, { runtime });
    await expectStep('Step 2 of 5: Workspace');
    expect((field('Workspace name') as HTMLInputElement).value).toBe('Acme Cloud');
  });

  it('runs every step for real: profile, workspace rename, invites, color mode, finish', async () => {
    const runtime = await harness.boot('not-started');
    let completed = 0;
    render(OnboardingHarness, { runtime, onComplete: () => completed++ });
    await expectStep('Step 1 of 5: Profile');

    // Field errors come back inline and nothing moves.
    await type('Full name', 'O');
    await next();
    expect(await screen.findByText('Enter your full name')).toBeTruthy();
    await expectStep('Step 1 of 5: Profile');

    await type('Full name', 'Olivia Hart');
    await type('Job title', 'Founder');
    await next();
    await expectStep('Step 2 of 5: Workspace');
    expect(runtime.session.principal()?.persona).toMatchObject({
      name: 'Olivia Hart',
      title: 'Founder',
    });

    await type('Workspace name', 'Hart Studio');
    await next();
    await expectStep('Step 3 of 5: Invite teammates');
    expect(runtime.session.principal()?.organization?.name).toBe('Hart Studio');

    await type('Email addresses', 'real.person@gmail.com');
    await next();
    expect(await screen.findByText('Use fictional addresses at example.com')).toBeTruthy();
    await type('Email addresses', 'sam.lee@example.com, kai@example.com');
    await next();
    await expectStep('Step 4 of 5: Preferences');
    const emails = runtime.members.list().map((m) => m.persona.email);
    expect(emails).toEqual(expect.arrayContaining(['sam.lee@example.com', 'kai@example.com']));
    expect(
      runtime.members.list().find((m) => m.persona.email === 'sam.lee@example.com')?.persona.name
    ).toBe('Sam Lee');

    await fireEvent.click(field('Color mode'));
    await fireEvent.click(await screen.findByRole('option', { name: 'Dark' }));
    await next();
    await expectStep('Step 5 of 5: Done');
    expect(runtime.theme.appearance().mode).toMatchObject({ value: 'dark', source: 'preference' });
    expect(screen.getByText(/Workspace name: Hart Studio/)).toBeTruthy();

    await next();
    await waitFor(() => expect(completed).toBe(1));
    expect(runtime.session.principal()?.persona.onboardingComplete).toBe(true);
    expect(await screen.findByRole('heading', { name: "You're all set" })).toBeTruthy();
  });

  it('skips optional steps and a viewer continues past a read-only workspace', async () => {
    const runtime = await harness.boot('viewer');
    render(OnboardingHarness, { runtime });
    await expectStep('Step 2 of 5: Workspace');
    expect((field('Workspace name') as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText(/Only people who manage the workspace can rename it/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Skip for now' })).toBeNull();

    await next();
    await expectStep('Step 3 of 5: Invite teammates');
    expect(runtime.session.principal()?.organization?.name).toBe('Acme Cloud');

    await fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }));
    await expectStep('Step 4 of 5: Preferences');
    await fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }));
    await expectStep('Step 5 of 5: Done');
    expect(screen.getAllByText('Skipped')).toHaveLength(2);
  });

  it('restart asks for confirmation, then starts over with earlier answers filled in', async () => {
    const runtime = await harness.boot('not-started');
    const onboarding = createOnboarding(runtime as never, { steps: defaultOnboardingSteps() });
    await onboarding.submit('profile', { fullName: 'Olivia Hart', jobTitle: '' });
    await onboarding.submit('workspace', { name: 'Acme Cloud' });
    await onboarding.skip('invite');
    await onboarding.skip('preferences');
    await onboarding.complete();

    render(OnboardingHarness, { runtime });
    await screen.findByRole('heading', { name: "You're all set" });
    await fireEvent.click(screen.getByRole('button', { name: 'Restart onboarding' }));
    const dialog = await screen.findByRole('alertdialog');
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Restart' }));
    await expectStep('Step 1 of 5: Profile');
    expect((field('Full name') as HTMLInputElement).value).toBe('Olivia Hart');
    expect(runtime.session.principal()?.persona.onboardingComplete).toBe(false);
  });

  it('renders a prototype step from its snippet and validates it', async () => {
    const runtime = (await harness.boot('not-started')) as PrototypeRuntime;
    render(CustomStepHarness, { runtime });
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Step 1 of 2: Your goal' })).toBeTruthy()
    );
    await fireEvent.click(screen.getByRole('button', { name: /^Next/ }));
    expect(await screen.findByTestId('goal-error')).toBeTruthy();
    await fireEvent.click(screen.getByLabelText(/Ship faster/));
    await fireEvent.click(screen.getByRole('button', { name: /^Next/ }));
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Step 2 of 2: Done' })).toBeTruthy()
    );
    const saved = await createOnboarding(runtime as never, {
      steps: [{ id: 'goal', label: 'Your goal' }],
    }).state();
    expect(saved.answers).toEqual({ goal: { goal: 'ship' } });
  });

  it('runs afterSubmit only once the answer is saved', async () => {
    const runtime = (await harness.boot('not-started')) as PrototypeRuntime;
    const calls: unknown[] = [];
    const steps = defaultOnboardingSteps().map((step) =>
      step.id === 'profile'
        ? { ...step, apply: undefined, afterSubmit: (answer: unknown) => void calls.push(answer) }
        : step
    );
    render(OnboardingHarness, { runtime, steps });
    await expectStep('Step 1 of 5: Profile');
    await type('Full name', 'Olivia Hart');
    runtime.environment.set({ network: 'offline' });
    await next();
    expect(await screen.findByText(/offline/i)).toBeTruthy();
    expect(calls).toEqual([]);

    runtime.environment.set({ network: 'online' });
    await next();
    await expectStep('Step 2 of 5: Workspace');
    expect(calls).toEqual([expect.objectContaining({ fullName: 'Olivia Hart' })]);
  });
});
