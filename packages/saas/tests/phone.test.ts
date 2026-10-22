import {
  definePolicy,
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
  createPhoneServices,
  PHONE_CODE_ATTEMPT_LIMIT,
  PHONE_CODE_TTL_MS,
  PHONE_RESEND_COOLDOWN_MS,
  phoneResendSecondsRemaining,
  type SaasSessionLog,
  saasIntegrity,
  saasStores,
  saasTables,
  simulatedPhoneCode,
} from '../src/index.ts';

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
  it('normalizes numbers, derives codes from simulated time and enforces resend cooldown', async () => {
    const runtime = await boot();
    const phone = createPhoneServices(runtime);
    const issued = await phone.sendCode({ phone: '1 (202) 555-0100', name: 'Alex Example' });

    expect(issued.phone).toBe('+12025550100');
    expect(issued.code).toBe(simulatedPhoneCode(issued.phone, issued.sentAt));
    expect(issued.expiresAt).toBe(
      new Date(Date.parse(issued.sentAt) + PHONE_CODE_TTL_MS).toISOString()
    );
    expect(phoneResendSecondsRemaining(Date.parse(issued.sentAt), issued.sentAt)).toBe(30);
    expect(phoneResendSecondsRemaining(Date.parse(issued.resendAt), issued.sentAt)).toBe(0);
    await expect(phone.resendCode(issued.challengeId)).rejects.toMatchObject({
      issues: { phone: expect.stringContaining('Wait 30 seconds') },
    });

    runtime.clock.setTime(new Date(runtime.clock.nowMs() + PHONE_RESEND_COOLDOWN_MS));
    const resent = await phone.resendCode(issued.challengeId);
    expect(resent.challengeId).not.toBe(issued.challengeId);
    expect(resent.code).toBe(simulatedPhoneCode(resent.phone, resent.sentAt));
    expect(await phone.describeChallenge(issued.challengeId)).toBeNull();
  });

  it('creates and reuses a persona only after the correct code, then signs in', async () => {
    const runtime = await boot();
    const phone = createPhoneServices(runtime);
    const first = await phone.sendCode({ phone: '+1 202 555 0101', name: 'Jamie Example' });
    const created = await phone.verifyCode({ challengeId: first.challengeId, code: first.code });
    expect(created.returning).toBe(false);
    expect(runtime.session.isSignedIn()).toBe(true);
    expect(runtime.session.principal()?.persona.name).toBe('Jamie Example');
    expect(runtime.session.principal()?.persona.email).toBeUndefined();

    await runtime.session.signOut();
    const second = await phone.sendCode({ phone: '+12025550101', name: 'Ignored On Return' });
    expect(second.returning).toBe(true);
    const returned = await phone.verifyCode({ challengeId: second.challengeId, code: second.code });
    expect(returned.personaId).toBe(created.personaId);
    expect(returned.returning).toBe(true);
    expect(runtime.session.principal()?.persona.name).toBe('Jamie Example');

    const logs = await runtime.db.rows<SaasSessionLog>('saas_sessions_log').toArray();
    expect(
      logs.filter((entry) => entry.method === 'phone' && entry.outcome === 'success')
    ).toHaveLength(4);
  });

  it('commits wrong attempts, locks the challenge at the limit, and expires by simulated time', async () => {
    const runtime = await boot();
    const phone = createPhoneServices(runtime);
    const issued = await phone.sendCode({ phone: '+12025550102', name: 'Casey Example' });
    const wrongCode = issued.code === '000000' ? '000001' : '000000';

    for (let attempt = 0; attempt < PHONE_CODE_ATTEMPT_LIMIT; attempt += 1) {
      await expect(
        phone.verifyCode({ challengeId: issued.challengeId, code: wrongCode })
      ).rejects.toBeInstanceOf(ValidationError);
    }
    expect(await phone.describeChallenge(issued.challengeId)).toBeNull();
    const logs = await runtime.db.rows<SaasSessionLog>('saas_sessions_log').toArray();
    expect(logs.filter((entry) => entry.reason === 'attempt-limit')).toHaveLength(1);
    expect(runtime.session.isSignedIn()).toBe(false);

    const expiring = await phone.sendCode({ phone: '+12025550103', name: 'Taylor Example' });
    runtime.clock.setTime(new Date(runtime.clock.nowMs() + PHONE_CODE_TTL_MS));
    await expect(
      phone.verifyCode({ challengeId: expiring.challengeId, code: expiring.code })
    ).rejects.toMatchObject({ issues: { code: 'This code has expired. Request a new one.' } });
  });

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
