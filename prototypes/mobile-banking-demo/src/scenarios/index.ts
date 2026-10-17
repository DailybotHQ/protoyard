import { defineScenario, type ScenarioInput } from '@protoyard/core';

/**
 * Lumen Bank scenarios. Same household, different moments and conditions.
 * Everything is fictional: people, merchants, institutions and balances.
 */

export const REFERENCE_TIME = '2026-10-16T10:00:00-05:00';

export interface BankGeneratorOptions {
  /** Months of history to generate. */
  months: number;
  /** Starting checking balance in cents (before history). */
  openingCents: number;
  /** Override every account status (e.g. 'locked'). */
  status?: 'active' | 'locked' | 'dormant';
  /** Hold most money in savings so checking is nearly empty. */
  lowBalance?: boolean;
}

const household = { id: 'org_0001', name: 'Rivera household', type: 'household' } as const;

const active = defineScenario({
  id: 'active-customer',
  name: 'Active customer, 6 months',
  description:
    'Paycheck, rent, groceries and transfers over six months. Checking, savings and a credit card with realistic history.',
  group: 'Lifecycle',
  seed: 2026,
  referenceTime: REFERENCE_TIME,
  organization: { ...household, ageDays: 180, size: 3, subscription: 'pro' },
  actor: { id: 'user_0001', role: 'owner', joinedDaysAgo: 180, onboardingComplete: true },
  density: 'normal',
  activity: { level: 'normal' },
  generators: { bank: { months: 6, openingCents: 420_000 } },
  tags: ['default'],
});

export const scenarios: ScenarioInput[] = [
  defineScenario({
    id: 'new-account',
    name: 'Brand-new account',
    description: 'Account opened today: zero balance, no transactions, no saved recipients.',
    group: 'Lifecycle',
    seed: 7,
    referenceTime: REFERENCE_TIME,
    organization: { ...household, ageDays: 0, size: 1, subscription: 'free' },
    actor: { id: 'user_0001', role: 'owner', joinedDaysAgo: 0, onboardingComplete: false },
    density: 'empty',
    activity: { level: 'none' },
    generators: { bank: { months: 0, openingCents: 0 } },
  }),
  active,
  defineScenario({
    ...active,
    id: 'dormant-account',
    name: 'Dormant account',
    description: 'No activity for four months; accounts flagged dormant until reactivated.',
    activity: { level: 'dormant' },
    generators: { bank: { months: 8, openingCents: 380_000, status: 'dormant' } },
  }),
  defineScenario({
    ...active,
    id: 'locked-account',
    name: 'Locked after suspicious activity',
    description: 'Accounts are locked (simulated fraud hold): balances visible, transfers blocked.',
    group: 'Conditions',
    generators: { bank: { months: 6, openingCents: 420_000, status: 'locked' } },
  }),
  defineScenario({
    ...active,
    id: 'low-balance',
    name: 'Insufficient balance',
    description: 'Checking is almost empty — try a transfer to see the insufficient-funds path.',
    group: 'Conditions',
    generators: { bank: { months: 6, openingCents: 420_000, lowBalance: true } },
  }),
  defineScenario({
    ...active,
    id: 'dependent-view',
    name: 'Dependent with view-only access',
    description: 'Sam, a teenager on the household plan, can see balances but cannot move money.',
    group: 'Roles',
    actor: { id: 'user_0003', role: 'viewer', joinedDaysAgo: 60, onboardingComplete: true },
  }),
  defineScenario({
    ...active,
    id: 'offline-mode',
    name: 'Offline',
    description:
      'The phone lost its connection: reads work from the device, transfers fail clearly.',
    group: 'Conditions',
    environment: { network: 'offline' },
  }),
];
