import { parseScenario, type Scenario, type WorldSeed } from '@protoyard/core';
import { describe, expect, it } from 'vitest';
import {
  checkJourneyWorld,
  createGenerateContext,
  fragments,
  generateTeam,
  JOURNEY_ACTOR_ID,
  JOURNEY_ORGANIZATION_ID,
  journeyScenario,
  LIFE_STAGE_JOURNEYS,
  LIFE_STAGES,
  type LifeStage,
  lifeStageOf,
  lifeStageView,
  PRESET_IDS,
  PRESETS,
  presetScenario,
  resolveScenarios,
} from '../src/index.ts';

/** A world for a scenario, built only from the shared identity generator. */
function generate(scenario: Scenario): WorldSeed {
  const ctx = createGenerateContext(scenario);
  const { organizations, personas, memberships } = generateTeam(ctx);
  return { organizations, personas, memberships, tables: {} };
}

const clone = (seed: WorldSeed): WorldSeed => structuredClone(seed);

describe('life-stage journey presets', () => {
  it('declares the four stages in life order, each a valid preset in the registry', () => {
    expect(LIFE_STAGE_JOURNEYS.map((j) => j.stage)).toEqual([...LIFE_STAGES]);
    expect(LIFE_STAGES).toEqual(['signup', 'invited', 'first-week', 'established']);
    for (const journey of LIFE_STAGE_JOURNEYS) {
      expect(PRESET_IDS).toContain(journey.presetId);
      expect(() => parseScenario(PRESETS[journey.presetId])).not.toThrow();
      const scenario = journeyScenario(journey.stage);
      expect(presetScenario(journey.presetId)).toEqual(scenario);
      expect(scenario).toMatchObject({
        id: journey.presetId,
        group: 'Journeys',
        referenceTime: journey.time.referenceTime,
        organization: { ageDays: journey.time.organizationAgeDays },
        actor: {
          role: journey.persona.role,
          joinedDaysAgo: journey.time.actorTenureDays,
          onboardingComplete: journey.expect.actor.onboardingComplete,
        },
      });
      expect(scenario.tags).toEqual(expect.arrayContaining(['journey', journey.stage]));
      // Domain-free: no prototype knobs, only the shared axes.
      expect(Object.keys(scenario.generators).every((k) => k === 'series')).toBe(true);
    }
  });

  it('shares the seed, reference time, organization and actor across stages', () => {
    const scenarios = LIFE_STAGES.map((stage) => journeyScenario(stage));
    expect(new Set(scenarios.map((s) => s.seed)).size).toBe(1);
    expect(new Set(scenarios.map((s) => s.referenceTime)).size).toBe(1);
    for (const s of scenarios) {
      expect(s.organization.id).toBe(JOURNEY_ORGANIZATION_ID);
      expect(s.actor.id).toBe(JOURNEY_ACTOR_ID);
    }
    for (const stage of LIFE_STAGES) {
      const world = generate(journeyScenario(stage));
      expect(world.personas.some((p) => p.id === JOURNEY_ACTOR_ID)).toBe(true);
      expect(world.organizations.map((o) => o.id)).toEqual([JOURNEY_ORGANIZATION_ID]);
    }
  });

  it.each(LIFE_STAGES)(
    '%s produces the same world every time and passes its own checks',
    (stage) => {
      const scenario = journeyScenario(stage);
      const first = generate(scenario);
      const second = generate(journeyScenario(stage));
      expect(JSON.stringify(second)).toBe(JSON.stringify(first));
      expect(checkJourneyWorld(stage, first)).toEqual([]);
      const view = lifeStageView(first, JOURNEY_ACTOR_ID, scenario.referenceTime);
      expect(view && lifeStageOf(view)).toBe(stage);
    }
  );

  it('changes the world only when the seed changes', () => {
    const base = generate(journeyScenario('invited'));
    const reseeded = generate(journeyScenario('invited', { seed: 7 }));
    expect(JSON.stringify(reseeded)).not.toBe(JSON.stringify(base));
    // A reseeded world is still the same stage.
    expect(checkJourneyWorld('invited', reseeded)).toEqual([]);
  });

  it('keeps its promises when layered with other fragments', () => {
    const scenario = journeyScenario(
      'first-week',
      { id: 'first-week-pro' },
      fragments.subscription('pro'),
      fragments.network('slow', 200)
    );
    expect(scenario.organization.subscription).toBe('pro');
    expect(checkJourneyWorld('first-week', generate(scenario))).toEqual([]);
  });

  it('lets a prototype extend a stage by id (the runtime resolves with PRESETS)', () => {
    const [scenario] = resolveScenarios(
      [
        {
          id: 'team-joins',
          extends: 'journey-invited',
          name: 'New hire',
          generators: { inbox: 3 },
        },
      ],
      PRESETS
    );
    expect(scenario).toMatchObject({
      id: 'team-joins',
      name: 'New hire',
      actor: { role: 'member', joinedDaysAgo: 0, onboardingComplete: false },
      organization: { ageDays: 90, size: 6 },
      generators: { inbox: 3 },
    });
  });
});

describe('checkJourneyWorld', () => {
  const world = (stage: LifeStage) => generate(journeyScenario(stage));
  const checks = (stage: LifeStage, seed: WorldSeed) =>
    checkJourneyWorld(stage, seed).map((issue) => issue.check);

  it('reports integrity violations', () => {
    const broken = clone(world('established'));
    const member = broken.memberships[1];
    if (member) member.personaId = 'user_missing';
    const persona = broken.personas[2];
    if (persona) persona.joinedAt = '2030-01-01T00:00:00.000Z';
    const issues = checkJourneyWorld('established', broken);
    expect(issues.filter((i) => i.check === 'integrity').length).toBeGreaterThanOrEqual(2);
    expect(issues.map((i) => i.message).join('\n')).toMatch(/unknown persona "user_missing"/);
  });

  it('reports a missing actor, a wrong role and wrong onboarding', () => {
    const missing = clone(world('signup'));
    missing.personas = [];
    missing.memberships = [];
    expect(checks('signup', missing)).toEqual(['actor']);
    const wrong = clone(world('signup'));
    if (wrong.memberships[0]) wrong.memberships[0].role = 'viewer';
    if (wrong.personas[0]) wrong.personas[0].onboardingComplete = true;
    expect(checks('signup', wrong)).toEqual(['actor', 'actor', 'stage']);
  });

  it('reports a stage world checked as another stage', () => {
    const issues = checks('established', world('first-week'));
    expect(issues).toEqual(expect.arrayContaining(['actor', 'organization', 'people', 'stage']));
    expect(checks('signup', world('invited'))).toEqual(
      expect.arrayContaining(['actor', 'people', 'organization', 'stage'])
    );
  });

  it('requires an existing team for the invited stage', () => {
    const alone = clone(world('invited'));
    const actorJoined = alone.memberships.find((m) => m.personaId === JOURNEY_ACTOR_ID)?.joinedAt;
    for (const m of alone.memberships) if (actorJoined) m.joinedAt = actorJoined;
    for (const p of alone.personas) if (actorJoined) p.joinedAt = actorJoined;
    expect(checks('invited', alone)).toContain('existing-team');
  });
});

describe('lifeStageOf', () => {
  const view = (
    actorTenureDays: number,
    organizationAgeDays: number,
    onboardingComplete: boolean
  ) => lifeStageOf({ actorTenureDays, organizationAgeDays, onboardingComplete });

  it('derives the stage from tenure, organization age and onboarding only', () => {
    expect(view(0, 0, false)).toBe('signup');
    expect(view(6, 6, false)).toBe('signup');
    expect(view(0, 0, true)).toBe('first-week');
    expect(view(0, 7, false)).toBe('invited');
    expect(view(6, 13, true)).toBe('invited');
    expect(view(0, 6, false)).toBe('signup');
    expect(view(7, 7, false)).toBe('first-week');
    expect(view(29, 400, true)).toBe('first-week');
    expect(view(30, 30, true)).toBe('established');
  });

  it('tolerates fractional, negative and inconsistent input', () => {
    expect(view(6.9, 6.9, false)).toBe('signup');
    expect(view(-3, -10, false)).toBe('signup');
    // An organization can never be younger than the actor's tenure.
    expect(view(40, 10, true)).toBe('established');
  });

  it('returns null for a world without the actor', () => {
    const seed = generate(journeyScenario('signup'));
    expect(lifeStageView(seed, 'user_nobody', journeyScenario('signup').referenceTime)).toBeNull();
    expect(lifeStageView(seed, JOURNEY_ACTOR_ID, 'not a date')).toBeNull();
  });
});
