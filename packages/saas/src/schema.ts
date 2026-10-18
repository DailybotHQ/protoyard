import type { IntegrityRules, Row } from '@protoyard/core';
import { z } from 'zod';

/**
 * Tables, row schemas and integrity rules for the simulated SaaS kits
 * (ADR-018). Everything here is UX simulation, NOT security: "passwords",
 * tokens and MFA seeds are plain values in the browser's IndexedDB, readable
 * by any script on the same origin. Never put a real credential in them.
 *
 * A prototype opts in by spreading `saasStores()` into one of its database
 * versions, returning `saasTables()` from its generator and merging
 * `saasIntegrity()` into its integrity rules.
 */

/** Version of the kit's table layout. Bump it (and add a layout) when stores change. */
export const SAAS_SCHEMA_VERSION = 1;

const isoDate = z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
  message: 'Expected an ISO date',
});
const nullableDate = isoDate.nullable().default(null);
const cents = z.number().int().nonnegative();

/** In-app links only: kit messages and actions never point off-origin. */
export const HashHrefSchema = z
  .string()
  .regex(/^#\/[^\s]*$/, 'Expected an in-app hash route such as "#/sign-in"');

export const SAAS_PROVIDERS = ['google', 'github', 'microsoft', 'apple', 'slack'] as const;
export const SaasProviderSchema = z.enum(SAAS_PROVIDERS);
export type SaasProvider = z.infer<typeof SaasProviderSchema>;

export const LinkedProviderSchema = z.object({
  provider: SaasProviderSchema,
  /** The simulated provider's user id (fictional). */
  subject: z.string().min(1),
  email: z.email(),
  linkedAt: isoDate,
});
export type LinkedProvider = z.infer<typeof LinkedProviderSchema>;

export const SaasNotificationPreferencesSchema = z.object({
  productUpdates: z.boolean(),
  securityAlerts: z.boolean(),
  workspaceActivity: z.boolean(),
});
export type SaasNotificationPreferences = z.infer<typeof SaasNotificationPreferencesSchema>;

export const DEFAULT_SAAS_NOTIFICATION_PREFERENCES: SaasNotificationPreferences = {
  productUpdates: false,
  securityAlerts: true,
  workspaceActivity: true,
};

export const SaasAccountSchema = z.object({
  id: z.string().min(1),
  personaId: z.string().min(1),
  email: z.email(),
  emailVerified: z.boolean().default(false),
  /** Simulated password, stored as typed. Simulation only: never a real password. */
  simulatedPassword: z.string().nullable().default(null),
  providers: z.array(LinkedProviderSchema).default([]),
  notificationPreferences: SaasNotificationPreferencesSchema.optional(),
  status: z.enum(['active', 'locked', 'disabled']).default('active'),
  failedAttempts: z.number().int().nonnegative().default(0),
  createdAt: isoDate,
  lastSignInAt: nullableDate,
});
export type SaasAccount = z.infer<typeof SaasAccountSchema>;

export const SIGN_IN_METHODS = [
  'password',
  'oauth',
  'magic-link',
  'mfa',
  'invite',
  'sign-up',
  'sign-out',
] as const;

export const SaasSessionLogSchema = z.object({
  id: z.string().min(1),
  accountId: z.string().nullable().default(null),
  personaId: z.string().nullable().default(null),
  method: z.enum(SIGN_IN_METHODS),
  provider: SaasProviderSchema.nullable().default(null),
  outcome: z.enum(['success', 'failure']),
  /** Short machine reason for failures: `wrong-password`, `locked`, `consent-denied`… */
  reason: z.string().nullable().default(null),
  at: isoDate,
});
export type SaasSessionLog = z.infer<typeof SaasSessionLogSchema>;

export const TOKEN_KINDS = [
  'verify-email',
  'magic-link',
  'password-reset',
  'invite',
  'oauth-state',
] as const;

export const SaasTokenSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(TOKEN_KINDS),
  email: z.email(),
  accountId: z.string().nullable().default(null),
  /** Small kind-specific data (provider, intent, invitation id…). Never secrets. */
  payload: z.record(z.string(), z.unknown()).default({}),
  createdAt: isoDate,
  expiresAt: isoDate,
  consumedAt: nullableDate,
});
export type SaasToken = z.infer<typeof SaasTokenSchema>;

export const RecoveryCodeSchema = z.object({
  code: z.string().min(1),
  usedAt: nullableDate,
});

export const SaasMfaSchema = z.object({
  id: z.string().min(1),
  accountId: z.string().min(1),
  /** Codes derive from this seed and the simulated clock; not real TOTP. */
  method: z.literal('totp-sim').default('totp-sim'),
  seed: z.string().min(1),
  status: z.enum(['pending', 'active']).default('pending'),
  enrolledAt: isoDate,
  recoveryCodes: z.array(RecoveryCodeSchema).default([]),
});
export type SaasMfa = z.infer<typeof SaasMfaSchema>;

export const SaasInvitationSchema = z.object({
  id: z.string().min(1),
  organizationId: z.string().min(1),
  email: z.email(),
  role: z.string().min(1),
  invitedBy: z.string().min(1),
  tokenId: z.string().nullable().default(null),
  status: z.enum(['pending', 'accepted', 'revoked', 'expired']).default('pending'),
  createdAt: isoDate,
  expiresAt: isoDate,
  acceptedAt: nullableDate,
  acceptedBy: z.string().nullable().default(null),
});
export type SaasInvitation = z.infer<typeof SaasInvitationSchema>;

export const INBOX_KINDS = [
  'verify-email',
  'magic-link',
  'password-reset',
  'invite',
  'receipt',
  'trial',
  'notification',
] as const;

export const InboxActionSchema = z.object({
  label: z.string().min(1),
  href: HashHrefSchema,
});

export const SaasInboxMessageSchema = z.object({
  id: z.string().min(1),
  /** The simulated mailbox address; also lets signed-out visitors read their mail. */
  recipient: z.email(),
  personaId: z.string().nullable().default(null),
  kind: z.enum(INBOX_KINDS),
  subject: z.string().min(1),
  /** Plain text only: rendered as text, never as HTML. */
  body: z.string(),
  action: InboxActionSchema.nullable().default(null),
  at: isoDate,
  readAt: nullableDate,
  archivedAt: nullableDate,
});
export type SaasInboxMessage = z.infer<typeof SaasInboxMessageSchema>;

export const SaasSubscriptionSchema = z.object({
  id: z.string().min(1),
  organizationId: z.string().min(1),
  planId: z.string().min(1),
  status: z.enum(['trialing', 'active', 'past_due', 'canceled', 'expired']),
  interval: z.enum(['month', 'year']).default('month'),
  seats: z.number().int().positive().default(1),
  /** Price per seat per interval, integer cents. */
  unitAmountCents: cents,
  currency: z.string().length(3).default('USD'),
  trialEndsAt: nullableDate,
  currentPeriodStart: isoDate,
  currentPeriodEnd: isoDate,
  cancelAtPeriodEnd: z.boolean().default(false),
  createdAt: isoDate,
});
export type SaasSubscription = z.infer<typeof SaasSubscriptionSchema>;

export const InvoiceLineSchema = z.object({
  description: z.string().min(1),
  /** May be negative for credits (proration). */
  amountCents: z.number().int(),
});

export const SaasInvoiceSchema = z.object({
  id: z.string().min(1),
  organizationId: z.string().min(1),
  /**
   * The subscription this invoice belongs to; `null` for a failed first
   * checkout, where no subscription was ever created.
   */
  subscriptionId: z.string().min(1).nullable(),
  status: z.enum(['paid', 'open', 'void', 'failed']),
  amountCents: z.number().int(),
  currency: z.string().length(3).default('USD'),
  lines: z.array(InvoiceLineSchema).default([]),
  periodStart: isoDate,
  periodEnd: isoDate,
  issuedAt: isoDate,
  paidAt: nullableDate,
});
export type SaasInvoice = z.infer<typeof SaasInvoiceSchema>;

export const SaasOnboardingSchema = z.object({
  /** One row per persona: the id is the persona id. */
  id: z.string().min(1),
  personaId: z.string().min(1),
  organizationId: z.string().nullable().default(null),
  currentStep: z.string().min(1),
  completedSteps: z.array(z.string()).default([]),
  skippedSteps: z.array(z.string()).default([]),
  answers: z.record(z.string(), z.unknown()).default({}),
  startedAt: nullableDate,
  updatedAt: isoDate,
  completedAt: nullableDate,
});
export type SaasOnboarding = z.infer<typeof SaasOnboardingSchema>;

/** Every kit table with its Dexie store definition (layout version 1). */
const LAYOUTS: Record<number, Record<string, string>> = {
  1: {
    saas_accounts: 'id, &email, personaId',
    saas_sessions_log: 'id, accountId, personaId, at',
    saas_tokens: 'id, kind, email, accountId, expiresAt',
    saas_mfa: 'id, &accountId',
    saas_invitations: 'id, organizationId, email, status, tokenId',
    saas_inbox: 'id, recipient, personaId, kind, at',
    saas_subscriptions: 'id, organizationId, status',
    saas_invoices: 'id, organizationId, subscriptionId, issuedAt',
    saas_onboarding: 'id, personaId, organizationId',
  },
};

export const SAAS_TABLE_NAMES = [
  'saas_accounts',
  'saas_sessions_log',
  'saas_tokens',
  'saas_mfa',
  'saas_invitations',
  'saas_inbox',
  'saas_subscriptions',
  'saas_invoices',
  'saas_onboarding',
] as const;
export type SaasTableName = (typeof SAAS_TABLE_NAMES)[number];

/** Row schema per table, for validating generator output and imports. */
export const SAAS_ROW_SCHEMAS = {
  saas_accounts: SaasAccountSchema,
  saas_sessions_log: SaasSessionLogSchema,
  saas_tokens: SaasTokenSchema,
  saas_mfa: SaasMfaSchema,
  saas_invitations: SaasInvitationSchema,
  saas_inbox: SaasInboxMessageSchema,
  saas_subscriptions: SaasSubscriptionSchema,
  saas_invoices: SaasInvoiceSchema,
  saas_onboarding: SaasOnboardingSchema,
} as const satisfies Record<SaasTableName, z.ZodType>;

export interface SaasRows {
  saas_accounts: SaasAccount;
  saas_sessions_log: SaasSessionLog;
  saas_tokens: SaasToken;
  saas_mfa: SaasMfa;
  saas_invitations: SaasInvitation;
  saas_inbox: SaasInboxMessage;
  saas_subscriptions: SaasSubscription;
  saas_invoices: SaasInvoice;
  saas_onboarding: SaasOnboarding;
}

export interface SaasTableOptions {
  /** Only these kit tables (default: all). Lets a prototype skip billing, MFA… */
  tables?: readonly SaasTableName[];
}

function selected(options: SaasTableOptions): readonly SaasTableName[] {
  const tables = options.tables ?? SAAS_TABLE_NAMES;
  for (const table of tables) {
    if (!SAAS_TABLE_NAMES.includes(table)) throw new Error(`Unknown SaaS kit table "${table}".`);
  }
  return tables;
}

/**
 * Dexie store definitions for the kit tables, to spread into a prototype's
 * database version: `{ version: 2, stores: { ...saasStores() } }`.
 */
export function saasStores(
  version: number = SAAS_SCHEMA_VERSION,
  options: SaasTableOptions = {}
): Record<string, string> {
  const layout = LAYOUTS[version];
  if (!layout) {
    throw new Error(
      `Unknown SaaS kit layout version ${version}. Known: ${Object.keys(LAYOUTS).join(', ')}.`
    );
  }
  const stores: Record<string, string> = {};
  for (const table of selected(options)) stores[table] = layout[table] as string;
  return stores;
}

/**
 * Empty arrays for every selected kit table, overlaid with the rows given.
 * Return it from `generate()` so integrity relations always find their target
 * tables in the seed, even when a scenario has no rows for them.
 */
export function saasTables(
  rows: Partial<{ [K in SaasTableName]: readonly SaasRows[K][] }> = {},
  options: SaasTableOptions = {}
): Record<string, Row[]> {
  const tables: Record<string, Row[]> = {};
  for (const table of selected(options)) {
    tables[table] = [...((rows[table] ?? []) as readonly Row[])];
  }
  for (const table of Object.keys(rows)) {
    if (!(table in tables)) {
      throw new Error(`Rows were given for "${table}", which is not a selected kit table.`);
    }
  }
  return tables;
}

const RELATIONS: Record<SaasTableName, Record<string, string>> = {
  saas_accounts: { personaId: 'py_personas' },
  saas_sessions_log: { accountId: 'saas_accounts', personaId: 'py_personas' },
  saas_tokens: { accountId: 'saas_accounts' },
  saas_mfa: { accountId: 'saas_accounts' },
  saas_invitations: {
    organizationId: 'py_organizations',
    invitedBy: 'py_personas',
    tokenId: 'saas_tokens',
    acceptedBy: 'py_personas',
  },
  saas_inbox: { personaId: 'py_personas' },
  saas_subscriptions: { organizationId: 'py_organizations' },
  saas_invoices: { organizationId: 'py_organizations', subscriptionId: 'saas_subscriptions' },
  saas_onboarding: { personaId: 'py_personas', organizationId: 'py_organizations' },
};

/** Past-only timestamps. Future dates (expiresAt, trialEndsAt, period ends) are left out. */
const TIMESTAMPS: Record<SaasTableName, readonly string[]> = {
  saas_accounts: ['createdAt', 'lastSignInAt'],
  saas_sessions_log: ['at'],
  saas_tokens: ['createdAt', 'consumedAt'],
  saas_mfa: ['enrolledAt'],
  saas_invitations: ['createdAt', 'acceptedAt'],
  saas_inbox: ['at', 'readAt', 'archivedAt'],
  saas_subscriptions: ['createdAt', 'currentPeriodStart'],
  saas_invoices: ['issuedAt', 'paidAt'],
  saas_onboarding: ['startedAt', 'updatedAt', 'completedAt'],
};

/**
 * Integrity rules for the selected kit tables. A relation whose target is a
 * kit table that was not selected is dropped, so partial kits stay valid.
 */
export function saasIntegrity(options: SaasTableOptions = {}): IntegrityRules {
  const tables = selected(options);
  const chosen = new Set<string>(tables);
  const relations: Record<string, Record<string, string>> = {};
  const timestamps: Record<string, readonly string[]> = {};
  for (const table of tables) {
    const fields: Record<string, string> = {};
    for (const [field, target] of Object.entries(RELATIONS[table])) {
      if (!target.startsWith('saas_') || chosen.has(target)) fields[field] = target;
    }
    relations[table] = fields;
    timestamps[table] = TIMESTAMPS[table];
  }
  return { relations, timestamps };
}

/**
 * Merges integrity rules: relations are combined per table and field (a later
 * rule set wins on the same field), timestamp columns are unioned.
 */
export function mergeIntegrity(...rules: readonly (IntegrityRules | undefined)[]): IntegrityRules {
  const relations: Record<string, Record<string, string>> = {};
  const timestamps: Record<string, string[]> = {};
  for (const rule of rules) {
    for (const [table, fields] of Object.entries(rule?.relations ?? {})) {
      relations[table] = { ...relations[table], ...fields };
    }
    for (const [table, fields] of Object.entries(rule?.timestamps ?? {})) {
      timestamps[table] = [...new Set([...(timestamps[table] ?? []), ...fields])];
    }
  }
  return { relations, timestamps };
}
