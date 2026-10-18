import { parseInput, ValidationError } from '@protoyard/core';
import type { ProtoyardRuntime } from '@protoyard/runtime';
import { z } from 'zod';
import { createAuthServices } from './auth.ts';
import { createMfaServices } from './mfa.ts';
import {
  DEFAULT_SAAS_NOTIFICATION_PREFERENCES,
  type SaasAccount,
  SaasAccountSchema,
  SaasNotificationPreferencesSchema,
} from './schema.ts';

const ACCOUNTS = 'saas_accounts';
const PROFILE_CAPABILITY = 'profile:update';
const SECURITY_CAPABILITY = 'settings:security';
const NOTIFICATIONS_CAPABILITY = 'settings:notifications';

interface TableLike<T> {
  get(id: string): Promise<T | undefined>;
  put(row: T): Promise<unknown>;
  where(index: string): { equals(value: string): { first(): Promise<T | undefined> } };
}
interface DatabaseLike {
  table<T>(name: string): TableLike<T>;
  transaction<R>(mode: 'rw', tables: string[], scope: () => Promise<R>): Promise<R>;
}

export const UpdateProfileSchema = z.object({
  name: z.string().trim().min(2, 'Enter at least 2 characters').max(120),
  avatarColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Choose a valid six-digit color'),
  timezone: z.string().trim().min(1, 'Choose a time zone').max(80),
});
export type UpdateProfileInput = z.input<typeof UpdateProfileSchema>;

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current simulated password'),
  newPassword: z.string().min(8, 'Use at least 8 characters').max(128),
});
export type ChangePasswordInput = z.input<typeof ChangePasswordSchema>;

export function createSettingsServices(runtime: ProtoyardRuntime) {
  const db = runtime.db as unknown as DatabaseLike;
  const accounts = () => db.table<SaasAccount>(ACCOUNTS);

  function requirePersona() {
    const principal = runtime.session.principal();
    if (!principal) throw new ValidationError({ form: 'Sign in before changing settings.' });
    return principal;
  }

  async function accountFor(personaId: string): Promise<SaasAccount> {
    const account = await accounts().where('personaId').equals(personaId).first();
    if (!account) throw new ValidationError({ form: 'No account is linked to this profile.' });
    return SaasAccountSchema.parse(account);
  }

  return {
    async account(): Promise<SaasAccount> {
      const principal = requirePersona();
      return accountFor(principal.persona.id);
    },

    async updateProfile(input: UpdateProfileInput) {
      const principal = requirePersona();
      runtime.session.assert(PROFILE_CAPABILITY, { personaId: principal.persona.id });
      const data = parseInput(UpdateProfileSchema, input);
      return runtime.environment.run('settings.profile.update', () =>
        runtime.identity.write((ops) => ops.putPersona({ ...principal.persona, ...data }))
      );
    },

    async changePassword(input: ChangePasswordInput): Promise<SaasAccount> {
      const principal = requirePersona();
      runtime.session.assert(SECURITY_CAPABILITY, { personaId: principal.persona.id });
      const data = parseInput(ChangePasswordSchema, input);
      return runtime.environment.run('settings.security.password', () =>
        db.transaction('rw', [ACCOUNTS], async () => {
          const account = await accountFor(principal.persona.id);
          if (!account.simulatedPassword || account.simulatedPassword !== data.currentPassword) {
            throw new ValidationError({
              currentPassword: 'That simulated password is not correct.',
            });
          }
          const updated = SaasAccountSchema.parse({
            ...account,
            simulatedPassword: data.newPassword,
          });
          await accounts().put(updated);
          return updated;
        })
      );
    },

    async notificationPreferences() {
      const principal = requirePersona();
      runtime.session.assert(NOTIFICATIONS_CAPABILITY, { personaId: principal.persona.id });
      const account = await accountFor(principal.persona.id);
      return account.notificationPreferences ?? DEFAULT_SAAS_NOTIFICATION_PREFERENCES;
    },

    async updateNotificationPreferences(input: unknown) {
      const principal = requirePersona();
      runtime.session.assert(NOTIFICATIONS_CAPABILITY, { personaId: principal.persona.id });
      const data = parseInput(SaasNotificationPreferencesSchema, input);
      return runtime.environment.run('settings.notifications.update', () =>
        db.transaction('rw', [ACCOUNTS], async () => {
          const account = await accountFor(principal.persona.id);
          const updated = SaasAccountSchema.parse({ ...account, notificationPreferences: data });
          await accounts().put(updated);
          return data;
        })
      );
    },

    async signOutEverywhere(): Promise<void> {
      const principal = requirePersona();
      runtime.session.assert(SECURITY_CAPABILITY, { personaId: principal.persona.id });
      await createAuthServices(runtime).signOut();
    },

    async enrollMfa() {
      const principal = requirePersona();
      runtime.session.assert(SECURITY_CAPABILITY, { personaId: principal.persona.id });
      return createMfaServices(runtime).enroll();
    },

    async confirmMfaEnrollment(code: string) {
      const principal = requirePersona();
      runtime.session.assert(SECURITY_CAPABILITY, { personaId: principal.persona.id });
      return createMfaServices(runtime).confirmEnroll(code);
    },
  };
}
