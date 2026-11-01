import {
  definePolicy,
  definePrototype,
  PermissionDeniedError,
  type PrototypeDefinition,
  parseManifest,
  SimulatedServiceError,
  ValidationError,
} from '@protoyard/core';
import { createPrototypeRuntime, type ProtoyardRuntime } from '@protoyard/runtime';
import { generateTeam, PRESETS } from '@protoyard/scenarios';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import { createInbox } from '../src/inbox.ts';
import {
  createAuthServices,
  createInvitationServices,
  createMagicLinkServices,
  createMfaServices,
  createOAuthSimulator,
  mergeIntegrity,
  type OAuthIdentity,
  type OAuthProviderScenarios,
  SAAS_PROVIDERS,
  SAAS_ROW_SCHEMAS,
  type SaasAccount,
  type SaasInboxMessage,
  SaasInboxMessageSchema,
  type SaasInvitation,
  type SaasSessionLog,
  SaasSubscriptionSchema,
  type SaasToken,
  saasIntegrity,
  saasStores,
  saasTables,
  simulatedTotpCode,
} from '../src/index.ts';

/**
 * Simulated email/password auth on the REAL runtime with an in-memory
 * IndexedDB. `reload()` closes the runtime and reopens it on the same
 * storage, exactly like a browser reload.
 */

const REFERENCE_TIME = '2026-06-01T09:00:00.000Z';
const SEEDED = { email: 'ada.seed@example.com', password: 'correct horse' };

const definition: PrototypeDefinition = definePrototype({
  manifest: parseManifest({
    id: 'example.saas-auth',
    slug: 'saas-auth',
    name: 'SaaS auth fixture',
    version: '0.1.0',
    defaultScenario: 'visitor',
    defaultTheme: 'violet',
    storage: { namespace: 'saas-auth', schemaVersion: 1 },
    scenarios: ['visitor'],
  }),
  auth: { signedOutByDefault: true },
  database: { versions: [{ version: 1, stores: saasStores() }] },
  scenarios: [
    {
      id: 'visitor',
      extends: 'active-month',
      name: 'Signed-out visitor',
      seed: 7,
      referenceTime: REFERENCE_TIME,
    },
  ],
  integrity: mergeIntegrity(saasIntegrity()),
  generate(ctx) {
    const team = generateTeam(ctx);
    const owner = team.personas[0];
    if (!owner) throw new Error('generateTeam returned no personas');
    const account: SaasAccount = {
      id: ctx.ids.next('acct'),
      personaId: owner.id,
      email: SEEDED.email,
      emailVerified: true,
      simulatedPassword: SEEDED.password,
      providers: [],
      status: 'active',
      failedAttempts: 0,
      createdAt: owner.joinedAt,
      lastSignInAt: null,
    };
    return {
      organizations: team.organizations,
      personas: team.personas,
      memberships: team.memberships,
      tables: saasTables({ saas_accounts: [account] }),
    };
  },
});

type Db = ProtoyardRuntime['db'];
let harness = createHarness<Db>(definition);
afterEach(() => {
  harness.closeAll();
  harness = createHarness<Db>(definition);
});

const asRuntime = (runtime: unknown) => runtime as ProtoyardRuntime;
const boot = async () => asRuntime(await harness.boot('visitor'));
const reload = async (runtime: ProtoyardRuntime) =>
  asRuntime(await harness.reload(runtime as never));

const issuesOf = async (promise: Promise<unknown>) => {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ValidationError);
  return (error as ValidationError).issues;
};

const signUpInput = {
  name: 'Olivia Hart',
  email: 'Olivia.Hart@Example.com',
  password: 'sup3r-simulated',
  organizationName: 'Hart Studio',
};

describe('createAuthServices on the real runtime', () => {
  it('sign-up → verify via the simulated inbox → sign-in → reload stays signed in', async () => {
    let runtime = await boot();
    let auth = createAuthServices(runtime, { productName: 'Acme' });
    expect(runtime.session.isSignedIn()).toBe(false);

    const { account, needsVerification } = await auth.signUp(signUpInput);
    expect(needsVerification).toBe(true);
    expect(account).toMatchObject({ email: 'olivia.hart@example.com', emailVerified: false });
    expect(runtime.session.isSignedIn()).toBe(false);

    // The persona, a workspace and an owner membership exist now.
    const persona = runtime.session.personas().find((p) => p.id === account.personaId);
    expect(persona).toMatchObject({ name: 'Olivia Hart', onboardingComplete: false });
    const membership = runtime.session.memberships().find((m) => m.personaId === persona?.id);
    expect(membership?.role).toBe('owner');
    expect(
      runtime.session.organizations().find((o) => o.id === membership?.organizationId)?.name
    ).toBe('Hart Studio');

    // Not verified yet: sign-in is refused, and the attempt is logged.
    expect(await issuesOf(auth.signIn(signUpInput))).toEqual({
      form: 'Confirm your email first. Check your simulated inbox.',
    });

    const [message] = await createInbox(runtime).list({ recipient: account.email });
    expect(message).toMatchObject({ kind: 'verify-email', subject: 'Confirm your email for Acme' });
    const tokenId = new URLSearchParams(message?.action?.href.split('?')[1]).get('token') ?? '';
    expect((await auth.verifyEmail(tokenId)).emailVerified).toBe(true);
    expect(await issuesOf(auth.verifyEmail(tokenId))).toEqual({
      form: 'This confirmation link was already used.',
    });

    const signedIn = await auth.signIn(signUpInput);
    expect(signedIn.lastSignInAt).not.toBeNull();
    expect(runtime.session.principal()?.persona.id).toBe(account.personaId);

    runtime = await reload(runtime);
    auth = createAuthServices(runtime);
    expect(runtime.session.isSignedIn()).toBe(true);
    expect(runtime.session.principal()?.persona.id).toBe(account.personaId);
    expect((await auth.account())?.email).toBe('olivia.hart@example.com');

    await auth.signOut();
    runtime = await reload(runtime);
    expect(runtime.session.isSignedIn()).toBe(false);
    const log = await runtime.db.rows<SaasSessionLog>('saas_sessions_log').toArray();
    expect(log.map((e) => `${e.method}:${e.outcome}`).sort()).toEqual([
      'password:failure',
      'password:success',
      'sign-out:success',
      'sign-up:success',
    ]);
  });

  it('refuses duplicate emails, non-example domains and weak input with field messages', async () => {
    const runtime = await boot();
    const auth = createAuthServices(runtime);
    expect(await issuesOf(auth.signUp({ ...signUpInput, email: SEEDED.email }))).toEqual({
      email: 'An account with this email already exists',
    });
    expect(await issuesOf(auth.signUp({ ...signUpInput, email: 'real.person@gmail.com' }))).toEqual(
      { email: 'Use a fictional address at example.com' }
    );
    expect(await issuesOf(auth.signUp({ ...signUpInput, name: 'O', password: 'short' }))).toEqual({
      name: 'Enter your name',
      password: 'Use at least 8 characters',
    });
    expect(runtime.session.personas().some((p) => p.name === 'Olivia Hart')).toBe(false);
    expect(await runtime.db.rows('saas_accounts').count()).toBe(1);
  });

  it('reports unknown emails and wrong passwords, then locks after the threshold', async () => {
    const runtime = await boot();
    const auth = createAuthServices(runtime, { lockoutThreshold: 3 });
    expect(await issuesOf(auth.signIn({ email: 'nobody@example.com', password: 'x' }))).toEqual({
      email: 'No account uses this email',
    });
    const wrong = { email: SEEDED.email, password: 'wrong' };
    expect((await issuesOf(auth.signIn(wrong))).password).toBe(
      'Incorrect password. 2 attempts left.'
    );
    expect((await issuesOf(auth.signIn(wrong))).password).toBe(
      'Incorrect password. 1 attempt left.'
    );
    expect((await issuesOf(auth.signIn(wrong))).password).toBe(
      'Incorrect password. The account is now locked.'
    );
    // Even the right password is refused while locked.
    expect((await issuesOf(auth.signIn(SEEDED))).form).toMatch(/locked/);
    expect(runtime.session.isSignedIn()).toBe(false);

    const [account] = await runtime.db.rows<SaasAccount>('saas_accounts').toArray();
    expect(account).toMatchObject({ status: 'locked', failedAttempts: 3 });
    const failures = (await runtime.db.rows<SaasSessionLog>('saas_sessions_log').toArray()).map(
      (e) => e.reason
    );
    expect(failures.sort()).toEqual([
      'locked',
      'locked',
      'unknown-email',
      'wrong-password',
      'wrong-password',
    ]);
  });

  it('offline sign-up and sign-in write nothing', async () => {
    const runtime = await boot();
    const auth = createAuthServices(runtime);
    await runtime.overrides.set({ environment: { network: 'offline' } });
    await expect(auth.signUp(signUpInput)).rejects.toBeInstanceOf(SimulatedServiceError);
    await expect(auth.signIn(SEEDED)).rejects.toBeInstanceOf(SimulatedServiceError);
    expect(await runtime.db.rows('saas_accounts').count()).toBe(1);
    expect(await runtime.db.rows('saas_inbox').count()).toBe(0);
    expect(await runtime.db.rows('saas_sessions_log').count()).toBe(0);
    expect(runtime.session.personas().some((p) => p.name === 'Olivia Hart')).toBe(false);
    expect(runtime.session.isSignedIn()).toBe(false);
  });
});

// --- merged from magic-link-mfa.test.ts ---

describe('magic-link-mfa', () => {
  const REFERENCE_TIME = '2026-06-01T09:00:00.000Z';
  const SEEDED = { email: 'ada.seed@example.com', password: 'correct horse' };

  const definition: PrototypeDefinition = definePrototype({
    manifest: parseManifest({
      id: 'example.saas-magic-mfa',
      slug: 'saas-magic-mfa',
      name: 'SaaS magic-link MFA fixture',
      version: '0.1.0',
      defaultScenario: 'visitor',
      defaultTheme: 'violet',
      storage: { namespace: 'saas-magic-mfa', schemaVersion: 1 },
      scenarios: ['visitor'],
    }),
    auth: { signedOutByDefault: true },
    database: { versions: [{ version: 1, stores: saasStores() }] },
    scenarios: [
      {
        id: 'visitor',
        extends: 'active-month',
        name: 'Signed-out visitor',
        seed: 11,
        referenceTime: REFERENCE_TIME,
      },
    ],
    integrity: mergeIntegrity(saasIntegrity()),
    generate(ctx) {
      const team = generateTeam(ctx);
      const owner = team.personas[0];
      if (!owner) throw new Error('generateTeam returned no personas');
      const account: SaasAccount = {
        id: ctx.ids.next('acct'),
        personaId: owner.id,
        email: SEEDED.email,
        emailVerified: true,
        simulatedPassword: SEEDED.password,
        providers: [],
        status: 'active',
        failedAttempts: 0,
        createdAt: owner.joinedAt,
        lastSignInAt: null,
      };
      return {
        organizations: team.organizations,
        personas: team.personas,
        memberships: team.memberships,
        tables: saasTables({ saas_accounts: [account] }),
      };
    },
  });

  type Db = ProtoyardRuntime['db'];
  let harness = createHarness<Db>(definition);
  afterEach(() => {
    harness.closeAll();
    harness = createHarness<Db>(definition);
  });

  const asRuntime = (runtime: unknown) => runtime as ProtoyardRuntime;

  /** The challenge id of an `mfa-required` result (fails the test otherwise). */
  function challengeOf(result: { status: string; challenge?: { id: string } }): string {
    if (result.status !== 'mfa-required' || !result.challenge) {
      throw new Error(`Expected an mfa-required result, got ${result.status}`);
    }
    return result.challenge.id;
  }
  const boot = async () => asRuntime(await harness.boot('visitor'));

  async function enrollActiveMfa(runtime: ProtoyardRuntime) {
    const mfa = createMfaServices(runtime);
    // Sign in without MFA first so enroll can run.
    const first = await mfa.signInWithPassword(SEEDED);
    expect(first.status).toBe('signed-in');
    const started = await mfa.enroll();
    await mfa.confirmEnroll(started.currentCode);
    await runtime.session.signOut();
    return { mfa, seed: started.mfa.seed, recoveryCodes: started.recoveryCodes };
  }

  describe('magic-link', () => {
    it('delivers a link that signs in once and rejects reuse and expiry', async () => {
      const runtime = await boot();
      const magic = createMagicLinkServices(runtime, { ttlMinutes: 15, productName: 'Acme' });

      const issued = await magic.issue({ email: SEEDED.email });
      expect(issued.delivered).toBe(true);
      expect(issued.token?.kind).toBe('magic-link');
      expect(issued.message?.action?.href).toContain('#/auth/magic?token=');
      expect(issued.message?.kind).toBe('magic-link');

      const signed = await magic.consume(issued.token!.id);
      expect(signed.status).toBe('signed-in');
      expect(runtime.session.isSignedIn()).toBe(true);
      expect(runtime.session.principal()?.persona.id).toBe(signed.account.personaId);

      await runtime.session.signOut();
      await expect(magic.consume(issued.token!.id)).rejects.toBeInstanceOf(ValidationError);
      await expect(magic.consume(issued.token!.id)).rejects.toMatchObject({
        issues: { form: expect.stringMatching(/already used/i) },
      });

      const again = await magic.issue({ email: SEEDED.email });
      runtime.clock.commitAdvance({ minutes: 16 });
      await expect(magic.consume(again.token!.id)).rejects.toMatchObject({
        issues: { form: expect.stringMatching(/expired/i) },
      });
      expect(runtime.session.isSignedIn()).toBe(false);
    });

    it('does not reveal whether an unknown email exists', async () => {
      const runtime = await boot();
      const magic = createMagicLinkServices(runtime);
      const ghost = await magic.issue({ email: 'nobody@example.com' });
      expect(ghost).toEqual({ delivered: false, token: null, message: null });
    });
  });

  describe('MFA', () => {
    it('blocks password and magic-link sign-in until a valid simulated code', async () => {
      const runtime = await boot();
      const { mfa, seed } = await enrollActiveMfa(runtime);

      const password = await mfa.signInWithPassword(SEEDED);
      expect(password.status).toBe('mfa-required');
      expect(runtime.session.isSignedIn()).toBe(false);

      await expect(
        mfa.completeChallenge(challengeOf(password), { code: '000000' })
      ).rejects.toMatchObject({ issues: { code: expect.stringMatching(/not correct/i) } });
      expect(runtime.session.isSignedIn()).toBe(false);

      const code = simulatedTotpCode(seed, runtime.clock.now().getTime());
      const finished = await mfa.completeChallenge(challengeOf(password), { code });
      expect(finished.email).toBe(SEEDED.email);
      expect(runtime.session.isSignedIn()).toBe(true);

      await runtime.session.signOut();
      const magic = createMagicLinkServices(runtime);
      const link = await magic.issue({ email: SEEDED.email });
      const consumed = await magic.consume(link.token!.id);
      expect(consumed.status).toBe('mfa-required');
      expect(runtime.session.isSignedIn()).toBe(false);

      const nextCode = createMfaServices(runtime).authenticatorPanel(seed).code;
      await mfa.completeChallenge(challengeOf(consumed), { code: nextCode });
      expect(runtime.session.isSignedIn()).toBe(true);
    });
  });

  describe('MFA challenge tokens (H1)', () => {
    it('refuses a bare account id, a reused challenge and an expired challenge', async () => {
      const runtime = await boot();
      const { mfa, seed } = await enrollActiveMfa(runtime);
      const codeNow = () => simulatedTotpCode(seed, runtime.clock.now().getTime());
      const account = await runtime.db
        .rows<SaasAccount>('saas_accounts')
        .where('email')
        .equals(SEEDED.email)
        .first();
      if (!account) throw new Error('The seeded account is missing');

      // No first factor at all: the account id is not a challenge.
      await expect(mfa.completeChallenge(account.id, { code: codeNow() })).rejects.toMatchObject({
        issues: { form: expect.stringMatching(/not valid/i) },
      });
      expect(await mfa.describeChallenge(account.id)).toBeNull();
      expect(runtime.session.isSignedIn()).toBe(false);

      const first = await mfa.signInWithPassword(SEEDED);
      const challengeId = challengeOf(first);
      expect(challengeId).not.toBe(account.id);
      const token = await runtime.db.rows<SaasToken>('saas_tokens').get(challengeId);
      expect(token).toMatchObject({
        kind: 'mfa-challenge',
        accountId: account.id,
        consumedAt: null,
      });
      expect(await mfa.describeChallenge(challengeId)).toMatchObject({
        email: SEEDED.email,
        code: codeNow(),
        simulated: true,
      });

      await mfa.completeChallenge(challengeId, { code: codeNow() });
      expect(runtime.session.isSignedIn()).toBe(true);
      await runtime.session.signOut();

      // Single use.
      await expect(mfa.completeChallenge(challengeId, { code: codeNow() })).rejects.toMatchObject({
        issues: { form: expect.stringMatching(/already used/i) },
      });
      expect(await mfa.describeChallenge(challengeId)).toBeNull();
      expect(runtime.session.isSignedIn()).toBe(false);

      // Short-lived.
      const late = challengeOf(await mfa.signInWithPassword(SEEDED));
      runtime.clock.commitAdvance({ minutes: 11 });
      await expect(mfa.completeChallenge(late, { code: codeNow() })).rejects.toBeInstanceOf(
        ValidationError
      );
      await expect(mfa.completeChallenge(late, { code: codeNow() })).rejects.toMatchObject({
        issues: { form: expect.stringMatching(/expired/i) },
      });
      expect(runtime.session.isSignedIn()).toBe(false);
    });
  });
});

// --- merged from invitations.test.ts ---

describe('invitations', () => {
  const REFERENCE_TIME = '2026-06-01T09:00:00.000Z';
  const OWNER_EMAIL = 'ada@example.com';
  const OWNER_PASSWORD = 'simulated password';
  const definition: PrototypeDefinition = definePrototype({
    manifest: parseManifest({
      id: 'example.saas-reset-invites',
      slug: 'saas-reset-invites',
      name: 'SaaS reset and invitation fixture',
      version: '0.1.0',
      defaultScenario: 'active',
      defaultTheme: 'violet',
      storage: { namespace: 'saas-reset-invites', schemaVersion: 1 },
      scenarios: ['active'],
    }),
    auth: { signedOutByDefault: true },
    database: {
      // `invite_notes` is a domain table that invitation side effects write.
      versions: [{ version: 1, stores: { ...saasStores(), invite_notes: 'id, invitationId' } }],
    },
    scenarios: [
      {
        id: 'active',
        extends: 'active-month',
        name: 'Workspace owner',
        seed: 17,
        referenceTime: REFERENCE_TIME,
      },
    ],
    policy: definePolicy({
      roles: { owner: ['*'], admin: ['members:invite'], member: [], viewer: [] },
    }),
    integrity: mergeIntegrity(saasIntegrity()),
    generate(ctx) {
      const team = generateTeam(ctx);
      const owner = team.personas[0];
      if (!owner) throw new Error('generateTeam returned no personas');
      const account: SaasAccount = {
        id: ctx.ids.next('acct'),
        personaId: owner.id,
        email: OWNER_EMAIL,
        emailVerified: true,
        simulatedPassword: OWNER_PASSWORD,
        providers: [],
        status: 'active',
        failedAttempts: 0,
        createdAt: owner.joinedAt,
        lastSignInAt: null,
      };
      return {
        organizations: team.organizations,
        personas: team.personas,
        memberships: team.memberships.map((membership) =>
          membership.personaId === owner.id ? { ...membership, role: 'owner' } : membership
        ),
        tables: saasTables({ saas_accounts: [account] }),
      };
    },
  });

  type Db = ProtoyardRuntime['db'];
  let harness = createHarness<Db>(definition);
  afterEach(() => {
    harness.closeAll();
    harness = createHarness<Db>(definition);
  });

  const boot = async () => (await harness.boot('active')) as ProtoyardRuntime;

  async function signedInRuntime() {
    const runtime = await boot();
    const account = await runtime.db
      .rows<SaasAccount>('saas_accounts')
      .where('email')
      .equals(OWNER_EMAIL)
      .first();
    if (!account) throw new Error('The fixture owner account was not generated');
    await runtime.session.signIn(account.personaId);
    return runtime;
  }

  describe('workspace invitations', () => {
    it('rejects expired invitations and denies a viewer even when calling the service directly', async () => {
      const runtime = await signedInRuntime();
      const invites = createInvitationServices(runtime, { ttlDays: 1 });
      const expired = await invites.create({ email: 'katherine@example.com', role: 'member' });
      runtime.clock.commitAdvance({ days: 2 });
      await expect(invites.accept({ tokenId: expired.token.id })).rejects.toMatchObject({
        issues: { form: expect.stringMatching(/expired/i) },
      });

      const own = runtime.session.principal()?.membership;
      if (!own) throw new Error('The fixture owner has no membership');
      await runtime.identity.write((ops) => ops.putMembership({ ...own, role: 'viewer' }));
      await expect(
        invites.create({ email: 'alan@example.com', role: 'member' })
      ).rejects.toBeInstanceOf(PermissionDeniedError);
    });
  });

  type InviteNote = {
    id: string;
    invitationId: string;
    tokenId: string;
    messageId: string;
    note: string;
  };

  async function inviteCounts(runtime: ProtoyardRuntime) {
    return {
      invitations: await runtime.db.rows<SaasInvitation>('saas_invitations').count(),
      tokens: await runtime.db.rows<SaasToken>('saas_tokens').count(),
      inbox: await runtime.db.rows<SaasInboxMessage>('saas_inbox').count(),
      notes: await runtime.db.rows<InviteNote>('invite_notes').count(),
    };
  }

  describe('invitation side effects', () => {
    it('rolls back the invitation, token, inbox message and side-effect writes when it rejects', async () => {
      const runtime = await signedInRuntime();
      const invites = createInvitationServices(runtime, { tables: ['invite_notes'] });
      const before = await inviteCounts(runtime);
      let seen: { invitationId: string; tokenId: string } | null = null;
      const failure = new Error('Seat limit reached (simulated).');
      await expect(
        invites.create(
          { email: 'katherine@example.com', role: 'member' },
          async (invitation, ctx) => {
            seen = { invitationId: invitation.id, tokenId: ctx.token.id };
            await ctx.table<InviteNote>('invite_notes').add({
              id: 'note_rolled_back',
              invitationId: invitation.id,
              tokenId: ctx.token.id,
              messageId: ctx.message.id,
              note: 'Written, then rolled back.',
            });
            throw failure;
          }
        )
      ).rejects.toBe(failure);
      expect(await inviteCounts(runtime)).toEqual(before);
      expect(seen).not.toBeNull();
      const { invitationId, tokenId } = seen as unknown as {
        invitationId: string;
        tokenId: string;
      };
      expect(
        await runtime.db.rows<SaasInvitation>('saas_invitations').get(invitationId)
      ).toBeUndefined();
      expect(await runtime.db.rows<SaasToken>('saas_tokens').get(tokenId)).toBeUndefined();
      expect(
        await runtime.db.rows<InviteNote>('invite_notes').get('note_rolled_back')
      ).toBeUndefined();
      expect((await invites.preview(tokenId)).status).toBe('unknown');
      // The same email can be invited again once the failed attempt is gone.
      const retry = await invites.create({ email: 'katherine@example.com', role: 'member' });
      expect(retry.effect).toBeUndefined();
      expect((await inviteCounts(runtime)).invitations).toBe(before.invitations + 1);
    });
  });
});

// --- merged from oauth.test.ts ---

describe('oauth', () => {
  const REFERENCE_TIME = '2026-06-01T09:00:00.000Z';
  const SEEDED = { email: 'ada.seed@example.com', password: 'correct horse' };
  let generatedIdentity: OAuthIdentity;

  const definition: PrototypeDefinition = definePrototype({
    manifest: parseManifest({
      id: 'example.saas-oauth',
      slug: 'saas-oauth',
      name: 'SaaS OAuth fixture',
      version: '0.1.0',
      defaultScenario: 'visitor',
      defaultTheme: 'violet',
      storage: { namespace: 'saas-oauth', schemaVersion: 1 },
      scenarios: ['visitor'],
    }),
    auth: { signedOutByDefault: true },
    database: { versions: [{ version: 1, stores: saasStores() }] },
    scenarios: [
      {
        id: 'visitor',
        extends: 'active-month',
        name: 'Signed-out visitor',
        seed: 19,
        referenceTime: REFERENCE_TIME,
      },
    ],
    integrity: saasIntegrity(),
    generate(ctx) {
      const team = generateTeam(ctx);
      const owner = team.personas[0];
      if (!owner) throw new Error('generateTeam returned no personas');
      const firstName = ctx.faker.person.firstName();
      const lastName = ctx.faker.person.lastName();
      generatedIdentity = {
        subject: ctx.ids.next('oauth'),
        name: `${firstName} ${lastName}`,
        email: ctx.faker.internet
          .email({ firstName, lastName, provider: 'example.com' })
          .toLowerCase(),
        emailShared: true,
      };
      const account: SaasAccount = {
        id: ctx.ids.next('acct'),
        personaId: owner.id,
        email: SEEDED.email,
        emailVerified: true,
        simulatedPassword: SEEDED.password,
        providers: [],
        status: 'active',
        failedAttempts: 0,
        createdAt: owner.joinedAt,
        lastSignInAt: null,
      };
      return {
        organizations: team.organizations,
        personas: team.personas,
        memberships: team.memberships,
        tables: saasTables({ saas_accounts: [account] }),
      };
    },
  });

  type Db = ProtoyardRuntime['db'];
  let harness = createHarness<Db>(definition);
  afterEach(() => {
    harness.closeAll();
    harness = createHarness<Db>(definition);
  });

  const asRuntime = (runtime: unknown) => runtime as ProtoyardRuntime;
  const boot = async () => asRuntime(await harness.boot('visitor'));

  function profileFor(provider: (typeof SAAS_PROVIDERS)[number]): OAuthIdentity {
    const local = generatedIdentity.email.split('@')[0] ?? 'guest';
    return {
      ...generatedIdentity,
      subject: `${provider}_${generatedIdentity.subject}`,
      email: `${provider}.${local}@example.com`,
    };
  }

  function scenariosFor(
    provider: (typeof SAAS_PROVIDERS)[number],
    identity: OAuthIdentity,
    outcome: 'success' | 'consent-denied' | 'email-not-shared' | 'provider-error' = 'success'
  ): OAuthProviderScenarios {
    return { [provider]: { identity, outcome } };
  }

  describe('createOAuthSimulator on the real runtime', () => {
    it('records explicit denial and rejects a consumed state on replay', async () => {
      const runtime = await boot();
      const oauth = createOAuthSimulator(runtime, scenariosFor('slack', profileFor('slack')));
      const denied = await oauth.start('slack', 'sign-in');
      expect(await oauth.deny(denied.state)).toEqual({ status: 'denied', provider: 'slack' });
      await expect(oauth.approve(denied.state)).rejects.toBeInstanceOf(ValidationError);

      const approved = await oauth.start('slack', 'sign-up');
      expect((await oauth.approve(approved.state)).status).toBe('signed-up');
      await expect(oauth.approve(approved.state)).rejects.toBeInstanceOf(ValidationError);
      const token = await runtime.db.rows('saas_tokens').where('id').equals(approved.state).first();
      expect(token?.consumedAt).toBeTruthy();
    });
  });
});

// --- merged from inbox.test.ts ---

describe('inbox', () => {
  const REFERENCE_TIME = '2026-06-01T09:00:00.000Z';

  function createInboxDefinition(namespace: string): PrototypeDefinition {
    return definePrototype({
      manifest: parseManifest({
        id: `example.${namespace}`,
        slug: namespace,
        name: 'SaaS inbox fixture',
        version: '0.1.0',
        defaultScenario: 'active-month',
        defaultTheme: 'violet',
        storage: { namespace, schemaVersion: 2 },
        scenarios: ['active-month'],
      }),
      database: {
        versions: [
          { version: 1, stores: { projects: 'id, organizationId' } },
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
      integrity: mergeIntegrity(
        { relations: { projects: { organizationId: 'py_organizations' } } },
        saasIntegrity()
      ),
      generate(ctx) {
        const team = generateTeam(ctx);
        const owner = team.personas[0];
        if (!owner) throw new Error('generateTeam returned no personas');
        const accounts: SaasAccount[] = team.personas.map((persona) =>
          SAAS_ROW_SCHEMAS.saas_accounts.parse({
            id: ctx.ids.next('acct'),
            personaId: persona.id,
            email: `${persona.id}@example.com`,
            emailVerified: true,
            createdAt: persona.joinedAt,
          })
        );
        return {
          organizations: team.organizations,
          personas: team.personas,
          memberships: team.memberships,
          tables: {
            projects: [{ id: ctx.ids.next('project'), organizationId: team.organization.id }],
            ...saasTables({ saas_accounts: accounts }),
          },
        };
      },
    });
  }

  const open: ProtoyardRuntime[] = [];
  afterEach(() => {
    for (const rt of open.splice(0)) rt.close();
  });

  function harness(namespace: string) {
    const definition = createInboxDefinition(namespace);
    const indexedDB = new IDBFactory() as unknown as globalThis.IDBFactory;
    const boot = async () => {
      const runtime = await createPrototypeRuntime(definition, {
        indexedDB,
        IDBKeyRange,
        sleep: async () => {},
      });
      open.push(runtime);
      await runtime.scenarios.ensureSeeded();
      return runtime;
    };
    return {
      boot,
      async reload(runtime: ProtoyardRuntime) {
        runtime.close();
        return boot();
      },
    };
  }

  describe('createInbox', () => {
    it('rejects off-origin actions and never writes them', async () => {
      const h = harness('saas-inbox-href');
      const runtime = await h.boot();
      const inbox = createInbox(runtime);

      await expect(
        inbox.deliver({
          recipient: 'cara@example.com',
          kind: 'notification',
          subject: 'Hello',
          body: 'Nope',
          action: { label: 'Open', href: 'https://evil.example/phish' },
        })
      ).rejects.toMatchObject({ name: 'ValidationError' });

      expect(await runtime.db.rows('saas_inbox').count()).toBe(0);
    });
  });

  // PRESETS import keeps the scenarios package linked the same way as schema tests.
  void PRESETS;
});

// --- merged from schema.test.ts ---

describe('schema', () => {
  const REFERENCE_TIME = '2026-06-01T09:00:00.000Z';

  describe('row schemas', () => {
    it('reject fractional money and off-origin inbox links', () => {
      expect(
        SaasSubscriptionSchema.safeParse({
          id: 's',
          organizationId: 'o',
          planId: 'pro',
          status: 'active',
          unitAmountCents: 12.5,
          currentPeriodStart: REFERENCE_TIME,
          currentPeriodEnd: REFERENCE_TIME,
          createdAt: REFERENCE_TIME,
        }).success
      ).toBe(false);
      const message = {
        id: 'msg_1',
        recipient: 'ada@example.com',
        kind: 'magic-link',
        subject: 'Your sign-in link',
        body: 'Open the link to sign in.',
        at: REFERENCE_TIME,
      };
      expect(
        SaasInboxMessageSchema.safeParse({
          ...message,
          action: { label: 'Sign in', href: '#/magic/tok_1' },
        }).success
      ).toBe(true);
      for (const href of ['https://evil.example/', 'javascript:alert(1)', '#/a b']) {
        expect(
          SaasInboxMessageSchema.safeParse({ ...message, action: { label: 'Sign in', href } })
            .success
        ).toBe(false);
      }
    });
  });

  const open: ProtoyardRuntime[] = [];
  afterEach(() => {
    for (const rt of open.splice(0)) rt.close();
  });
});
