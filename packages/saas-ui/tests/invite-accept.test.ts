import {
  definePolicy,
  definePrototype,
  type PrototypeDefinition,
  parseManifest,
} from '@protoyard/core';
import { createRouter } from '@protoyard/renderer-svelte';
import type { ProtoyardRuntime } from '@protoyard/runtime';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { contextFor } from '../../../tests/support/generate-context.ts';
import { createHarness } from '../../../tests/support/runtime.ts';
import {
  createInvitationServices,
  generateSaasWorld,
  type SaasAccount,
  saasFragments,
  saasIntegrity,
  saasStores,
  saasTables,
} from '../../saas/src/index.ts';
import { composeScenario, generateTeam, PRESETS } from '../../scenarios/src/index.ts';
import { saasRoutes } from '../src/routes.ts';
import InviteAcceptHarness from './fixtures/InviteAcceptHarness.svelte';

/**
 * Accepting a workspace invitation from the simulated inbox, on the REAL
 * runtime: guests and signed-in people, the role, sign-in, and every error state.
 */

const REFERENCE_TIME = '2026-10-17T09:00:00.000Z';
const OWNER_EMAIL = 'olivia@example.com';
const definition: PrototypeDefinition = definePrototype({
  manifest: parseManifest({
    id: 'example.saas-ui-invites',
    slug: 'saas-ui-invites',
    name: 'Invite accept fixture',
    version: '0.1.0',
    defaultScenario: 'active',
    defaultTheme: 'violet',
    storage: { namespace: 'saas-ui-invites', schemaVersion: 1 },
    scenarios: ['active'],
  }),
  auth: { signedOutByDefault: true },
  database: { versions: [{ version: 1, stores: saasStores() }] },
  scenarios: [
    {
      id: 'active',
      extends: 'active-month',
      name: 'Active',
      seed: 731,
      referenceTime: REFERENCE_TIME,
    },
  ],
  policy: definePolicy({ roles: { owner: ['*'], admin: ['*'], member: [], viewer: [] } }),
  integrity: saasIntegrity(),
  generate(ctx) {
    const team = generateTeam(ctx);
    const owner = team.personas[0];
    if (!owner) throw new Error('fixture needs a persona');
    const account: SaasAccount = {
      id: ctx.ids.next('acct'),
      personaId: owner.id,
      email: OWNER_EMAIL,
      emailVerified: true,
      simulatedPassword: 'simulated password',
      providers: [],
      status: 'active',
      failedAttempts: 0,
      createdAt: owner.joinedAt,
      lastSignInAt: null,
    };
    return {
      organizations: team.organizations,
      personas: team.personas,
      memberships: team.memberships.map((m, i) => (i === 0 ? { ...m, role: 'owner' } : m)),
      tables: saasTables({ saas_accounts: [account] }),
    };
  },
});

type Db = ProtoyardRuntime['db'];
let harness = createHarness<Db>(definition);
afterEach(() => {
  cleanup();
  harness.closeAll();
  harness = createHarness<Db>(definition);
  location.hash = '';
});

/** Boots, signs the owner in, invites `email`, and returns the token (owner still signed in). */
async function invite(email: string, role = 'admin', { signOut = true } = {}) {
  const runtime = (await harness.boot('active')) as ProtoyardRuntime;
  const owner = await runtime.db
    .rows<SaasAccount>('saas_accounts')
    .where('email')
    .equals(OWNER_EMAIL)
    .first();
  await runtime.session.signIn(owner?.personaId ?? '');
  const created = await createInvitationServices(runtime).create({ email, role });
  if (signOut) await runtime.session.signOut();
  location.hash = `#/invites/accept?token=${created.token.id}`;
  return { runtime, created, orgId: created.invitation.organizationId };
}

const accept = () => fireEvent.click(screen.getByRole('button', { name: 'Accept and join' }));

describe('invite accept routes', () => {
  it('both link forms resolve to the accept screen, with no guard, for service and scenario links', async () => {
    const session = { isSignedIn: () => false, principal: () => null, subscribe: () => () => {} };
    const routes = saasRoutes({ session: session as never });
    const canonical = routes.find((r) => r.path === '/invites/accept');
    const alias = routes.find((r) => r.path === '/invite');
    expect(canonical?.guard).toBeUndefined();
    expect(alias?.load).toBe(canonical?.load);

    const router = createRouter(routes);
    const { runtime, created } = await invite('hedy@example.com');
    const serviceHref = created.message.action?.href ?? '';
    expect(router.match(serviceHref).route?.path).toBe('/invites/accept');
    expect(router.match('#/invite?token=abc').route?.path).toBe('/invite');

    const scenario = composeScenario(
      PRESETS['active-month'],
      { id: 'invites', name: 'Invites', seed: 4, referenceTime: REFERENCE_TIME },
      saasFragments.pendingInvite(1)
    );
    const ctx = contextFor([scenario as never], 'invites');
    const world = generateSaasWorld(ctx, { team: generateTeam(ctx) });
    const [message] = (world.tables.saas_inbox ?? []) as unknown as { action: { href: string } }[];
    const fragmentHref = message?.action.href ?? '';
    expect(fragmentHref).toMatch(/^#\/invites\/accept\?token=/);
    expect(router.match(fragmentHref).route?.path).toBe('/invites/accept');
    router.destroy();
    runtime.close();
  });
});

describe('invite accept screen', () => {
  it('a guest joins with a new account, is signed in with the invited role and lands home', async () => {
    const { runtime, orgId } = await invite('hedy.lamarr@example.com', 'admin');
    render(InviteAcceptHarness, { runtime });
    expect(await screen.findByText(/invited hedy\.lamarr@example\.com to join as/)).toBeTruthy();
    expect(screen.getByText('admin')).toBeTruthy();
    await fireEvent.input(screen.getByLabelText(/^Your name/), {
      target: { value: 'Hedy Lamarr' },
    });
    await accept();
    await waitFor(() => expect(location.hash).toBe('#/'));
    expect(runtime.session.principal()).toMatchObject({
      persona: { name: 'Hedy Lamarr', email: 'hedy.lamarr@example.com' },
      organization: { id: orgId },
      role: 'admin',
    });
  });

  it('warns when someone else is signed in, then continues as the invitee', async () => {
    const { runtime } = await invite('grace@example.com', 'member', { signOut: false });
    render(InviteAcceptHarness, { runtime });
    expect(
      await screen.findByText(/You're signed in as .*Accepting continues as grace@example\.com/)
    ).toBeTruthy();
    await accept();
    // Navigation happens only after accept fully resolved (sign-in + workspace switch).
    await waitFor(() => expect(location.hash).toBe('#/'));
    expect(runtime.session.principal()?.persona.email).toBe('grace@example.com');
    expect(runtime.session.principal()?.role).toBe('member');
  });

  it('expired, used, withdrawn and unknown links show real error states and no accept button', async () => {
    const { runtime, created } = await invite('ada.l@example.com');
    const invites = createInvitationServices(runtime);

    runtime.clock.commitAdvance({ days: 8 });
    render(InviteAcceptHarness, { runtime });
    expect(await screen.findByText('This invitation has expired')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Accept and join' })).toBeNull();
    cleanup();
    runtime.clock.resetClock();

    const fresh = await (async () => {
      await runtime.session.signIn(created.invitation.invitedBy);
      return invites.create({ email: 'katherine@example.com', role: 'member' });
    })();
    await invites.accept({ tokenId: fresh.token.id }, { signIn: false });
    location.hash = `#/invites/accept?token=${fresh.token.id}`;
    render(InviteAcceptHarness, { runtime });
    expect(await screen.findByText('This invitation was already used')).toBeTruthy();
    cleanup();

    const withdrawn = await invites.create({ email: 'linus@example.com', role: 'member' });
    await invites.revoke(withdrawn.invitation.id);
    location.hash = `#/invites/accept?token=${withdrawn.token.id}`;
    render(InviteAcceptHarness, { runtime });
    expect(await screen.findByText('This invitation was withdrawn')).toBeTruthy();
    cleanup();

    location.hash = '#/invites/accept?token=does-not-exist';
    render(InviteAcceptHarness, { runtime });
    expect(await screen.findByText("This invitation link isn't valid")).toBeTruthy();
    cleanup();
    location.hash = '#/invites/accept';
    render(InviteAcceptHarness, { runtime });
    expect(await screen.findByText("This invitation link isn't valid")).toBeTruthy();
  });

  it('a link that expires while open shows the error from the service, then the expired state', async () => {
    const { runtime } = await invite('margaret@example.com');
    render(InviteAcceptHarness, { runtime });
    await screen.findByRole('button', { name: 'Accept and join' });
    runtime.clock.commitAdvance({ days: 8 });
    await accept();
    expect(await screen.findByText('This invitation has expired')).toBeTruthy();
    expect(runtime.session.isSignedIn()).toBe(false);
  });

  it('an account with an active authenticator joins but is sent to sign in', async () => {
    const { runtime } = await invite('barbara@example.com', 'member', { signOut: false });
    const persona = await runtime.identity.write((ops) =>
      ops.putPersona({ name: 'Barbara Liskov', email: 'barbara@example.com' })
    );
    await runtime.db.rows<SaasAccount>('saas_accounts').add({
      id: 'acct_barbara',
      personaId: persona.id,
      email: 'barbara@example.com',
      emailVerified: true,
      simulatedPassword: 'simulated password',
      providers: [],
      status: 'active',
      failedAttempts: 0,
      createdAt: REFERENCE_TIME,
      lastSignInAt: null,
    });
    await runtime.db.rows('saas_mfa').add({
      id: 'mfa_barbara',
      accountId: 'acct_barbara',
      method: 'totp-sim',
      seed: 'ABCDEFGHJKLMNPQR',
      status: 'active',
      enrolledAt: REFERENCE_TIME,
      recoveryCodes: [],
    });
    await runtime.session.signOut();
    render(InviteAcceptHarness, { runtime });
    expect(await screen.findByText(/You already have an account/)).toBeTruthy();
    await accept();
    expect(await screen.findByText(/Sign in with barbara@example\.com and your code/)).toBeTruthy();
    expect(runtime.session.isSignedIn()).toBe(false);
    expect(runtime.session.memberships().some((m) => m.personaId === persona.id)).toBe(true);
  });
});
