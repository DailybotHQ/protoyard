import { isAvatarId } from '@protoyard/avatars';
import {
  definePolicy,
  definePrototype,
  isPersonaAvatar,
  type PrototypeDefinition,
  parseManifest,
  type ScenarioDefinition,
} from '@protoyard/core';
import type { ProtoyardRuntime } from '@protoyard/runtime';
import { composeScenario, generateTeam, PRESETS, validateWorld } from '@protoyard/scenarios';
import { afterEach, describe, expect, it } from 'vitest';
import { contextFor } from '../../../tests/support/generate-context.ts';
import { createHarness } from '../../../tests/support/runtime.ts';
import {
  applySaasScenarioSession,
  createAuthServices,
  createInvitationServices,
  generateSaasWorld,
  SAAS_DEMO_PASSWORD,
  type SaasAccount,
  type SaasInvitation,
  type SaasInvoice,
  type SaasMfa,
  type SaasSubscription,
  type SaasToken,
  saasFragments,
  saasKnobs,
  saasScenarioIntegrity,
  saasStores,
} from '../src/index.ts';

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

const definition: PrototypeDefinition = definePrototype({
  manifest: parseManifest({
    id: 'example.saas-scenarios',
    slug: 'saas-scenarios',
    name: 'SaaS scenarios fixture',
    version: '0.1.0',
    defaultScenario: 'visitor',
    defaultTheme: 'violet',
    storage: { namespace: 'saas-scenarios', schemaVersion: 1 },
    scenarios: ids,
  }),
  database: { versions: [{ version: 1, stores: saasStores() }] },
  scenarios,
  policy: definePolicy({ roles: { owner: ['*'], admin: ['*'], member: [], viewer: [] } }),
  integrity: saasScenarioIntegrity(),
  generate(ctx) {
    return generateSaasWorld(ctx, { team: generateTeam(ctx) });
  },
});

const world = (id: string, seed?: number) => {
  const ctx = contextFor(scenarios, id, seed);
  return { ctx, world: generateSaasWorld(ctx, { team: generateTeam(ctx) }) };
};
const rows = <T>(w: ReturnType<typeof world>['world'], table: string) =>
  w.tables[table] as unknown as T[];
const actorAccount = (w: ReturnType<typeof world>) =>
  rows<SaasAccount>(w.world, 'saas_accounts').find(
    (a) => a.personaId === w.ctx.scenario.actor.id
  ) as SaasAccount;

describe('saasFragments + generateSaasWorld', () => {
  it.each(ids)('scenario "%s": same seed → identical rows, zero integrity violations', (id) => {
    const a = world(id).world;
    const b = world(id).world;
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    const violations = validateWorld(a, {
      ...saasScenarioIntegrity(),
      referenceTime: REFERENCE_TIME,
    });
    expect(violations).toEqual([]);
  });

  it('a different seed changes the generated rows', () => {
    expect(JSON.stringify(world('invites', 99).world)).not.toBe(
      JSON.stringify(world('invites').world)
    );
  });

  it('fragments compose and keep every knob', () => {
    const scenario = contextFor(scenarios, 'combined').scenario;
    expect(saasKnobs(scenario)).toEqual({
      trialEndsInDays: 1,
      mfaEnrolled: true,
      oauthLinked: ['slack'],
    });
    expect(scenario.organization.subscription).toBe('trial');
  });

  it('every persona gets a verified account with the demo password by default', () => {
    const w = world('mfa');
    const accounts = rows<SaasAccount>(w.world, 'saas_accounts');
    expect(accounts).toHaveLength(w.world.personas.length);
    expect(
      accounts.every((a) => a.emailVerified && a.simulatedPassword === SAAS_DEMO_PASSWORD)
    ).toBe(true);
    expect(
      accounts.every((a) => a.email.endsWith('@example.com') || a.email.endsWith('.example'))
    ).toBe(true);
  });

  it('unverified-email: actor unverified, a live verify token and its inbox message', () => {
    const w = world('unverified');
    const account = actorAccount(w);
    expect(account.emailVerified).toBe(false);
    const [token] = rows<SaasToken>(w.world, 'saas_tokens');
    expect(token).toMatchObject({ kind: 'verify-email', accountId: account.id, consumedAt: null });
    expect(Date.parse(token?.expiresAt ?? '')).toBeGreaterThan(Date.parse(REFERENCE_TIME));
    expect(w.world.tables.saas_inbox?.[0]).toMatchObject({
      kind: 'verify-email',
      action: { href: `#/auth/verify?token=${token?.id}` },
    });
  });

  it('mfa-enrolled: an active simulated authenticator with 8 recovery codes', () => {
    const w = world('mfa');
    const [factor] = rows<SaasMfa>(w.world, 'saas_mfa');
    expect(factor).toMatchObject({
      accountId: actorAccount(w).id,
      status: 'active',
      method: 'totp-sim',
    });
    expect(factor?.recoveryCodes).toHaveLength(8);
    expect(factor?.seed).toMatch(/^[A-Z2-9]{16}$/);
  });

  it('pending-invite: pending invitations with tokens and invite messages', () => {
    const w = world('invites');
    const invitations = rows<SaasInvitation>(w.world, 'saas_invitations');
    expect(invitations).toHaveLength(2);
    const tokens = rows<SaasToken>(w.world, 'saas_tokens');
    for (const invitation of invitations) {
      expect(invitation).toMatchObject({ status: 'pending', invitedBy: w.ctx.scenario.actor.id });
      expect(invitation.email).toMatch(/@example\.com$/);
      expect(tokens.find((t) => t.id === invitation.tokenId)).toMatchObject({ kind: 'invite' });
    }
    expect(w.world.tables.saas_inbox?.filter((m) => m.kind === 'invite')).toHaveLength(2);
  });

  it('gives invitees seeded avatars that skip the team faces', () => {
    const w = world('invites');
    const teamFaces = new Set(w.world.personas.map((p) => p.avatar));
    expect(w.world.personas.every((p) => isAvatarId(p.avatar))).toBe(true);
    const faces = rows<SaasInvitation>(w.world, 'saas_invitations').map((i) => i.avatar);
    expect(faces).toHaveLength(2);
    for (const face of faces) {
      expect(isAvatarId(face) && isPersonaAvatar(face), face).toBe(true);
      expect(teamFaces.has(face)).toBe(false);
    }
    expect(new Set(faces).size).toBe(2);
    expect(faces).toEqual(
      rows<SaasInvitation>(world('invites').world, 'saas_invitations').map((i) => i.avatar)
    );
  });

  it('fills a face for team members that have none, without reusing team faces', () => {
    const ctx = contextFor(scenarios, 'invites');
    const team = generateTeam(ctx);
    const [first, ...rest] = team.personas;
    const { avatar: _dropped, ...bare } = first as (typeof team.personas)[number];
    const personas = [bare, ...rest];
    const out = generateSaasWorld(ctx, { team: { ...team, personas, actor: bare } });
    const filled = out.personas[0]?.avatar;
    expect(isAvatarId(filled)).toBe(true);
    expect(rest.map((p) => p.avatar)).not.toContain(filled);
    expect(out.personas.slice(1)).toEqual(rest);
  });

  it('trial-ending(2): trialing subscription ending in 2 days, org trialing, a trial reminder', () => {
    const w = world('trial-ending');
    const [subscription] = rows<SaasSubscription>(w.world, 'saas_subscriptions');
    const ends = new Date(Date.parse(REFERENCE_TIME) + 2 * 86_400_000).toISOString();
    expect(subscription).toMatchObject({ status: 'trialing', trialEndsAt: ends });
    expect(w.world.organizations.find((o) => o.id === 'org_0001')).toMatchObject({
      billingStatus: 'trialing',
      trialEndsAt: ends,
    });
    expect(w.world.tables.saas_inbox?.find((m) => m.kind === 'trial')?.subject).toBe(
      'Your trial ends in 2 days'
    );
  });

  it('past-due: subscription past_due, last invoice failed, org past_due, integer cents', () => {
    const w = world('past-due');
    const [subscription] = rows<SaasSubscription>(w.world, 'saas_subscriptions');
    expect(subscription?.status).toBe('past_due');
    const invoices = rows<SaasInvoice>(w.world, 'saas_invoices');
    expect(invoices.at(-1)).toMatchObject({ status: 'failed', paidAt: null });
    expect(invoices.slice(0, -1).every((i) => i.status === 'paid')).toBe(true);
    expect(invoices.every((i) => Number.isInteger(i.amountCents))).toBe(true);
    expect(w.world.organizations[0]?.billingStatus).toBe('past_due');
  });

  it('multi-workspace(3): the actor belongs to three organizations', () => {
    const w = world('multi');
    const actorId = w.ctx.scenario.actor.id;
    expect(w.world.memberships.filter((m) => m.personaId === actorId)).toHaveLength(3);
    expect(w.world.organizations).toHaveLength(3);
  });

  it('oauth-linked: providers linked to the actor account', () => {
    expect(actorAccount(world('linked')).providers.map((p) => p.provider)).toEqual([
      'google',
      'github',
    ]);
  });

  it('only produces rows for the kit tables a prototype opted into', () => {
    const ctx = contextFor(scenarios, 'past-due');
    const partial = generateSaasWorld(ctx, { team: generateTeam(ctx), tables: ['saas_accounts'] });
    expect(Object.keys(partial.tables)).toEqual(['saas_accounts']);
  });
});

describe('scenarios on the real runtime', () => {
  type Db = ProtoyardRuntime['db'];
  let harness = createHarness<Db>(definition);
  afterEach(() => {
    harness.closeAll();
    harness = createHarness<Db>(definition);
  });

  it('every scenario loads (the runtime re-checks integrity)', async () => {
    const runtime = (await harness.boot('visitor')) as unknown as ProtoyardRuntime;
    for (const id of ids) {
      await runtime.scenarios.load(id);
      expect(await runtime.db.rows('saas_accounts').count()).toBeGreaterThan(0);
    }
  });

  it('the signed-out visitor is signed out once; signing in survives a reload', async () => {
    let runtime = (await harness.boot('visitor')) as unknown as ProtoyardRuntime;
    expect(runtime.session.isSignedIn()).toBe(true);
    expect(await applySaasScenarioSession(runtime)).toBe(true);
    expect(runtime.session.isSignedIn()).toBe(false);

    const email = (await runtime.db.rows<SaasAccount>('saas_accounts').toArray())[0]?.email ?? '';
    await createAuthServices(runtime).signIn({ email, password: SAAS_DEMO_PASSWORD });
    runtime = (await harness.reload(runtime as never)) as unknown as ProtoyardRuntime;
    expect(await applySaasScenarioSession(runtime)).toBe(false);
    expect(runtime.session.isSignedIn()).toBe(true);

    // A fresh load of the scenario applies it again; other scenarios never sign out.
    await runtime.scenarios.load('visitor');
    expect(await applySaasScenarioSession(runtime)).toBe(true);
    await runtime.scenarios.load('mfa');
    expect(await applySaasScenarioSession(runtime)).toBe(false);
    expect(runtime.session.isSignedIn()).toBe(true);
  });

  it('an accepted seeded invitation creates a persona with the invitee avatar', async () => {
    const runtime = (await harness.boot('invites')) as unknown as ProtoyardRuntime;
    const [invitation] = await runtime.db.rows<SaasInvitation>('saas_invitations').toArray();
    expect(isAvatarId(invitation?.avatar)).toBe(true);
    const accepted = await createInvitationServices(runtime).accept(
      { tokenId: invitation?.tokenId ?? '' },
      { signIn: false }
    );
    expect(accepted.createdAccount).toBe(true);
    const persona = runtime.session.personas().find((p) => p.id === accepted.account.personaId);
    expect(persona?.avatar).toBe(invitation?.avatar);
  });
});
