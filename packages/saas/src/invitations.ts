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
import type { SaasAccount, SaasInboxMessage, SaasInvitation, SaasToken } from './schema.ts';

const ACCOUNTS = 'saas_accounts';
const TOKENS = 'saas_tokens';
const INVITATIONS = 'saas_invitations';
const INBOX = 'saas_inbox';
const INVITE_CAPABILITY = 'members:invite';

interface TableLike<T> {
  get(id: string): Promise<T | undefined>;
  add(row: T): Promise<unknown>;
  put(row: T): Promise<unknown>;
  where(index: string): { equals(value: string): { first(): Promise<T | undefined> } };
}
interface DatabaseLike {
  table<T>(name: string): TableLike<T>;
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

export interface InvitationOptions {
  ttlDays?: number;
  href?: (tokenId: string) => string;
  productName?: string;
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

  function assertInviteCapability(organizationId: string) {
    runtime.session.assert(INVITE_CAPABILITY, { organizationId });
  }

  async function create(input: CreateInvitationInput): Promise<{
    invitation: SaasInvitation;
    token: SaasToken;
    message: SaasInboxMessage;
  }> {
    const principal = requirePrincipal(runtime);
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
          return { invitation, token, message };
        },
        { tables: [ACCOUNTS, TOKENS, INVITATIONS, INBOX] }
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

  async function accept(input: AcceptInvitationInput): Promise<{
    invitation: SaasInvitation;
    account: SaasAccount;
    membership: Membership;
    createdAccount: boolean;
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
          let createdAccount = false;
          if (!account) {
            const localName =
              invitationRows.email.split('@')[0]?.replace(/[._-]+/g, ' ') ?? 'New member';
            const name = data.name ?? localName.replace(/\b\w/g, (letter) => letter.toUpperCase());
            const persona = await ops.putPersona({
              name,
              email: invitationRows.email,
              onboardingComplete: false,
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
    // Identity writes refresh the current session. Accepting an invite does not bypass MFA or sign in.
    return result;
  }

  return { create, resend, revoke, accept };
}

export type InvitationServices = ReturnType<typeof createInvitationServices>;
