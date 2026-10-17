import { defineScenario, type ScenarioInput } from '@protoyard/core';

/**
 * Pipeline CRM scenarios. Each one is a coherent, reproducible world: same
 * seed + reference time + generator version ⇒ the same companies, people,
 * deals and history. Axes compose independently — e.g. `rep-view` is the
 * same mature company as `mature-company`, seen by a sales rep who joined
 * last month.
 */

export const REFERENCE_TIME = '2026-10-16T10:00:00-05:00';

/** Knobs the CRM generator reads from `scenario.generators.crm`. */
export interface CrmGeneratorOptions {
  companies: number;
  dealsPerCompany: [number, number];
  /** Share of closed deals that were won (0..1). */
  winRate: number;
  /** Contacts created per company, inclusive range. Defaults to [1, 3]. */
  contactsPerCompany?: [number, number];
}

const growingTeam = defineScenario({
  id: 'growing-team',
  name: 'Growing team, day 30',
  description:
    'A 12-person startup one month into using the CRM: a healthy pipeline, recent activity and an owner who set everything up.',
  group: 'Lifecycle',
  seed: 4218,
  referenceTime: REFERENCE_TIME,
  organization: {
    id: 'org_0001',
    name: 'Northwind Labs',
    ageDays: 30,
    size: 12,
    subscription: 'pro',
  },
  actor: { id: 'user_0001', role: 'owner', joinedDaysAgo: 30, onboardingComplete: true },
  density: 'normal',
  activity: { level: 'normal' },
  generators: { crm: { companies: 18, dealsPerCompany: [1, 3], winRate: 0.55 } },
  tags: ['default'],
});

const matureCompany = defineScenario({
  id: 'mature-company',
  name: 'Mature company, year one',
  description:
    'A year of history: 60+ companies, hundreds of deals across every stage and a long activity trail. Good for density and performance.',
  group: 'Lifecycle',
  seed: 9001,
  referenceTime: REFERENCE_TIME,
  organization: {
    id: 'org_0001',
    name: 'Northwind Labs',
    ageDays: 365,
    size: 24,
    subscription: 'pro',
  },
  actor: { id: 'user_0001', role: 'owner', joinedDaysAgo: 365, onboardingComplete: true },
  density: 'dense',
  activity: { level: 'intense' },
  generators: { crm: { companies: 64, dealsPerCompany: [2, 6], winRate: 0.48 } },
});

export const scenarios: ScenarioInput[] = [
  defineScenario({
    id: 'new-company',
    name: 'Brand-new signup',
    description:
      'The owner just created the workspace: no companies, no deals, onboarding checklist not started.',
    group: 'Lifecycle',
    seed: 1,
    referenceTime: REFERENCE_TIME,
    organization: {
      id: 'org_0001',
      name: 'Northwind Labs',
      ageDays: 0,
      size: 1,
      subscription: 'trial',
    },
    actor: {
      id: 'user_0001',
      role: 'owner',
      joinedDaysAgo: 0,
      onboardingComplete: false,
      onboardingProgress: 0,
    },
    density: 'empty',
    activity: { level: 'none' },
    generators: { crm: { companies: 0, dealsPerCompany: [0, 0], winRate: 0 } },
  }),
  growingTeam,
  matureCompany,
  defineScenario({
    ...matureCompany,
    id: 'rep-view',
    name: 'Sales rep who joined last month',
    description:
      'The year-one company seen by Priya, a rep invited 28 days ago. She can work her own deals; others are read-only.',
    group: 'Roles',
    actor: { id: 'user_0003', role: 'rep', joinedDaysAgo: 28, onboardingComplete: true },
  }),
  defineScenario({
    ...growingTeam,
    id: 'viewer-view',
    name: 'Read-only viewer',
    description:
      'A finance stakeholder with view access: every create, edit and delete is blocked.',
    group: 'Roles',
    actor: { id: 'user_0004', role: 'viewer', joinedDaysAgo: 12, onboardingComplete: true },
  }),
  defineScenario({
    ...growingTeam,
    id: 'admin-view',
    name: 'Admin managing the team',
    description: 'An admin who can manage people and settings but not billing.',
    group: 'Roles',
    actor: { id: 'user_0002', role: 'admin', joinedDaysAgo: 30, onboardingComplete: true },
  }),
  defineScenario({
    ...growingTeam,
    id: 'trial-expired',
    name: 'Trial expired',
    description:
      'Same team, but the subscription lapsed: data is visible, new deals are paywalled.',
    group: 'Billing',
    organization: { ...growingTeam.organization, subscription: 'expired' },
  }),
  defineScenario({
    ...growingTeam,
    id: 'offline-mode',
    name: 'Offline / flaky network',
    description: 'Every save fails as if the network dropped — check the error states.',
    group: 'Conditions',
    environment: { network: 'offline' },
  }),
  defineScenario({
    ...matureCompany,
    id: 'enterprise-scale',
    name: 'Enterprise scale (15k+ records)',
    description:
      'A large sales org after 18 months: ~300 companies, ~900 contacts, ~3,000 deals and 10k+ activities. Loads in chunks with progress — use it to check lists, search and performance.',
    group: 'Scale',
    seed: 77_001,
    organization: {
      id: 'org_0001',
      name: 'Northwind Labs',
      ageDays: 540,
      size: 40,
      subscription: 'enterprise',
    },
    actor: { id: 'user_0001', role: 'owner', joinedDaysAgo: 540, onboardingComplete: true },
    density: 'massive',
    activity: { level: 'normal' },
    generators: {
      crm: { companies: 300, dealsPerCompany: [8, 12], winRate: 0.5, contactsPerCompany: [2, 4] },
    },
    tags: ['scale', 'performance'],
  }),
];
