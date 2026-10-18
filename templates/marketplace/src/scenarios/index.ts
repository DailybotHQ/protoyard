import { saasFragments } from '@protoyard/saas';
import { composeScenario, PRESETS } from '@protoyard/scenarios';

const organization = { id: 'org_fieldmarket', name: 'Fieldmarket', size: 5 };
const buyer = { id: 'user_0001', role: 'buyer' };
const seller = { id: 'user_0001', role: 'seller', onboardingComplete: true, onboardingProgress: 1 };
const otherSellers = ['seller', 'buyer', 'seller', 'buyer'] as const;

export const scenarios = [
  composeScenario(
    PRESETS['first-week'],
    {
      id: 'marketplace',
      name: 'Marketplace browse',
      description:
        'A signed-out visitor explores active listings and can use the simulated account flows.',
      seed: 84_001,
      referenceTime: '2026-10-18T10:00:00.000Z',
      organization,
      actor: { ...buyer, onboardingComplete: true, onboardingProgress: 1 },
      tags: ['default', 'signed-out', 'buyer'],
    },
    saasFragments.signedOut(),
    saasFragments.oauthLinked('google')
  ),
  composeScenario(PRESETS['first-week'], {
    id: 'seller-onboarding',
    name: 'New seller setup',
    description: 'A buyer account is ready to complete the seller store and payout setup wizard.',
    seed: 84_002,
    referenceTime: '2026-10-18T11:00:00.000Z',
    organization,
    actor: { ...buyer, onboardingComplete: true, onboardingProgress: 1 },
  }),
  composeScenario(PRESETS['active-month'], {
    id: 'seller-active',
    name: 'Seller workspace',
    description: 'An active seller manages listings and reviews marketplace orders.',
    seed: 84_003,
    referenceTime: '2026-10-18T12:00:00.000Z',
    organization,
    actor: seller,
    tags: ['seller'],
  }),
  composeScenario(PRESETS['active-month'], {
    id: 'seller-orders',
    name: 'Buyer and seller orders',
    description: 'A seller has a paid marketplace order and a pending simulated payout.',
    seed: 84_004,
    referenceTime: '2026-10-18T13:00:00.000Z',
    organization,
    actor: seller,
    tags: ['seller', 'orders', 'payouts'],
  }),
];

export const MARKETPLACE_MEMBER_ROLES = otherSellers;
