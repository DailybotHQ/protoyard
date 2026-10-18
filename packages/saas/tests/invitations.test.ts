import {
  definePolicy,
  definePrototype,
  PermissionDeniedError,
  type PrototypeDefinition,
  parseManifest,
  ValidationError,
} from '@protoyard/core';
import type { ProtoyardRuntime } from '@protoyard/runtime';
import { generateTeam } from '@protoyard/scenarios';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import {
  createInvitationServices,
  createPasswordResetServices,
  mergeIntegrity,
  type SaasAccount,
  type SaasInvitation,
  saasIntegrity,
  saasStores,
  saasTables,
} from '../src/index.ts';

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
  database: { versions: [{ version: 1, stores: saasStores() }] },
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

describe('password reset', () => {
  it('delivers a single-use reset link, changes the simulated password and hides unknown emails', async () => {
    const runtime = await boot();
    const reset = createPasswordResetServices(runtime);
    const issued = await reset.request({ email: OWNER_EMAIL.toUpperCase() });
    expect(issued.delivered).toBe(true);
    expect(issued.message?.action?.href).toContain('#/auth/reset?token=');
    const updated = await reset.consume({ tokenId: issued.token!.id, password: 'new password' });
    expect(updated.simulatedPassword).toBe('new password');
    await expect(
      reset.consume({ tokenId: issued.token!.id, password: 'other password' })
    ).rejects.toMatchObject({
      issues: { form: expect.stringMatching(/already used/i) },
    });

    const unknown = await reset.request({ email: 'nobody@example.com' });
    expect(unknown).toEqual({ delivered: false, token: null, message: null });
  });

  it('rejects an expired link using the simulated clock', async () => {
    const runtime = await boot();
    const reset = createPasswordResetServices(runtime, { ttlMinutes: 1 });
    const issued = await reset.request({ email: OWNER_EMAIL });
    runtime.clock.commitAdvance({ minutes: 2 });
    await expect(
      reset.consume({ tokenId: issued.token!.id, password: 'new password' })
    ).rejects.toMatchObject({
      issues: { form: expect.stringMatching(/expired/i) },
    });
  });
});

describe('workspace invitations', () => {
  it('creates an account for a new invitee and adds exactly one membership', async () => {
    const runtime = await signedInRuntime();
    const invites = createInvitationServices(runtime);
    const created = await invites
      .create({ email: OWNER_EMAIL, role: 'member' })
      .catch((error) => error);
    // The signed-in owner cannot be invited to its own workspace.
    expect(created).toBeInstanceOf(ValidationError);

    const invite = await invites.create({ email: 'grace@example.com', role: 'member' });
    const accepted = await invites.accept({ tokenId: invite.token.id, name: 'Grace Hopper' });
    expect(accepted.createdAccount).toBe(true);
    expect(accepted.invitation.status).toBe('accepted');
    expect(
      runtime.session.memberships().filter((m) => m.personaId === accepted.account.personaId)
    ).toHaveLength(1);
    await expect(invites.accept({ tokenId: invite.token.id })).rejects.toMatchObject({
      issues: { form: expect.stringMatching(/no longer available/i) },
    });
  });

  it('adds an existing account to the workspace without creating a duplicate account', async () => {
    const runtime = await signedInRuntime();
    const persona = await runtime.identity.write((ops) =>
      ops.putPersona({ name: 'Grace Hopper', email: 'grace@example.com' })
    );
    const account: SaasAccount = {
      id: 'acct_existing_grace',
      personaId: persona.id,
      email: 'grace@example.com',
      emailVerified: true,
      simulatedPassword: 'simulated password',
      providers: [],
      status: 'active',
      failedAttempts: 0,
      createdAt: REFERENCE_TIME,
      lastSignInAt: null,
    };
    await runtime.db.rows<SaasAccount>('saas_accounts').add(account);
    const invites = createInvitationServices(runtime);
    const invitation = await invites.create({ email: account.email, role: 'member' });
    const accepted = await invites.accept({ tokenId: invitation.token.id });
    expect(accepted.createdAccount).toBe(false);
    expect(accepted.account.id).toBe(account.id);
    expect(runtime.session.memberships().filter((m) => m.personaId === persona.id)).toHaveLength(1);
  });

  it('supports an existing account, resend invalidates the old link, and revoke blocks acceptance', async () => {
    const runtime = await signedInRuntime();
    const invites = createInvitationServices(runtime);
    const invitation = await invites.create({ email: 'linus@example.com', role: 'member' });
    const resent = await invites.resend(invitation.invitation.id);
    await expect(invites.accept({ tokenId: invitation.token.id })).rejects.toMatchObject({
      issues: { form: expect.stringMatching(/no longer available/i) },
    });
    await invites.revoke(resent.invitation.id);
    await expect(invites.accept({ tokenId: resent.token.id })).rejects.toMatchObject({
      issues: { form: expect.stringMatching(/no longer available/i) },
    });
  });

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

  it('accept signs the invitee in and switches to the workspace with the invited role', async () => {
    const runtime = await signedInRuntime();
    const owner = runtime.session.principal()?.persona.id;
    const invites = createInvitationServices(runtime);
    const invite = await invites.create({ email: 'hedy@example.com', role: 'admin' });
    const orgId = invite.invitation.organizationId;

    const accepted = await invites.accept({ tokenId: invite.token.id, name: 'Hedy Lamarr' });
    expect(accepted).toMatchObject({ signedIn: true, requiresMfa: false, createdAccount: true });
    expect(runtime.session.principal()).toMatchObject({
      persona: { id: accepted.account.personaId, name: 'Hedy Lamarr' },
      organization: { id: orgId },
      role: 'admin',
    });
    expect(runtime.session.principal()?.persona.id).not.toBe(owner);
  });

  it('accept never signs in an account with an active authenticator, or when asked not to', async () => {
    const runtime = await signedInRuntime();
    const owner = runtime.session.principal()?.persona.id;
    const persona = await runtime.identity.write((ops) =>
      ops.putPersona({ name: 'Grace Hopper', email: 'grace@example.com' })
    );
    await runtime.db.rows<SaasAccount>('saas_accounts').add({
      id: 'acct_mfa_grace',
      personaId: persona.id,
      email: 'grace@example.com',
      emailVerified: true,
      simulatedPassword: 'simulated password',
      providers: [],
      status: 'active',
      failedAttempts: 0,
      createdAt: REFERENCE_TIME,
      lastSignInAt: null,
    });
    await runtime.db.rows('saas_mfa').add({
      id: 'mfa_grace',
      accountId: 'acct_mfa_grace',
      method: 'totp-sim',
      seed: 'ABCDEFGHJKLMNPQR',
      status: 'active',
      enrolledAt: REFERENCE_TIME,
      recoveryCodes: [],
    });
    const invites = createInvitationServices(runtime);
    const invite = await invites.create({ email: 'grace@example.com', role: 'member' });
    const accepted = await invites.accept({ tokenId: invite.token.id });
    expect(accepted).toMatchObject({ signedIn: false, requiresMfa: true });
    expect(runtime.session.principal()?.persona.id).toBe(owner);

    const second = await invites.create({ email: 'linus@example.com', role: 'member' });
    const quiet = await invites.accept({ tokenId: second.token.id }, { signIn: false });
    expect(quiet).toMatchObject({ signedIn: false, requiresMfa: false });
    expect(runtime.session.principal()?.persona.id).toBe(owner);
  });

  it('preview reports valid, used, revoked, expired and unknown links without side effects', async () => {
    const runtime = await signedInRuntime();
    const invites = createInvitationServices(runtime, { ttlDays: 1 });
    const fresh = await invites.create({ email: 'hedy@example.com', role: 'member' });
    expect(await invites.preview(fresh.token.id)).toMatchObject({
      status: 'valid',
      email: 'hedy@example.com',
      role: 'member',
      hasAccount: false,
      inviterName: runtime.session.principal()?.persona.name,
      organizationName: runtime.session.principal()?.organization?.name,
    });
    expect(await invites.preview('nope')).toEqual({ status: 'unknown' });
    expect(await invites.preview('')).toEqual({ status: 'unknown' });

    const resent = await invites.resend(fresh.invitation.id);
    expect((await invites.preview(fresh.token.id)).status).toBe('revoked');
    const revoked = await invites.create({ email: 'grace@example.com', role: 'member' });
    await invites.revoke(revoked.invitation.id);
    expect((await invites.preview(revoked.token.id)).status).toBe('revoked');

    await invites.accept({ tokenId: resent.token.id }, { signIn: false });
    expect((await invites.preview(resent.token.id)).status).toBe('used');

    const late = await invites.create({ email: 'katherine@example.com', role: 'member' });
    runtime.clock.commitAdvance({ days: 2 });
    expect((await invites.preview(late.token.id)).status).toBe('expired');
    // Preview never changes anything: the invitation is still pending until someone tries to accept.
    expect(
      (await runtime.db.rows<SaasInvitation>('saas_invitations').get(late.invitation.id))?.status
    ).toBe('pending');
  });
});
