<script lang="ts">
import { getRuntime, navigate } from '@protoyard/renderer-svelte';
import { type OnboardingUiStep, OnboardingWizard } from '@protoyard/saas-ui';
import { z } from 'zod';
import type { MarketplaceDatabase } from '../database/schema.ts';
import { createMarketplaceServices } from '../domain/services.ts';

const runtime = getRuntime<MarketplaceDatabase>();
const services = createMarketplaceServices(runtime);
const steps: OnboardingUiStep[] = [
  {
    id: 'seller-details',
    label: 'Your shop',
    description: 'Introduce your business',
    intro: 'Create a profile buyers can trust.',
    schema: z.object({
      storeName: z.string().trim().min(2, 'Enter a shop name').max(80),
      bio: z.string().trim().min(10, 'Tell buyers a little about your shop').max(500),
    }),
    fields: [
      { name: 'storeName', label: 'Shop name', kind: 'text', required: true },
      {
        name: 'bio',
        label: 'About your shop',
        kind: 'text',
        required: true,
        placeholder: 'What do you make?',
      },
    ],
    async apply() {},
  },
  {
    id: 'payout-details',
    label: 'Payout details',
    description: 'Simulated payout contact',
    intro: 'Use a fictional address. Payouts stay in the local simulation.',
    schema: z.object({
      payoutEmail: z
        .string()
        .trim()
        .toLowerCase()
        .email()
        .refine((email) => email.endsWith('@example.com'), 'Use a fictional @example.com address'),
    }),
    fields: [
      {
        name: 'payoutEmail',
        label: 'Payout email',
        kind: 'text',
        required: true,
        placeholder: 'payout@example.com',
      },
    ],
    async apply(answer) {
      const input = answer as { payoutEmail: string };
      const personaId = runtime.session.principal()?.persona.id;
      if (!personaId) throw new Error('Sign in to complete seller onboarding.');
      const saved = (await runtime.db.table('saas_onboarding').get(personaId)) as
        | { answers?: Record<string, { storeName?: string; bio?: string }> }
        | undefined;
      const details = saved?.answers?.['seller-details'];
      await services.onboardSeller({
        storeName: details?.storeName ?? '',
        bio: details?.bio ?? '',
        ...input,
      });
    },
  },
];
</script>

<section class="mx-auto max-w-2xl"><p class="mb-3 text-sm font-semibold uppercase tracking-wide text-primary">Seller onboarding</p><OnboardingWizard {steps} title="Set up your seller studio" onComplete={() => navigate('/seller')} /></section>
