import {
  definePrototype,
  type PrototypeDefinition,
  parseManifest,
  ValidationError,
} from '@protoyard/core';
import type { ProtoyardRuntime } from '@protoyard/runtime';
import { generateTeam } from '@protoyard/scenarios';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import {
  createAuthServices,
  createMagicLinkServices,
  createMfaServices,
  MFA_WINDOW_MS,
  mergeIntegrity,
  type SaasAccount,
  type SaasSessionLog,
  type SaasToken,
  saasIntegrity,
  saasStores,
  saasTables,
  simulatedTotpCode,
} from '../src/index.ts';

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

async function signInLog(runtime: ProtoyardRuntime) {
  return runtime.db.rows<SaasSessionLog>('saas_sessions_log').toArray();
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

describe('simulatedTotpCode', () => {
  it('is stable inside a 30s window and changes on the next window', () => {
    const seed = 'sim-seed';
    const t0 = Date.parse(REFERENCE_TIME);
    expect(simulatedTotpCode(seed, t0)).toBe(simulatedTotpCode(seed, t0 + MFA_WINDOW_MS - 1));
    expect(simulatedTotpCode(seed, t0)).not.toBe(simulatedTotpCode(seed, t0 + MFA_WINDOW_MS));
    expect(simulatedTotpCode(seed, t0)).toMatch(/^\d{6}$/);
  });
});

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

  it('accepts a recovery code and advances the clock window for TOTP', async () => {
    const runtime = await boot();
    const { mfa, seed, recoveryCodes } = await enrollActiveMfa(runtime);

    const challenge = await mfa.signInWithPassword(SEEDED);
    expect(challenge.status).toBe('mfa-required');
    await mfa.completeChallenge(challengeOf(challenge), {
      recoveryCode: recoveryCodes[0]!,
    });
    expect(runtime.session.isSignedIn()).toBe(true);

    // Same recovery code cannot be reused.
    await runtime.session.signOut();
    const again = await mfa.signInWithPassword(SEEDED);
    await expect(
      mfa.completeChallenge(challengeOf(again), { recoveryCode: recoveryCodes[0]! })
    ).rejects.toMatchObject({
      issues: { recoveryCode: expect.stringMatching(/not valid/i) },
    });

    const before = simulatedTotpCode(seed, runtime.clock.now().getTime());
    runtime.clock.commitAdvance({ seconds: 31 });
    const after = simulatedTotpCode(seed, runtime.clock.now().getTime());
    expect(after).not.toBe(before);
    await mfa.completeChallenge(challengeOf(again), { code: after });
    expect(runtime.session.isSignedIn()).toBe(true);
  });

  it('disables MFA after a valid code', async () => {
    const runtime = await boot();
    const { mfa, seed } = await enrollActiveMfa(runtime);
    const gate = await mfa.signInWithPassword(SEEDED);
    await mfa.completeChallenge(challengeOf(gate), {
      code: simulatedTotpCode(seed, runtime.clock.now().getTime()),
    });
    await mfa.disable({
      code: simulatedTotpCode(seed, runtime.clock.now().getTime()),
    });
    expect(await mfa.isActive()).toBe(false);
    await runtime.session.signOut();
    const open = await mfa.signInWithPassword(SEEDED);
    expect(open.status).toBe('signed-in');
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
    expect(token).toMatchObject({ kind: 'mfa-challenge', accountId: account.id, consumedAt: null });
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

  it('mints a challenge for an MFA-active magic-link sign-in', async () => {
    const runtime = await boot();
    const { mfa, seed } = await enrollActiveMfa(runtime);
    const magic = createMagicLinkServices(runtime);
    const link = await magic.issue({ email: SEEDED.email });
    const consumed = await magic.consume(link.token!.id);
    const challengeId = challengeOf(consumed);
    expect(runtime.session.isSignedIn()).toBe(false);
    await expect(
      mfa.completeChallenge(consumed.account.id, {
        code: simulatedTotpCode(seed, runtime.clock.now().getTime()),
      })
    ).rejects.toBeInstanceOf(ValidationError);
    await mfa.completeChallenge(challengeId, {
      code: simulatedTotpCode(seed, runtime.clock.now().getTime()),
    });
    expect(runtime.session.isSignedIn()).toBe(true);
  });
});

describe('signInWithPassword attempts (M4, N5)', () => {
  it('counts wrong passwords and locks the account at lockoutThreshold', async () => {
    const runtime = await boot();
    const mfa = createMfaServices(runtime, { lockoutThreshold: 3 });
    const wrong = { email: SEEDED.email, password: 'not the password' };
    await expect(mfa.signInWithPassword(wrong)).rejects.toMatchObject({
      issues: { password: 'Incorrect password. 2 attempts left.' },
    });
    await expect(mfa.signInWithPassword(wrong)).rejects.toMatchObject({
      issues: { password: 'Incorrect password. 1 attempt left.' },
    });
    await expect(mfa.signInWithPassword(wrong)).rejects.toMatchObject({
      issues: { password: 'Incorrect password. The account is now locked.' },
    });
    const account = await runtime.db
      .rows<SaasAccount>('saas_accounts')
      .where('email')
      .equals(SEEDED.email)
      .first();
    expect(account).toMatchObject({ status: 'locked', failedAttempts: 3 });
    // The right password no longer opens a locked account.
    await expect(mfa.signInWithPassword(SEEDED)).rejects.toMatchObject({
      issues: { form: expect.stringMatching(/locked/i) },
    });
    expect(runtime.session.isSignedIn()).toBe(false);
    const reasons = (await signInLog(runtime))
      .filter((row) => row.method === 'password' && row.outcome === 'failure')
      .map((row) => row.reason)
      .sort();
    expect(reasons).toEqual(['locked', 'locked', 'wrong-password', 'wrong-password']);
  });

  it('uses the default lockout of 5 and resets the counter on success', async () => {
    const runtime = await boot();
    const mfa = createMfaServices(runtime);
    const wrong = { email: SEEDED.email, password: 'not the password' };
    await expect(mfa.signInWithPassword(wrong)).rejects.toMatchObject({
      issues: { password: 'Incorrect password. 4 attempts left.' },
    });
    await mfa.signInWithPassword(SEEDED);
    const account = await createAuthServices(runtime).account();
    expect(account).toMatchObject({ status: 'active', failedAttempts: 0 });
  });

  it('honors requireVerifiedEmail like auth.signIn', async () => {
    const runtime = await boot();
    const pending = { email: 'grace.pending@example.com', password: 'simulated secret' };
    await createAuthServices(runtime).signUp({ name: 'Grace Pending', ...pending });
    expect(runtime.session.isSignedIn()).toBe(false);
    await expect(createMfaServices(runtime).signInWithPassword(pending)).rejects.toMatchObject({
      issues: { form: expect.stringMatching(/confirm your email/i) },
    });
    const relaxed = createMfaServices(runtime, { requireVerifiedEmail: false });
    const result = await relaxed.signInWithPassword(pending);
    expect(result.status).toBe('signed-in');
    expect(runtime.session.isSignedIn()).toBe(true);
  });
});

describe('MFA failure log (M5)', () => {
  it('persists wrong-code and bad-recovery rows from completeChallenge and disable', async () => {
    const runtime = await boot();
    const { mfa, seed } = await enrollActiveMfa(runtime);
    const challengeId = challengeOf(await mfa.signInWithPassword(SEEDED));
    await expect(mfa.completeChallenge(challengeId, { code: '000000' })).rejects.toBeInstanceOf(
      ValidationError
    );
    await expect(
      mfa.completeChallenge(challengeId, { recoveryCode: 'NOTACODE' })
    ).rejects.toBeInstanceOf(ValidationError);
    const afterChallenge = (await signInLog(runtime)).filter(
      (row) => row.method === 'mfa' && row.outcome === 'failure'
    );
    expect(afterChallenge.map((row) => row.reason).sort()).toEqual(['bad-recovery', 'wrong-code']);

    // A failed proof keeps the challenge usable until it expires.
    await mfa.completeChallenge(challengeId, {
      code: simulatedTotpCode(seed, runtime.clock.now().getTime()),
    });
    await expect(mfa.disable({ code: '000000' })).rejects.toMatchObject({
      issues: { code: expect.stringMatching(/not correct/i) },
    });
    const failures = (await signInLog(runtime)).filter(
      (row) => row.method === 'mfa' && row.outcome === 'failure'
    );
    expect(failures.map((row) => row.reason).sort()).toEqual([
      'bad-recovery',
      'wrong-code',
      'wrong-code',
    ]);
    expect(await mfa.isActive()).toBe(true);
  });
});
