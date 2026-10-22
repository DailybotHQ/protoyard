import { MS_PER_DAY, type Scenario, type WorldSeed } from '@protoyard/core';
import { composeScenario, deepMerge, type ScenarioFragment } from './compose.ts';
import { type IntegrityViolation, validateWorld } from './integrity.ts';
import { fragments, PRESET_REFERENCE_TIME, PRESET_SEED } from './presets-base.ts';

/**
 * Life-stage journeys: the same product seen at four moments of one account's
 * life — just signed up, invited into an existing team, the first week, and
 * established use. Each stage is a scenario preset built from the shared
 * fragments, plus what it promises: the persona it signs in as, its simulated
 * time and the world it expects. Prototypes extend a stage by id
 * (`extends: 'journey-invited'`) and keep their own domain data.
 *
 * Every stage shares the seed, reference time, organization id and actor id,
 * so links, tests and screens that name the actor survive a stage switch.
 * `lifeStageOf` derives the stage from data only (tenure, organization age,
 * onboarding), so a reload or a scenario switch lands on the same stage.
 */

export const LIFE_STAGES = ['signup', 'invited', 'first-week', 'established'] as const;
export type LifeStage = (typeof LIFE_STAGES)[number];

/** Tenure thresholds, in days, that separate the stages. */
export const LIFE_STAGE_DAYS = { firstWeek: 7, established: 30 } as const;

/** Shared by every stage, so ids stay stable when switching stages. */
export const JOURNEY_ORGANIZATION_ID = 'org_0001';
export const JOURNEY_ACTOR_ID = 'user_0001';

/** What a generated world must look like for a stage (checked by `checkJourneyWorld`). */
export interface JourneyExpectations {
  /** People in the organization, the actor included. */
  people: { min: number; max: number };
  actor: { role: string; tenureDays: number; onboardingComplete: boolean };
  organizationAgeDays: number;
  /** At least this many other people joined before the actor (an existing team). */
  joinedBeforeActor: number;
}

export interface LifeStageJourney {
  stage: LifeStage;
  /** The preset id (`journey-<stage>`). */
  presetId: `journey-${LifeStage}`;
  name: string;
  description: string;
  /** Who the session starts as. */
  persona: { role: string; summary: string };
  /** Simulated time: how old the account is and how long the actor has been in it. */
  time: { referenceTime: string; organizationAgeDays: number; actorTenureDays: number };
  /** The scenario preset (valid on its own; `journeyScenario` validates it). */
  scenario: ScenarioFragment;
  expect: JourneyExpectations;
}

function journey(
  stage: LifeStage,
  name: string,
  description: string,
  persona: LifeStageJourney['persona'],
  expect: JourneyExpectations,
  ...parts: ScenarioFragment[]
): LifeStageJourney {
  const presetId = `journey-${stage}` as const;
  const scenario = deepMerge<ScenarioFragment>(
    {},
    {
      id: presetId,
      name,
      group: 'Journeys',
      description,
      seed: PRESET_SEED,
      referenceTime: PRESET_REFERENCE_TIME,
      organization: { id: JOURNEY_ORGANIZATION_ID },
      actor: { id: JOURNEY_ACTOR_ID, role: expect.actor.role },
    },
    fragments.organizationSize(expect.people.min),
    fragments.organizationAge(expect.organizationAgeDays),
    fragments.tenure(expect.actor.tenureDays),
    fragments.onboarding(expect.actor.onboardingComplete ? 1 : 0),
    ...parts,
    fragments.tags('journey', stage)
  );
  return {
    stage,
    presetId,
    name,
    description,
    persona,
    time: {
      referenceTime: PRESET_REFERENCE_TIME,
      organizationAgeDays: expect.organizationAgeDays,
      actorTenureDays: expect.actor.tenureDays,
    },
    scenario,
    expect,
  };
}

/** The four stages, in life order. */
export const LIFE_STAGE_JOURNEYS: readonly LifeStageJourney[] = [
  journey(
    'signup',
    'Journey: just signed up',
    'The account was created a minute ago: one person, an empty workspace, onboarding not started.',
    { role: 'owner', summary: 'The person who just registered and owns the new workspace.' },
    {
      people: { min: 1, max: 1 },
      actor: { role: 'owner', tenureDays: 0, onboardingComplete: false },
      organizationAgeDays: 0,
      joinedBeforeActor: 0,
    },
    fragments.density('empty'),
    fragments.activity('none')
  ),
  journey(
    'invited',
    'Journey: invited to a team',
    'Accepted an invitation today into a team that has worked here for three months.',
    { role: 'member', summary: 'A new member who has not finished onboarding yet.' },
    {
      people: { min: 6, max: 6 },
      actor: { role: 'member', tenureDays: 0, onboardingComplete: false },
      organizationAgeDays: 90,
      joinedBeforeActor: 1,
    },
    fragments.density('normal'),
    fragments.activity('normal')
  ),
  journey(
    'first-week',
    'Journey: first week',
    'Seven days after signing up: onboarding done, a small team, the first real records.',
    { role: 'owner', summary: 'The owner, a week in, still learning the product.' },
    {
      people: { min: 3, max: 3 },
      actor: { role: 'owner', tenureDays: 7, onboardingComplete: true },
      organizationAgeDays: 7,
      joinedBeforeActor: 0,
    },
    fragments.history(7),
    fragments.density('sparse'),
    fragments.activity('normal')
  ),
  journey(
    'established',
    'Journey: established team',
    'Three months of regular use by a team of eight, with a weekly rhythm in its history.',
    { role: 'owner', summary: 'The owner of a team that uses the product every week.' },
    {
      people: { min: 8, max: 8 },
      actor: { role: 'owner', tenureDays: 90, onboardingComplete: true },
      organizationAgeDays: 90,
      joinedBeforeActor: 0,
    },
    fragments.history(90),
    fragments.seasonality('weekly'),
    fragments.density('normal'),
    fragments.activity('normal')
  ),
];

/** The journey presets by id, ready to merge into the preset registry. */
export const JOURNEY_PRESETS: Readonly<Record<`journey-${LifeStage}`, ScenarioFragment>> =
  Object.fromEntries(LIFE_STAGE_JOURNEYS.map((j) => [j.presetId, j.scenario])) as Record<
    `journey-${LifeStage}`,
    ScenarioFragment
  >;

export function lifeStageJourney(stage: LifeStage): LifeStageJourney {
  return LIFE_STAGE_JOURNEYS.find((j) => j.stage === stage) as LifeStageJourney;
}

/** A stage as a validated scenario, optionally layered with overrides. */
export function journeyScenario(stage: LifeStage, ...overrides: ScenarioFragment[]): Scenario {
  return composeScenario(lifeStageJourney(stage).scenario, ...overrides);
}

/* ---------- deriving the stage from data ---------- */

/** What `lifeStageOf` reads: whole days, rounded down. */
export interface LifeStageView {
  actorTenureDays: number;
  organizationAgeDays: number;
  onboardingComplete: boolean;
}

/**
 * The stage a view is in, from data only:
 * - joined less than a week ago into an organization at least a week older → `invited`;
 * - otherwise in the first week without finished onboarding → `signup`;
 * - in the first month → `first-week`;
 * - after that → `established`.
 */
export function lifeStageOf(view: LifeStageView): LifeStage {
  const tenure = Math.max(0, Math.floor(view.actorTenureDays));
  const age = Math.max(tenure, Math.floor(view.organizationAgeDays));
  if (tenure < LIFE_STAGE_DAYS.firstWeek && age - tenure >= LIFE_STAGE_DAYS.firstWeek) {
    return 'invited';
  }
  if (tenure < LIFE_STAGE_DAYS.firstWeek && !view.onboardingComplete) return 'signup';
  if (tenure < LIFE_STAGE_DAYS.established) return 'first-week';
  return 'established';
}

const wholeDays = (fromIso: string, toMs: number) =>
  Math.floor((toMs - Date.parse(fromIso)) / MS_PER_DAY);

/**
 * Reads the view from a world: the actor's persona and membership, and the
 * organization they belong to. Null when the actor or organization is missing.
 */
export function lifeStageView(
  seed: WorldSeed,
  actorId: string,
  referenceTime: string
): LifeStageView | null {
  const nowMs = Date.parse(referenceTime);
  const actor = seed.personas.find((p) => p.id === actorId);
  const membership = seed.memberships.find((m) => m.personaId === actorId);
  const organization = seed.organizations.find((o) => o.id === membership?.organizationId);
  if (!actor || !membership || !organization || Number.isNaN(nowMs)) return null;
  return {
    actorTenureDays: wholeDays(membership.joinedAt, nowMs),
    organizationAgeDays: wholeDays(organization.createdAt, nowMs),
    onboardingComplete: actor.onboardingComplete,
  };
}

/* ---------- checking a generated world ---------- */

export interface JourneyIssue {
  check: 'integrity' | 'actor' | 'people' | 'organization' | 'existing-team' | 'stage';
  message: string;
}

/**
 * Checks a world generated for a stage against what the stage declares: zero
 * integrity violations (`validateWorld` at the stage's reference time, plus
 * any prototype rules), the actor with the declared role, tenure and
 * onboarding, the people count, the organization age, an existing team for
 * `invited`, and `lifeStageOf` agreeing with the stage. An empty list passes.
 */
export function checkJourneyWorld(
  stage: LifeStage,
  seed: WorldSeed,
  options: {
    referenceTime?: string;
    actorId?: string;
    integrity?: Parameters<typeof validateWorld>[1];
  } = {}
): JourneyIssue[] {
  const journey = lifeStageJourney(stage);
  const referenceTime = options.referenceTime ?? journey.time.referenceTime;
  const actorId = options.actorId ?? JOURNEY_ACTOR_ID;
  const issues: JourneyIssue[] = [];
  const violations: IntegrityViolation[] = validateWorld(seed, {
    ...options.integrity,
    referenceTime,
  });
  for (const v of violations) {
    issues.push({
      check: 'integrity',
      message: `${v.table}#${v.rowId}${v.field ? `.${v.field}` : ''}: ${v.message}`,
    });
  }

  const actor = seed.personas.find((p) => p.id === actorId);
  const membership = seed.memberships.find((m) => m.personaId === actorId);
  if (!actor || !membership) {
    issues.push({ check: 'actor', message: `The actor "${actorId}" has no persona or membership` });
    return issues;
  }
  const { expect: want } = journey;
  if (membership.role !== want.actor.role) {
    issues.push({
      check: 'actor',
      message: `The actor's role is "${membership.role}", expected "${want.actor.role}"`,
    });
  }
  if (actor.onboardingComplete !== want.actor.onboardingComplete) {
    issues.push({
      check: 'actor',
      message: `The actor's onboarding is ${actor.onboardingComplete ? 'complete' : 'incomplete'}, expected ${want.actor.onboardingComplete ? 'complete' : 'incomplete'}`,
    });
  }
  const view = lifeStageView(seed, actorId, referenceTime);
  if (!view) {
    issues.push({ check: 'organization', message: "The actor's organization is missing" });
    return issues;
  }
  if (view.actorTenureDays !== want.actor.tenureDays) {
    issues.push({
      check: 'actor',
      message: `The actor joined ${view.actorTenureDays} days ago, expected ${want.actor.tenureDays}`,
    });
  }
  if (view.organizationAgeDays !== want.organizationAgeDays) {
    issues.push({
      check: 'organization',
      message: `The organization is ${view.organizationAgeDays} days old, expected ${want.organizationAgeDays}`,
    });
  }
  const members = seed.memberships.filter((m) => m.organizationId === membership.organizationId);
  if (members.length < want.people.min || members.length > want.people.max) {
    issues.push({
      check: 'people',
      message: `The organization has ${members.length} people, expected ${want.people.min === want.people.max ? want.people.min : `${want.people.min}-${want.people.max}`}`,
    });
  }
  const actorJoined = Date.parse(membership.joinedAt);
  const earlier = members.filter(
    (m) => m.personaId !== actorId && Date.parse(m.joinedAt) < actorJoined
  ).length;
  if (earlier < want.joinedBeforeActor) {
    issues.push({
      check: 'existing-team',
      message: `${earlier} people joined before the actor, expected at least ${want.joinedBeforeActor}`,
    });
  }
  const derived = lifeStageOf(view);
  if (derived !== stage) {
    issues.push({ check: 'stage', message: `The world reads as "${derived}", not "${stage}"` });
  }
  return issues;
}
