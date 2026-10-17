import type {
  ActivityLevel,
  DataDensity,
  NetworkMode,
  SubscriptionStatus,
  ViewportPreset,
} from '@protoyard/core';
import { composeScenario, deepMerge, type ScenarioFragment } from './compose.ts';

/**
 * Reusable, domain-free scenario building blocks. Fragments describe ONE axis
 * (tenure, role, billing, network…); full presets combine them into the
 * situations product teams ask for most. Prototypes extend presets by id
 * (`extends: 'first-week'`) or compose them in code.
 *
 * Presets carry a fixed seed and reference time so they are valid on their
 * own; a prototype normally overrides both.
 */

export const PRESET_REFERENCE_TIME = '2026-03-02T09:00:00.000Z';
export const PRESET_SEED = 20_260_302;

/** Single-axis fragments. Combine with `composeScenario(base, ...fragments)`. */
export const fragments = {
  density: (density: DataDensity): ScenarioFragment => ({ density }),
  activity: (level: ActivityLevel): ScenarioFragment => ({ activity: { level } }),
  role: (role: string): ScenarioFragment => ({ actor: { role } }),
  /** Actor tenure, independent from organization age. */
  tenure: (joinedDaysAgo: number): ScenarioFragment => ({ actor: { joinedDaysAgo } }),
  organizationAge: (ageDays: number): ScenarioFragment => ({ organization: { ageDays } }),
  organizationSize: (size: number): ScenarioFragment => ({ organization: { size } }),
  /** Account age: organization created and actor joined `days` ago. */
  accountAge: (days: number): ScenarioFragment => ({
    organization: { ageDays: days },
    actor: { joinedDaysAgo: days },
  }),
  onboarding: (progress: number): ScenarioFragment => ({
    actor: { onboardingComplete: progress >= 1, onboardingProgress: progress },
  }),
  subscription: (subscription: SubscriptionStatus): ScenarioFragment => ({
    organization: { subscription },
  }),
  network: (network: NetworkMode, latencyMs = 0): ScenarioFragment => ({
    environment: { network, latencyMs },
  }),
  featureFlags: (flags: Record<string, boolean>): ScenarioFragment => ({
    organization: { featureFlags: flags },
  }),
  appearance: (appearance: {
    themeId?: string;
    mode?: 'light' | 'dark' | 'system';
    reducedMotion?: boolean;
    viewport?: ViewportPreset;
  }): ScenarioFragment => ({ appearance }),
  tags: (...tags: string[]): ScenarioFragment => ({ tags }),
} as const;

const base: ScenarioFragment = {
  seed: PRESET_SEED,
  referenceTime: PRESET_REFERENCE_TIME,
};

function preset(
  id: string,
  name: string,
  group: string,
  description: string,
  ...parts: ScenarioFragment[]
): ScenarioFragment {
  return deepMerge({}, base, { id, name, group, description }, ...parts);
}

/** Full presets by id. Every entry validates with `ScenarioSchema` (tested). */
export const PRESETS = {
  'brand-new-signup': preset(
    'brand-new-signup',
    'Brand-new signup',
    'Lifecycle',
    'Signed up a minute ago: empty workspace, onboarding not started.',
    fragments.accountAge(0),
    fragments.onboarding(0),
    fragments.density('empty'),
    fragments.activity('none'),
    fragments.tags('lifecycle', 'empty-state')
  ),
  'onboarding-in-progress': preset(
    'onboarding-in-progress',
    'Onboarding halfway',
    'Lifecycle',
    'Started onboarding yesterday and stopped halfway through.',
    fragments.accountAge(1),
    fragments.onboarding(0.5),
    fragments.density('sparse'),
    fragments.activity('low'),
    fragments.tags('lifecycle', 'onboarding')
  ),
  'first-week': preset(
    'first-week',
    'First week',
    'Lifecycle',
    'Seven days in: a few records, still learning the product.',
    fragments.accountAge(7),
    fragments.organizationSize(3),
    fragments.density('sparse'),
    fragments.activity('normal'),
    fragments.tags('lifecycle')
  ),
  'active-month': preset(
    'active-month',
    'Day-30 active user',
    'Lifecycle',
    'A month of regular use by a small team.',
    fragments.accountAge(30),
    fragments.organizationSize(5),
    fragments.density('normal'),
    fragments.activity('normal'),
    fragments.tags('lifecycle')
  ),
  'six-month-new-member': preset(
    'six-month-new-member',
    'New member in a 6-month-old team',
    'Lifecycle',
    'The organization has six months of history; the actor was invited today.',
    fragments.organizationAge(180),
    fragments.organizationSize(12),
    fragments.tenure(0),
    fragments.role('member'),
    fragments.onboarding(0),
    fragments.density('normal'),
    fragments.activity('normal'),
    fragments.tags('lifecycle', 'invited')
  ),
  'power-user-year-one': preset(
    'power-user-year-one',
    'Year-one power user',
    'Lifecycle',
    'A year of intense daily use: lots of data and history.',
    fragments.accountAge(365),
    fragments.organizationSize(20),
    fragments.density('dense'),
    fragments.activity('intense'),
    fragments.tags('lifecycle', 'power-user')
  ),
  'dormant-account': preset(
    'dormant-account',
    'Dormant account',
    'Lifecycle',
    'Active once, untouched for months: stale data everywhere.',
    fragments.accountAge(240),
    fragments.organizationSize(4),
    fragments.density('sparse'),
    fragments.activity('dormant'),
    fragments.tags('lifecycle', 'stale')
  ),
  'read-only-viewer': preset(
    'read-only-viewer',
    'Read-only viewer',
    'Roles',
    'Can see everything, change nothing.',
    fragments.organizationAge(60),
    fragments.tenure(14),
    fragments.organizationSize(8),
    fragments.role('viewer'),
    fragments.tags('roles')
  ),
  'workspace-admin': preset(
    'workspace-admin',
    'Workspace admin',
    'Roles',
    'Manages people and settings, but not billing.',
    fragments.organizationAge(90),
    fragments.tenure(60),
    fragments.organizationSize(8),
    fragments.role('admin'),
    fragments.tags('roles')
  ),
  'workspace-owner': preset(
    'workspace-owner',
    'Workspace owner',
    'Roles',
    'Created the workspace and can do everything, including billing.',
    fragments.accountAge(90),
    fragments.organizationSize(8),
    fragments.role('owner'),
    fragments.tags('roles')
  ),
  'subscription-free': preset(
    'subscription-free',
    'Free plan',
    'Billing',
    'On the free plan: paid features are locked.',
    fragments.accountAge(30),
    fragments.subscription('free'),
    fragments.tags('billing')
  ),
  'subscription-pro': preset(
    'subscription-pro',
    'Pro plan',
    'Billing',
    'Paying customer with every paid feature unlocked.',
    fragments.accountAge(30),
    fragments.subscription('pro'),
    fragments.tags('billing')
  ),
  'subscription-expired': preset(
    'subscription-expired',
    'Expired subscription',
    'Billing',
    'The paid plan lapsed: data is still there, upgrades are prompted.',
    fragments.accountAge(400),
    fragments.subscription('expired'),
    fragments.activity('low'),
    fragments.tags('billing')
  ),
  offline: preset(
    'offline',
    'Offline',
    'Conditions',
    'No connection: services routed through the environment fail with an offline error.',
    fragments.accountAge(30),
    fragments.network('offline'),
    fragments.tags('conditions', 'network')
  ),
  'slow-network': preset(
    'slow-network',
    'Slow network',
    'Conditions',
    'Every simulated request takes noticeably longer.',
    fragments.accountAge(30),
    fragments.network('slow', 400),
    fragments.tags('conditions', 'network')
  ),
  'large-organization': preset(
    'large-organization',
    'Large organization',
    'Scale',
    'A 250-person organization with massive data volume.',
    fragments.accountAge(400),
    fragments.organizationSize(250),
    fragments.density('massive'),
    fragments.activity('intense'),
    fragments.subscription('enterprise'),
    fragments.tags('scale')
  ),
} as const satisfies Record<string, ScenarioFragment>;

export type PresetId = keyof typeof PRESETS;

export const PRESET_IDS = Object.keys(PRESETS) as PresetId[];

/** A preset as a validated scenario, optionally layered with overrides. */
export function presetScenario(id: PresetId, ...overrides: ScenarioFragment[]) {
  return composeScenario(PRESETS[id], ...overrides);
}

export { composeScenario, type ScenarioFragment } from './compose.ts';
