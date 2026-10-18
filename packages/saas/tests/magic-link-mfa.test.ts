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
  createMagicLinkServices,
  createMfaServices,
  MFA_WINDOW_MS,
  mergeIntegrity,
  type SaasAccount,
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
      mfa.completeChallenge(password.account.id, { code: '000000' })
    ).rejects.toMatchObject({ issues: { code: expect.stringMatching(/not correct/i) } });
    expect(runtime.session.isSignedIn()).toBe(false);

    const code = simulatedTotpCode(seed, runtime.clock.now().getTime());
    const finished = await mfa.completeChallenge(password.account.id, { code });
    expect(finished.email).toBe(SEEDED.email);
    expect(runtime.session.isSignedIn()).toBe(true);

    await runtime.session.signOut();
    const magic = createMagicLinkServices(runtime);
    const link = await magic.issue({ email: SEEDED.email });
    const consumed = await magic.consume(link.token!.id);
    expect(consumed.status).toBe('mfa-required');
    expect(runtime.session.isSignedIn()).toBe(false);

    const nextCode = createMfaServices(runtime).authenticatorPanel(seed).code;
    await mfa.completeChallenge(consumed.account.id, { code: nextCode });
    expect(runtime.session.isSignedIn()).toBe(true);
  });

  it('accepts a recovery code and advances the clock window for TOTP', async () => {
    const runtime = await boot();
    const { mfa, seed, recoveryCodes } = await enrollActiveMfa(runtime);

    const challenge = await mfa.signInWithPassword(SEEDED);
    expect(challenge.status).toBe('mfa-required');
    await mfa.completeChallenge(challenge.account.id, {
      recoveryCode: recoveryCodes[0]!,
    });
    expect(runtime.session.isSignedIn()).toBe(true);

    // Same recovery code cannot be reused.
    await runtime.session.signOut();
    const again = await mfa.signInWithPassword(SEEDED);
    await expect(
      mfa.completeChallenge(again.account.id, { recoveryCode: recoveryCodes[0]! })
    ).rejects.toMatchObject({
      issues: { recoveryCode: expect.stringMatching(/not valid/i) },
    });

    const before = simulatedTotpCode(seed, runtime.clock.now().getTime());
    runtime.clock.commitAdvance({ seconds: 31 });
    const after = simulatedTotpCode(seed, runtime.clock.now().getTime());
    expect(after).not.toBe(before);
    await mfa.completeChallenge(again.account.id, { code: after });
    expect(runtime.session.isSignedIn()).toBe(true);
  });

  it('disables MFA after a valid code', async () => {
    const runtime = await boot();
    const { mfa, seed } = await enrollActiveMfa(runtime);
    const gate = await mfa.signInWithPassword(SEEDED);
    await mfa.completeChallenge(gate.account.id, {
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
