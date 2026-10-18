import { z } from 'zod';
import { SAAS_PROVIDERS, type SaasProvider } from './schema.ts';

export const OAuthIdentitySchema = z.object({
  subject: z.string().trim().min(1).max(160),
  name: z.string().trim().min(2).max(120),
  email: z
    .email()
    .trim()
    .toLowerCase()
    .refine((email) => email.endsWith('@example.com'), 'Use a fictional @example.com email'),
  emailShared: z.boolean().default(true),
});
export type OAuthIdentity = z.infer<typeof OAuthIdentitySchema>;

export const OAUTH_PROVIDER_REGISTRY = {
  google: { id: 'google', name: 'Google', scopes: 'basic profile and email' },
  github: { id: 'github', name: 'GitHub', scopes: 'public profile and verified email' },
  microsoft: { id: 'microsoft', name: 'Microsoft', scopes: 'basic profile and email' },
  apple: { id: 'apple', name: 'Apple', scopes: 'name and email' },
  slack: { id: 'slack', name: 'Slack', scopes: 'profile and email' },
} as const satisfies Record<SaasProvider, { id: SaasProvider; name: string; scopes: string }>;

export const OAuthOutcomeSchema = z.enum([
  'success',
  'consent-denied',
  'email-not-shared',
  'provider-error',
]);
export type OAuthOutcome = z.infer<typeof OAuthOutcomeSchema>;

export const OAuthProviderScenarioSchema = z.object({
  identity: OAuthIdentitySchema,
  outcome: OAuthOutcomeSchema.default('success'),
});
export type OAuthProviderScenario = z.input<typeof OAuthProviderScenarioSchema>;

export type OAuthProviderScenarios = Partial<Record<SaasProvider, OAuthProviderScenario>>;

export function defaultOAuthProviderScenarios(): Record<
  SaasProvider,
  z.infer<typeof OAuthProviderScenarioSchema>
> {
  return Object.fromEntries(
    SAAS_PROVIDERS.map((provider) => {
      const name = OAUTH_PROVIDER_REGISTRY[provider].name;
      return [
        provider,
        {
          identity: {
            subject: `${provider}_user_001`,
            name: `${name} Demo User`,
            email: `${provider}.user@example.com`,
            emailShared: true,
          },
          outcome: 'success',
        },
      ];
    })
  ) as Record<SaasProvider, z.infer<typeof OAuthProviderScenarioSchema>>;
}

export function parseOAuthProviderScenarios(
  overrides: OAuthProviderScenarios = {}
): Record<SaasProvider, z.infer<typeof OAuthProviderScenarioSchema>> {
  const defaults = defaultOAuthProviderScenarios();
  return Object.fromEntries(
    SAAS_PROVIDERS.map((provider) => [
      provider,
      OAuthProviderScenarioSchema.parse(overrides[provider] ?? defaults[provider]),
    ])
  ) as Record<SaasProvider, z.infer<typeof OAuthProviderScenarioSchema>>;
}
