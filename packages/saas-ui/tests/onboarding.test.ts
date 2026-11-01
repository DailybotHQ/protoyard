import {
  definePolicy,
  definePrototype,
  type PrototypeDefinition,
  type PrototypeRuntime,
  parseManifest,
} from '@protoyard/core';
import { type ProtoyardRuntime } from '@protoyard/runtime';
import { createWorkspaces, WORKSPACE_CAPABILITIES, type WorkspacesRuntime } from '@protoyard/saas';
import { generateTeam } from '@protoyard/scenarios';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { validateFormSchema } from '@texuli/forms/model';
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
import { fragments, presetScenario } from '../../scenarios/src/index.ts';
import {
  defaultOnboardingSteps,
  onboardingFormSchema,
  REVIEW_FIELD,
} from '../src/screens/onboarding/steps.ts';
import CustomStepHarness from './fixtures/CustomStepHarness.svelte';
import OnboardingHarness from './fixtures/OnboardingHarness.svelte';
import WorkspaceSwitcherHarness from './fixtures/WorkspaceSwitcherHarness.svelte';

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

/**
 * "Step 3 of 5: Invite teammates": the Texuli form shows that step's heading,
 * and its panel is the third of five (the last one is the review).
 */
const expectStep = (label: string) =>
  waitFor(() => {
    const [, position, total, title] = /^Step (\d+) of (\d+): (.+)$/.exec(label) ?? [];
    const panel = document.querySelector('[data-py-saas-form="onboarding"] .tx-forms__step');
    expect(panel?.querySelector('.tx-forms__step-title')?.textContent).toBe(title);
    expect(panel?.getAttribute('data-step')).toBe(
      position === total ? 'review' : `step-${Number(position) - 1}`
    );
  });
const next = () => fireEvent.click(screen.getByRole('button', { name: /^(Next|Finish setup)/ }));
const field = (label: string) =>
  screen.getByLabelText(new RegExp(`^${label}`), { selector: 'input, textarea, button' });
const type = (label: string, value: string) => fireEvent.input(field(label), { target: { value } });

describe('onboarding wizard screen', () => {
  it('runs every step for real: profile, workspace rename, invites, color mode, finish', async () => {
    const runtime = await harness.boot('not-started');
    let completed = 0;
    render(OnboardingHarness, { runtime, onComplete: () => completed++ });
    await expectStep('Step 1 of 5: Profile');

    // Field errors come back inline and nothing moves.
    await type('Full name', 'O');
    await next();
    // Inline under the field and in the Texuli error summary.
    expect((await screen.findAllByText('Enter your full name')).length).toBeGreaterThan(0);
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
    expect(
      (await screen.findAllByText('Use fictional addresses at example.com')).length
    ).toBeGreaterThan(0);
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

  it('renders a prototype step from its snippet and validates it', async () => {
    const runtime = (await harness.boot('not-started')) as PrototypeRuntime;
    render(CustomStepHarness, { runtime });
    await expectStep('Step 1 of 2: Your goal');
    await fireEvent.click(screen.getByRole('button', { name: /^Next/ }));
    expect(await screen.findByTestId('goal-error')).toBeTruthy();
    await fireEvent.click(screen.getByLabelText(/Ship faster/));
    await fireEvent.click(screen.getByRole('button', { name: /^Next/ }));
    await expectStep('Step 2 of 2: Done');
    const saved = await createOnboarding(runtime as never, {
      steps: [{ id: 'goal', label: 'Your goal' }],
    }).state();
    expect(saved.answers).toEqual({ goal: { goal: 'ship' } });
  });
});

// --- merged from onboarding-form.test.ts ---

describe('onboarding-form', () => {
  const steps = defaultOnboardingSteps();
  const options = (
    readOnly: (id: string) => boolean = () => false,
    custom = new Set<string>()
  ) => ({
    title: 'Set up your account',
    doneLabel: 'Done',
    custom,
    readOnly: (step: { id: string }) => readOnly(step.id),
  });

  describe('onboarding wizard as a @texuli/forms schema', () => {
    it('compiles every default step plus the review, with positional field names', () => {
      const result = validateFormSchema(onboardingFormSchema(steps, options()), {
        tier: 'developer',
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.form.schema.steps?.map((step) => step.title)).toEqual([
        'Profile',
        'Workspace',
        'Invite teammates',
        'Preferences',
        'Done',
      ]);
      expect(result.form.byName.get('s0_f0')?.field).toMatchObject({
        type: 'text',
        label: 'Full name',
        required: true,
        // The step's zod message, so Texuli's required check says the same thing.
        messages: { required: 'Enter your full name' },
      });
      expect(result.form.byName.get('s2_f0')?.field).toMatchObject({ type: 'textarea', rows: 3 });
      expect(result.form.byName.get('s3_f0')?.field.options?.map((o) => o.value)).toEqual([
        'system',
        'light',
        'dark',
      ]);
      expect(result.form.byName.get('review')?.field).toMatchObject({ kind: REVIEW_FIELD });
    });
  });
});

// --- merged from workspace-switcher.test.ts ---

describe('workspace-switcher', () => {
  const REFERENCE_TIME = '2026-06-01T09:00:00.000Z';

  function createDefinition(namespace: string): PrototypeDefinition {
    return definePrototype({
      manifest: parseManifest({
        id: `example.${namespace}`,
        slug: namespace,
        name: 'Workspace switcher fixture',
        version: '0.1.0',
        defaultScenario: 'active-month',
        defaultTheme: 'violet',
        storage: { namespace, schemaVersion: 1 },
        scenarios: ['active-month'],
      }),
      database: {
        versions: [{ version: 1, stores: { projects: 'id, organizationId' } }],
      },
      scenarios: [
        {
          id: 'active-month',
          extends: 'active-month',
          name: 'Active month',
          seed: 42,
          referenceTime: REFERENCE_TIME,
        },
      ],
      policy: definePolicy({
        roles: {
          owner: ['*'],
          admin: [WORKSPACE_CAPABILITIES.create, WORKSPACE_CAPABILITIES.rename],
          member: [WORKSPACE_CAPABILITIES.create, WORKSPACE_CAPABILITIES.leave],
          viewer: [],
        },
      }),
      integrity: {
        relations: { projects: { organizationId: 'py_organizations' } },
      },
      generate(ctx) {
        const team = generateTeam(ctx);
        return {
          organizations: team.organizations,
          personas: team.personas,
          memberships: team.memberships,
          tables: {
            projects: [{ id: ctx.ids.next('project'), organizationId: team.organization.id }],
          },
        };
      },
    });
  }

  type Db = ProtoyardRuntime['db'];
  const harnesses: ReturnType<typeof createHarness<Db>>[] = [];

  afterEach(() => {
    cleanup();
    for (const h of harnesses.splice(0)) h.closeAll();
  });

  async function boot(namespace: string) {
    const harness = createHarness<Db>(createDefinition(namespace));
    harnesses.push(harness);
    const runtime = (await harness.boot('active-month')) as ProtoyardRuntime;
    const workspaces = createWorkspaces(runtime as WorkspacesRuntime);
    return { runtime, workspaces };
  }

  describe('workspace switcher', () => {
    it('creates a workspace from the dialog and activates it', async () => {
      const { runtime, workspaces } = await boot('saas-ui-ws-create');
      const before = runtime.session.principal()?.organization?.id;
      expect(before).toBeTruthy();

      render(WorkspaceSwitcherHarness, { runtime, workspaces });

      await fireEvent.click(screen.getByTestId('workspace-switcher-trigger'));
      await fireEvent.click(await screen.findByRole('menuitem', { name: 'Create workspace' }));

      const nameInput = await screen.findByTestId('workspace-create-name');
      await fireEvent.input(nameInput, { target: { value: 'Acme Labs' } });
      await fireEvent.click(screen.getByTestId('workspace-create-submit'));

      await waitFor(() => {
        expect(runtime.session.principal()?.organization?.name).toBe('Acme Labs');
        expect(screen.getByTestId('active-org-name').textContent).toBe('Acme Labs');
        expect(screen.getByTestId('active-org-id').textContent).not.toBe(before);
      });
      expect(workspaces.list().some((w) => w.organization.name === 'Acme Labs')).toBe(true);
    });
  });
});
