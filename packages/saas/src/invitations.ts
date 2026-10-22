import {
  createRuntimeId,
  isExampleEmail,
  type Membership,
  parseInput,
  ValidationError,
} from '@protoyard/core';
import type { ProtoyardRuntime } from '@protoyard/runtime';
import { z } from 'zod';
import { createInbox } from './inbox.ts';
import { assertInOrg } from './org-access.ts';
import type {
  SaasAccount,
  SaasInboxMessage,
  SaasInvitation,
  SaasMfa,
  SaasToken,
} from './schema.ts';

const ACCOUNTS = 'saas_accounts';
const TOKENS = 'saas_tokens';
const INVITATIONS = 'saas_invitations';
const INBOX = 'saas_inbox';
const MFA = 'saas_mfa';
const INVITE_CAPABILITY = 'members:invite';

interface TableLike<T> {
  get(id: string): Promise<T | undefined>;
  add(row: T): Promise<unknown>;
  put(row: T): Promise<unknown>;
  where(index: string): { equals(value: string): { first(): Promise<T | undefined> } };
}
interface DatabaseLike {
  table<T>(name: string): TableLike<T>;
  hasTable?(name: string): boolean;
  transaction<R>(mode: 'rw', tables: string[], scope: () => Promise<R>): Promise<R>;
}

const EmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('Enter a valid email'))
  .refine(isExampleEmail, 'Use a fictional address at example.com');

export const CreateInvitationSchema = z.object({
  email: EmailSchema,
  role: z.string().trim().min(1).max(40),
});
export type CreateInvitationInput = z.input<typeof CreateInvitationSchema>;

export const AcceptInvitationSchema = z.object({
  tokenId: z.string().min(1),
  name: z.string().trim().min(2).max(120).optional(),
  /** Optional simulated credential for a newly created account; never a real password. */
  password: z.string().min(8).max(128).optional(),
});
export type AcceptInvitationInput = z.input<typeof AcceptInvitationSchema>;

/** What the accept screen can show before anyone clicks (read-only, no side effects). */
export type InvitationPreviewStatus = 'valid' | 'expired' | 'used' | 'revoked' | 'unknown';

export interface InvitationPreview {
  status: InvitationPreviewStatus;
  invitation?: SaasInvitation;
  email?: string;
  role?: string;
  organizationName?: string;
  inviterName?: string;
  /** An account with the invited email already exists (no name or password needed). */
  hasAccount?: boolean;
}

export interface AcceptInvitationOptions {
  /**
   * After joining, sign the invitee in and switch to the workspace (default
   * true). Accounts with an active simulated authenticator are never signed in
   * here: the result says `requiresMfa` and the screen sends them to sign in.
   */
  signIn?: boolean;
}

export interface InvitationOptions {
  ttlDays?: number;
  href?: (tokenId: string) => string;
  productName?: string;
  /**
   * Domain tables every `create` side effect may write. They join the
   * invitation transaction, so a failed side effect rolls the invitation back.
   */
  tables?: readonly string[];
}

/** Typed access to one table a side effect declared; every call joins the invitation transaction. */
export interface InvitationTable<T> {
  get(id: string): Promise<T | undefined>;
  add(row: T): Promise<unknown>;
  put(row: T): Promise<unknown>;
  bulkAdd(rows: readonly T[]): Promise<unknown>;
  bulkPut(rows: readonly T[]): Promise<unknown>;
  update(id: string, changes: Partial<T>): Promise<number>;
  delete(id: string): Promise<void>;
  toArray(): Promise<T[]>;
  where(index: string): {
    equals(value: string | number): {
      first(): Promise<T | undefined>;
      toArray(): Promise<T[]>;
      count(): Promise<number>;
    };
  };
}

/** What a `create` side effect receives, after the invitation, token and inbox message exist. */
export interface InvitationSideEffectContext {
  invitation: SaasInvitation;
  token: SaasToken;
  message: SaasInboxMessage;
  /**
   * A table declared in `tables` (the service's or this call's). Any other
   * name throws, so the side effect cannot reach the invitation's own tables.
   */
  table<T extends { id: string }>(name: string): InvitationTable<T>;
}

/**
 * Extra domain writes made in the same transaction as the invitation. Await
 * only table operations inside it (a timer or a fetch would commit the
 * transaction early). A throw or rejection rolls back the invitation, its
 * token, its inbox message and every write the side effect made.
 */
export type InvitationSideEffect<R = void> = (
  invitation: SaasInvitation,
  context: InvitationSideEffectContext
) => R | Promise<R>;

export interface CreateInvitationOptions<R = void> {
  sideEffect?: InvitationSideEffect<R>;
  /** Extra tables for this call, added to `InvitationOptions.tables`. */
  tables?: readonly string[];
}

export interface CreatedInvitation<R = void> {
  invitation: SaasInvitation;
  token: SaasToken;
  message: SaasInboxMessage;
  /** What the side effect returned; `undefined` without one. */
  effect: R | undefined;
}

function requirePrincipal(runtime: ProtoyardRuntime) {
  const principal = runtime.session.principal();
  if (!principal) throw new ValidationError({ form: 'Sign in before managing invitations.' });
  return principal;
}

/** Simulated team invitations delivered through the prototype inbox; not email or security. */
export function createInvitationServices(
  runtime: ProtoyardRuntime,
  options: InvitationOptions = {}
) {
  const db = runtime.db as unknown as DatabaseLike;
  const inbox = createInbox(runtime);
  const ttlMs = (options.ttlDays ?? 7) * 86_400_000;
  const href =
    options.href ?? ((tokenId: string) => `#/invites/accept?token=${encodeURIComponent(tokenId)}`);
  const product = options.productName ?? 'the prototype';
  const now = () => runtime.clock.now();
  const accounts = () => db.table<SaasAccount>(ACCOUNTS);
  const tokens = () => db.table<SaasToken>(TOKENS);
  const invitations = () => db.table<SaasInvitation>(INVITATIONS);
  const ownTables: readonly string[] = [ACCOUNTS, TOKENS, INVITATIONS, INBOX];

  /** Validates side-effect table names before anything is written. */
  function sideEffectTables(extra: readonly string[] = []): string[] {
    const names = [...new Set([...(options.tables ?? []), ...extra])];
    for (const name of names) {
      if (ownTables.includes(name) || name.startsWith('py_')) {
        throw new Error(
          `"${name}" belongs to invitations or identity; a side effect cannot write it directly.`
        );
      }
      if (db.hasTable && !db.hasTable(name)) throw new Error(`Unknown table "${name}".`);
    }
    return names;
  }

  /**
   * `members:invite` with the actor's role in the invitation's organization
   * (which may not be the active one); non-members are denied.
   */
  function assertInviteCapability(organizationId: string) {
    assertInOrg(runtime, INVITE_CAPABILITY, organizationId);
  }

  /**
   * Creates a pending invitation, its single-use token and the inbox message.
   * An optional side effect (a function, or `{ sideEffect, tables }`) runs in
   * the same transaction; if it fails, nothing is written.
   */
  async function create<R = void>(
    input: CreateInvitationInput,
    createOptions?: InvitationSideEffect<R> | CreateInvitationOptions<R>
  ): Promise<CreatedInvitation<R>> {
    const principal = requirePrincipal(runtime);
    const call: CreateInvitationOptions<R> =
      typeof createOptions === 'function' ? { sideEffect: createOptions } : (createOptions ?? {});
    const extraTables = call.sideEffect ? sideEffectTables(call.tables) : [];
    const organizationId = principal.organization?.id;
    if (!organizationId) throw new ValidationError({ organizationId: 'Choose a workspace first.' });
    assertInviteCapability(organizationId);
    const data = parseInput(CreateInvitationSchema, input);
    if (!runtime.policy.definition.roles[data.role]) {
      throw new ValidationError({ role: `Unknown role "${data.role}".` });
    }
    if (data.role === 'owner') runtime.session.assert('members:transfer', { organizationId });
    const at = now();
    return runtime.environment.run('invitations.create', () =>
      runtime.identity.write(
        async (ops) => {
          if (!(await ops.getOrganization(organizationId))) {
            throw new ValidationError({ organizationId: 'This workspace is no longer available.' });
          }
          const account = await accounts().where('email').equals(data.email).first();
          if (account) {
            const existing = await ops.listMemberships({
              personaId: account.personaId,
              organizationId,
            });
            if (existing.length)
              throw new ValidationError({ email: 'This person is already a member.' });
          }
          const invitationId = createRuntimeId('invitation');
          const token: SaasToken = {
            id: createRuntimeId('invite'),
            kind: 'invite',
            email: data.email,
            accountId: account?.id ?? null,
            payload: { invitationId },
            createdAt: at.toISOString(),
            expiresAt: new Date(at.getTime() + ttlMs).toISOString(),
            consumedAt: null,
          };
          const invitation: SaasInvitation = {
            id: invitationId,
            organizationId,
            email: data.email,
            role: data.role,
            invitedBy: principal.persona.id,
            tokenId: token.id,
            status: 'pending',
            createdAt: at.toISOString(),
            expiresAt: token.expiresAt,
            acceptedAt: null,
            acceptedBy: null,
          };
          await tokens().add(token);
          await invitations().add(invitation);
          const message = await inbox.write({
            recipient: data.email,
            personaId: account?.personaId ?? null,
            kind: 'invite',
            subject: `You are invited to ${product}`,
            body: `You have been invited to join a workspace in ${product}. This is a simulated message: nothing was emailed.`,
            action: { label: 'Accept invitation', href: href(token.id) },
          });
          let effect: R | undefined;
          if (call.sideEffect) {
            const allowed = new Set(extraTables);
            effect = await call.sideEffect(invitation, {
              invitation,
              token,
              message,
              table<T extends { id: string }>(name: string) {
                if (!allowed.has(name)) {
                  throw new Error(
                    `Table "${name}" is not declared for this invitation side effect. Declared: ${[...allowed].join(', ') || 'none'}.`
                  );
                }
                return db.table(name) as unknown as InvitationTable<T>;
              },
            });
          }
          return { invitation, token, message, effect };
        },
        { tables: [...ownTables, ...extraTables] }
      )
    );
  }

  async function resend(invitationId: string): Promise<{
    invitation: SaasInvitation;
    token: SaasToken;
    message: SaasInboxMessage;
  }> {
    requirePrincipal(runtime);
    const invitation = await invitations().get(invitationId);
    if (!invitation) throw new ValidationError({ invitationId: 'Invitation not found.' });
    assertInviteCapability(invitation.organizationId);
    if (invitation.status !== 'pending') {
      throw new ValidationError({ invitationId: 'Only pending invitations can be resent.' });
    }
    const at = now();
    return runtime.environment.run('invitations.resend', () =>
      runtime.identity.write(
        async () => {
          const current = await invitations().get(invitationId);
          if (current?.status !== 'pending') {
            throw new ValidationError({ invitationId: 'This invitation is no longer pending.' });
          }
          if (current.tokenId) {
            const previous = await tokens().get(current.tokenId);
            if (previous && !previous.consumedAt) {
              await tokens().put({ ...previous, consumedAt: at.toISOString() });
            }
          }
          const account = await accounts().where('email').equals(current.email).first();
          const token: SaasToken = {
            id: createRuntimeId('invite'),
            kind: 'invite',
            email: current.email,
            accountId: account?.id ?? null,
            payload: { invitationId },
            createdAt: at.toISOString(),
            expiresAt: new Date(at.getTime() + ttlMs).toISOString(),
            consumedAt: null,
          };
          const updated = { ...current, tokenId: token.id, expiresAt: token.expiresAt };
          await tokens().add(token);
          await invitations().put(updated);
          const message = await inbox.write({
            recipient: current.email,
            personaId: account?.personaId ?? null,
            kind: 'invite',
            subject: `Your invitation to ${product}`,
            body: `Here is a fresh link to join a workspace in ${product}. This is a simulated message: nothing was emailed.`,
            action: { label: 'Accept invitation', href: href(token.id) },
          });
          return { invitation: updated, token, message };
        },
        { tables: [ACCOUNTS, TOKENS, INVITATIONS, INBOX] }
      )
    );
  }

  async function revoke(invitationId: string): Promise<SaasInvitation> {
    requirePrincipal(runtime);
    const invitation = await invitations().get(invitationId);
    if (!invitation) throw new ValidationError({ invitationId: 'Invitation not found.' });
    assertInviteCapability(invitation.organizationId);
    if (invitation.status !== 'pending') {
      throw new ValidationError({ invitationId: 'Only pending invitations can be revoked.' });
    }
    const at = now().toISOString();
    return runtime.environment.run('invitations.revoke', () =>
      runtime.identity.write(
        async () => {
          const current = await invitations().get(invitationId);
          if (current?.status !== 'pending') {
            throw new ValidationError({ invitationId: 'This invitation is no longer pending.' });
          }
          if (current.tokenId) {
            const token = await tokens().get(current.tokenId);
            if (token && !token.consumedAt) await tokens().put({ ...token, consumedAt: at });
          }
          const revoked = { ...current, status: 'revoked' as const, tokenId: null };
          await invitations().put(revoked);
          return revoked;
        },
        { tables: [TOKENS, INVITATIONS] }
      )
    );
  }

  /** Read-only status of an invitation link, for the accept screen. */
  async function preview(tokenId: string): Promise<InvitationPreview> {
    const token = tokenId ? await tokens().get(tokenId) : undefined;
    if (token?.kind !== 'invite') return { status: 'unknown' };
    const invitation = await invitations().where('tokenId').equals(tokenId).first();
    const invitationId = (token.payload as { invitationId?: unknown }).invitationId;
    const byId =
      invitation ??
      (typeof invitationId === 'string' ? await invitations().get(invitationId) : undefined);
    if (!byId) return { status: 'unknown' };
    const organization = runtime.session.organizations().find((o) => o.id === byId.organizationId);
    const inviter = runtime.session.personas().find((p) => p.id === byId.invitedBy);
    const account = await accounts().where('email').equals(byId.email).first();
    const base = {
      invitation: byId,
      email: byId.email,
      role: byId.role,
      ...(organization ? { organizationName: organization.name } : {}),
      ...(inviter ? { inviterName: inviter.name } : {}),
      hasAccount: Boolean(account),
    };
    // A resent link replaces the old token, so the old one reads as withdrawn.
    let status: InvitationPreviewStatus = 'valid';
    if (byId.status === 'accepted') status = 'used';
    // An expired accept attempt also consumes the token, so check expiry first.
    else if (byId.status === 'expired') status = 'expired';
    else if (byId.status === 'revoked' || byId.tokenId !== tokenId) status = 'revoked';
    else if (token.consumedAt) status = 'used';
    else if (Date.parse(token.expiresAt) <= now().getTime()) status = 'expired';
    return { status, ...base };
  }

  async function hasActiveMfa(accountId: string): Promise<boolean> {
    if (db.hasTable && !db.hasTable(MFA)) return false;
    const factor = await db.table<SaasMfa>(MFA).where('accountId').equals(accountId).first();
    return factor?.status === 'active';
  }

  async function accept(
    input: AcceptInvitationInput,
    acceptOptions: AcceptInvitationOptions = {}
  ): Promise<{
    invitation: SaasInvitation;
    account: SaasAccount;
    membership: Membership;
    createdAccount: boolean;
    /** True when the invitee is now the signed-in persona. */
    signedIn: boolean;
    /** The account has an active simulated authenticator: send them to sign in. */
    requiresMfa: boolean;
  }> {
    const data = parseInput(AcceptInvitationSchema, input);
    const result = await runtime.environment.run('invitations.accept', () =>
      runtime.identity.write(
        async (ops) => {
          const token = await tokens().get(data.tokenId);
          if (token?.kind !== 'invite')
            throw new ValidationError({ form: 'This invitation is not valid.' });
          const invitationRows = await invitations().where('tokenId').equals(data.tokenId).first();
          if (invitationRows?.status !== 'pending' || invitationRows.email !== token.email) {
            throw new ValidationError({ form: 'This invitation is no longer available.' });
          }
          if (token.consumedAt)
            throw new ValidationError({ form: 'This invitation was already used.' });
          if (Date.parse(token.expiresAt) <= now().getTime()) {
            await invitations().put({ ...invitationRows, status: 'expired' });
            await tokens().put({ ...token, consumedAt: now().toISOString() });
            return { expired: true as const };
          }
          const organization = await ops.getOrganization(invitationRows.organizationId);
          if (!organization)
            throw new ValidationError({ form: 'This workspace is no longer available.' });
          let account = await accounts().where('email').equals(invitationRows.email).first();
          // A disabled or locked account is never joined or signed in through an
          // invite link (same rule as magic links); throwing rolls back the write.
          if (account && account.status !== 'active') {
            throw new ValidationError({ form: 'This account is not available.' });
          }
          let createdAccount = false;
          if (!account) {
            const localName =
              invitationRows.email.split('@')[0]?.replace(/[._-]+/g, ' ') ?? 'New member';
            const name = data.name ?? localName.replace(/\b\w/g, (letter) => letter.toUpperCase());
            const persona = await ops.putPersona({
              name,
              email: invitationRows.email,
              onboardingComplete: false,
              ...(invitationRows.avatar ? { avatar: invitationRows.avatar } : {}),
            });
            account = {
              id: createRuntimeId('acct'),
              personaId: persona.id,
              email: invitationRows.email,
              emailVerified: true,
              simulatedPassword: data.password ?? null,
              providers: [],
              status: 'active',
              failedAttempts: 0,
              createdAt: now().toISOString(),
              lastSignInAt: null,
            };
            await accounts().add(account);
            createdAccount = true;
          }
          const prior = await ops.listMemberships({
            personaId: account.personaId,
            organizationId: organization.id,
          });
          if (prior.length) throw new ValidationError({ form: 'This person is already a member.' });
          const membership = await ops.putMembership({
            personaId: account.personaId,
            organizationId: organization.id,
            role: invitationRows.role,
          });
          const at = now().toISOString();
          const accepted = {
            ...invitationRows,
            status: 'accepted' as const,
            acceptedAt: at,
            acceptedBy: account.personaId,
          };
          await tokens().put({ ...token, consumedAt: at });
          await invitations().put(accepted);
          return {
            expired: false as const,
            invitation: accepted,
            account,
            membership,
            createdAccount,
          };
        },
        { tables: [ACCOUNTS, TOKENS, INVITATIONS, INBOX] }
      )
    );
    if (result.expired) {
      throw new ValidationError({ form: 'This invitation has expired. Ask for a new one.' });
    }
    const { expired: _expired, ...accepted } = result;
    // Opening the invite link proves the mailbox (simulated), so the invitee is
    // signed in and lands in the workspace, unless their account requires MFA.
    if (acceptOptions.signIn === false) return { ...accepted, signedIn: false, requiresMfa: false };
    if (await hasActiveMfa(accepted.account.id)) {
      return { ...accepted, signedIn: false, requiresMfa: true };
    }
    await runtime.session.signIn(accepted.account.personaId);
    await runtime.session.switchOrganization(accepted.membership.organizationId);
    return { ...accepted, signedIn: true, requiresMfa: false };
  }

  return { create, resend, revoke, accept, preview };
}

export type InvitationServices = ReturnType<typeof createInvitationServices>;
