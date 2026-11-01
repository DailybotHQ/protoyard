import {
  definePolicy,
  definePrototype,
  PermissionDeniedError,
  type PrototypeDefinition,
  parseManifest,
  type Row,
  type ScenarioDefinition,
  SimulatedServiceError,
} from '@protoyard/core';
import { createPrototypeRuntime, type ProtoyardRuntime } from '@protoyard/runtime';
import {
  composeScenario,
  fragments,
  generateTeam,
  PRESETS,
  presetScenario,
  validateWorld,
} from '@protoyard/scenarios';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { contextFor } from '../../../tests/support/generate-context.ts';
import { createHarness } from '../../../tests/support/runtime.ts';
import { type BillingService, billingTimeline, createBilling } from '../src/billing.ts';
import {
  createOnboarding,
  createOnboardingFlow,
  createPhoneServices,
  DONE_STEP,
  generateSaasWorld,
  mergeIntegrity,
  type OnboardingStepDefinition,
  type SaasOnboarding,
  saasFragments,
  saasIntegrity,
  saasScenarioIntegrity,
  ValidationError,
} from '../src/index.ts';
import { type SaasSubscription, saasStores, saasTables } from '../src/schema.ts';
import {
  createWorkspaces,
  WORKSPACE_CAPABILITIES,
  type WorkspacesRuntime,
} from '../src/workspaces.ts';

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
});

describe('step effects with identity writes', () => {
  const identitySteps = (fail: { now: boolean }): OnboardingStepDefinition[] => [
    {
      id: 'profile',
      label: 'Profile',
      schema: z.object({ fullName: z.string().trim().min(2, 'Enter your full name') }),
      // Writes the persona in the wizard's transaction, then may fail.
      effect: async (answer, { personaId, identity }) => {
        const persona = await identity.getPersona(personaId);
        if (!persona) throw new ValidationError({ form: 'No persona.' });
        await identity.putPersona({ ...persona, name: (answer as { fullName: string }).fullName });
        if (fail.now) throw new ValidationError({ form: 'Simulated failure after the write.' });
      },
    },
    { id: 'workspace', label: 'Workspace', optional: true },
  ];

  it('commits the effect, the answer and the position together or not at all', async () => {
    const { runtime } = await boot('not-started');
    const fail = { now: true };
    const onboarding = createOnboarding(runtime as unknown as ProtoyardRuntime, {
      steps: identitySteps(fail),
    });
    const before = runtime.session.principal()?.persona.name;

    await expect(onboarding.submit('profile', { fullName: 'Rolled Back' })).rejects.toThrow(
      'Simulated failure after the write.'
    );
    expect((await runtime.db.table('py_personas').get('user_0001'))?.name).toBe(before);
    expect(await runtime.db.table('saas_onboarding').count()).toBe(0);

    await runtime.overrides.set({ environment: { network: 'offline' } });
    fail.now = false;
    await expect(onboarding.submit('profile', { fullName: 'Offline Name' })).rejects.toBeInstanceOf(
      SimulatedServiceError
    );
    expect((await runtime.db.table('py_personas').get('user_0001'))?.name).toBe(before);

    await runtime.overrides.set({ environment: { network: 'online' } });
    const saved = await onboarding.submit('profile', { fullName: 'Committed Name' });
    expect(saved).toMatchObject({ currentStep: 'workspace', completedSteps: ['profile'] });
    // The session refreshes after the identity transaction commits.
    expect(runtime.session.principal()?.persona.name).toBe('Committed Name');
  });
});

// --- merged from workspaces.test.ts ---

describe('workspaces', () => {
  const REFERENCE_TIME = '2026-06-01T09:00:00.000Z';

  function createWorkspacesDefinition(namespace: string): PrototypeDefinition {
    return definePrototype({
      manifest: parseManifest({
        id: `example.${namespace}`,
        slug: namespace,
        name: 'SaaS workspaces fixture',
        version: '0.1.0',
        defaultScenario: 'active-month',
        defaultTheme: 'violet',
        storage: { namespace, schemaVersion: 1 },
        scenarios: ['active-month', 'viewer'],
      }),
      database: {
        versions: [
          {
            version: 1,
            stores: { projects: 'id, organizationId' },
          },
        ],
      },
      scenarios: [
        {
          id: 'active-month',
          extends: 'active-month',
          name: 'Active month',
          seed: 42,
          referenceTime: REFERENCE_TIME,
        },
        {
          id: 'viewer',
          extends: 'read-only-viewer',
          name: 'Viewer',
          seed: 7,
          referenceTime: REFERENCE_TIME,
        },
      ],
      policy: definePolicy({
        roles: {
          owner: ['*'],
          admin: ['*', WORKSPACE_CAPABILITIES.create, WORKSPACE_CAPABILITIES.rename],
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
            projects: [
              {
                id: ctx.ids.next('project'),
                organizationId: team.organization.id,
              },
            ],
          },
        };
      },
    });
  }

  type Db = ProtoyardRuntime['db'];
  const harnesses: ReturnType<typeof createHarness<Db>>[] = [];

  afterEach(() => {
    for (const h of harnesses.splice(0)) h.closeAll();
  });

  async function boot(namespace: string, scenario = 'active-month') {
    const harness = createHarness<Db>(createWorkspacesDefinition(namespace));
    harnesses.push(harness);
    // createPrototypeRuntime returns ProtoyardRuntime (with identity); the harness type is the core contract.
    const runtime = (await harness.boot(scenario)) as ProtoyardRuntime;
    return {
      harness,
      runtime,
      workspaces: createWorkspaces(runtime as WorkspacesRuntime),
    };
  }

  describe('createWorkspaces', () => {
    /** Make the actor `activeRole` in the active org A and `roleInB` in a new org B. */
    async function twoOrgs(namespace: string, activeRole: string, roleInB: string) {
      const booted = await boot(namespace);
      const { runtime } = booted;
      const principal = runtime.session.principal();
      const own = principal?.membership;
      if (!principal || !own) throw new Error('The fixture actor has no membership');
      const orgB = await runtime.identity.write(async (ops) => {
        await ops.putMembership({ ...own, role: activeRole });
        const organization = await ops.putOrganization({ name: 'Org B', type: 'company', size: 1 });
        await ops.putMembership({
          personaId: principal.persona.id,
          organizationId: organization.id,
          role: roleInB,
        });
        return organization;
      });
      expect(runtime.session.principal()?.organization?.id).toBe(own.organizationId);
      expect(runtime.session.principal()?.role).toBe(activeRole);
      return { ...booted, orgA: own.organizationId, orgB: orgB.id };
    }

    it('denies renaming another workspace where the actor is only a viewer, even as owner of the active one', async () => {
      const { runtime, workspaces, orgB } = await twoOrgs(
        'saas-ws-cross-rename',
        'owner',
        'viewer'
      );
      await expect(workspaces.rename(orgB, { name: 'Hijacked' })).rejects.toBeInstanceOf(
        PermissionDeniedError
      );
      expect(runtime.session.organizations().find((o) => o.id === orgB)?.name).toBe('Org B');
    });

    it('denies leave when the actor is the last owner', async () => {
      const { runtime, workspaces } = await boot('saas-ws-last-owner');
      const created = await workspaces.create({ name: 'Solo Co' });
      expect(runtime.session.principal()?.organization?.id).toBe(created.organization.id);

      await expect(workspaces.leave(created.organization.id)).rejects.toMatchObject({
        name: 'ValidationError',
        issues: { membership: expect.stringMatching(/at least one owner/i) },
      });
      expect(runtime.session.principal()?.organization?.id).toBe(created.organization.id);
      expect(workspaces.list().some((w) => w.organization.id === created.organization.id)).toBe(
        true
      );
    });
  });

  void PRESETS;
});

// --- merged from scenarios.test.ts ---

describe('scenarios', () => {
  /**
   * SaaS fragments + generateSaasWorld: deterministic kit rows for every
   * auth/billing state, zero integrity violations, and the signed-out nudge on
   * the real runtime.
   */

  const REFERENCE_TIME = '2026-06-01T09:00:00.000Z';
  const org = { id: 'org_0001', name: 'Acme Cloud', size: 4 };
  const at = (id: string, seed: number) => ({
    id,
    name: id,
    seed,
    referenceTime: REFERENCE_TIME,
    organization: org,
  });

  const scenarios = [
    composeScenario(PRESETS['active-month'], at('visitor', 1), saasFragments.signedOut()),
    composeScenario(
      PRESETS['brand-new-signup'],
      at('unverified', 2),
      saasFragments.unverifiedEmail()
    ),
    composeScenario(PRESETS['active-month'], at('mfa', 3), saasFragments.mfaEnrolled()),
    composeScenario(PRESETS['active-month'], at('invites', 4), saasFragments.pendingInvite(2)),
    composeScenario(PRESETS['first-week'], at('trial-ending', 5), saasFragments.trialEnding(2)),
    composeScenario(PRESETS['active-month'], at('past-due', 6), saasFragments.pastDue()),
    composeScenario(PRESETS['active-month'], at('multi', 7), saasFragments.multiWorkspace(3)),
    composeScenario(
      PRESETS['active-month'],
      at('linked', 8),
      saasFragments.oauthLinked('google', 'github')
    ),
    composeScenario(
      PRESETS['active-month'],
      at('combined', 9),
      saasFragments.trialEnding(1),
      saasFragments.mfaEnrolled(),
      saasFragments.oauthLinked('slack')
    ),
  ] as unknown as ScenarioDefinition[];
  const ids = scenarios.map((s) => (s as { id: string }).id);

  const world = (id: string, seed?: number) => {
    const ctx = contextFor(scenarios, id, seed);
    return { ctx, world: generateSaasWorld(ctx, { team: generateTeam(ctx) }) };
  };

  describe('saasFragments + generateSaasWorld', () => {
    it('every scenario: same seed gives identical rows and zero integrity violations', () => {
      for (const id of ids) {
        const a = world(id).world;
        const b = world(id).world;
        expect(JSON.stringify(b)).toBe(JSON.stringify(a));
        const violations = validateWorld(a, {
          ...saasScenarioIntegrity(),
          referenceTime: REFERENCE_TIME,
        });
        expect(violations).toEqual([]);
      }
    });
  });
});

// --- merged from billing.test.ts ---

describe('billing', () => {
  const REFERENCE_TIME = '2026-06-01T09:00:00.000Z';
  const CATALOG = [
    { id: 'starter', name: 'Starter', unitAmountCents: 10_000, interval: 'month' as const },
    { id: 'pro', name: 'Pro', unitAmountCents: 20_000, interval: 'month' as const },
    { id: 'annual', name: 'Annual', unitAmountCents: 180_000, interval: 'year' as const },
  ];

  function definition(namespace: string): PrototypeDefinition {
    return definePrototype({
      manifest: parseManifest({
        id: `example.${namespace}`,
        slug: namespace,
        name: 'Billing simulator fixture',
        version: '0.1.0',
        defaultScenario: 'active-month',
        defaultTheme: 'violet',
        storage: { namespace, schemaVersion: 2 },
        scenarios: ['active-month'],
      }),
      database: {
        versions: [
          { version: 1, stores: { projects: 'id' } },
          { version: 2, stores: saasStores() },
        ],
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
      generate(ctx) {
        const team = generateTeam(ctx);
        return {
          organizations: team.organizations,
          personas: team.personas,
          memberships: team.memberships,
          tables: saasTables(),
        };
      },
      timeline: billingTimeline,
      applyEvent: async (event, context) => {
        const service = services.get(namespace);
        if (service) await service.applyTimelineEvent(event, context);
      },
    });
  }

  const services = new Map<string, BillingService>();
  const open: ProtoyardRuntime[] = [];
  afterEach(() => {
    services.clear();
    for (const runtime of open.splice(0)) runtime.close();
  });

  async function boot(namespace: string) {
    const proto = definition(namespace);
    const runtime = await createPrototypeRuntime(proto, {
      indexedDB: new IDBFactory() as unknown as globalThis.IDBFactory,
      IDBKeyRange,
      sleep: async () => {},
    });
    open.push(runtime);
    await runtime.scenarios.ensureSeeded();
    const billing = createBilling(runtime, CATALOG);
    services.set(namespace, billing);
    return { runtime, billing };
  }

  describe('createBilling', () => {
    it('records a declined checkout attempt without changing the organization or subscription', async () => {
      const { runtime, billing } = await boot('billing-declined');
      const trial = await billing.startTrial({ planId: 'starter' });
      const result = await billing.checkout({ planId: 'pro', outcome: 'declined' });

      expect(result).toMatchObject({ outcome: 'declined', subscription: { id: trial.id } });
      expect(result.invoice.status).toBe('failed');
      expect(await billing.invoices()).toEqual([result.invoice]);
      expect(await runtime.db.rows<SaasSubscription>('saas_subscriptions').get(trial.id)).toEqual(
        trial
      );
      expect(runtime.session.principal()?.organization).toMatchObject({
        plan: 'starter',
        billingStatus: 'trialing',
      });
      expect(await runtime.db.rows('saas_inbox').count()).toBe(0);
    });
  });
});

// --- merged from phone.test.ts ---

describe('phone', () => {
  const REFERENCE_TIME = '2026-06-01T09:00:00.000Z';
  const definition: PrototypeDefinition = definePrototype({
    manifest: parseManifest({
      id: 'example.saas-phone',
      slug: 'saas-phone',
      name: 'SaaS phone fixture',
      version: '0.1.0',
      defaultScenario: 'visitor',
      defaultTheme: 'violet',
      storage: { namespace: 'saas-phone', schemaVersion: 1 },
      scenarios: ['visitor'],
    }),
    auth: { signedOutByDefault: true },
    database: { versions: [{ version: 1, stores: saasStores() }] },
    scenarios: [
      {
        id: 'visitor',
        extends: 'active-month',
        name: 'Signed-out visitor',
        seed: 123,
        referenceTime: REFERENCE_TIME,
      },
    ],
    policy: definePolicy({ roles: { owner: ['*'], admin: ['*'], member: [], viewer: [] } }),
    integrity: saasIntegrity(),
    generate(ctx) {
      const team = generateTeam(ctx);
      return {
        organizations: team.organizations,
        personas: team.personas,
        memberships: team.memberships,
        tables: saasTables(),
      };
    },
  });

  type Db = ProtoyardRuntime['db'];
  let harness = createHarness<Db>(definition);
  afterEach(() => {
    harness.closeAll();
    harness = createHarness<Db>(definition);
  });

  const boot = async () => (await harness.boot('visitor')) as ProtoyardRuntime;

  describe('simulated phone provider', () => {
    it('validates phone and code input before writing anything', async () => {
      const runtime = await boot();
      const phone = createPhoneServices(runtime);
      expect(() => phone.sendCode({ phone: '555', name: 'Alex Example' })).toThrow(ValidationError);
      await expect(
        phone.verifyCode({ challengeId: 'missing', code: '12x456' })
      ).rejects.toBeInstanceOf(ValidationError);
      expect(await runtime.db.rows('saas_tokens').toArray()).toHaveLength(0);
    });
  });
});
