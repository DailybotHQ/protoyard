import {
  definePrototype,
  type PrototypeDefinition,
  parseManifest,
  SimulatedServiceError,
  ValidationError,
} from '@protoyard/core';
import type { ProtoyardRuntime } from '@protoyard/runtime';
import { generateTeam } from '@protoyard/scenarios';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import {
  createAuthServices,
  createInbox,
  mergeIntegrity,
  type SaasAccount,
  type SaasSessionLog,
  type SaasToken,
  saasIntegrity,
  saasStores,
  saasTables,
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

  it('signs in right away when verification is not required', async () => {
    const runtime = await boot();
    const auth = createAuthServices(runtime, {
      requireVerifiedEmail: false,
      createOrganization: false,
    });
    const { account, needsVerification } = await auth.signUp(signUpInput);
    expect(needsVerification).toBe(false);
    expect(runtime.session.principal()?.persona.id).toBe(account.personaId);
    expect(runtime.session.memberships().some((m) => m.personaId === account.personaId)).toBe(
      false
    );
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

  it('a successful sign-in resets the failed attempts', async () => {
    const runtime = await boot();
    const auth = createAuthServices(runtime);
    await issuesOf(auth.signIn({ email: SEEDED.email, password: 'wrong' }));
    const account = await auth.signIn({ email: 'ADA.seed@example.com', password: SEEDED.password });
    expect(account.failedAttempts).toBe(0);
    expect(runtime.session.isSignedIn()).toBe(true);
  });

  it('expired verification links are refused and a new one can be sent', async () => {
    const runtime = await boot();
    const auth = createAuthServices(runtime, { verifyTtlHours: 1 });
    const { account } = await auth.signUp(signUpInput);
    const [token] = await runtime.db.rows<SaasToken>('saas_tokens').toArray();
    runtime.clock.preview({ hours: 2 });
    expect(await issuesOf(auth.verifyEmail(token?.id ?? ''))).toEqual({
      form: 'This confirmation link has expired. Ask for a new one.',
    });
    runtime.clock.clearPreview();
    const fresh = await auth.resendVerification(account.email);
    expect((await auth.verifyEmail(fresh.id)).emailVerified).toBe(true);
    expect(await issuesOf(auth.resendVerification(account.email))).toEqual({
      email: 'This email is already confirmed',
    });
    expect(await issuesOf(auth.verifyEmail('nope'))).toEqual({
      form: 'This confirmation link is not valid.',
    });
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
