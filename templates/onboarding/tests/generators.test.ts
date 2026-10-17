import { type WorldSeed } from '@protoyard/core';
import { validateWorld } from '@protoyard/scenarios';
import { describe, expect, it } from 'vitest';
import { contextFor as buildContext } from '../../../tests/support/generate-context.ts';
import type { Invitation, OnboardingState, Workspace } from '../src/database/schema.ts';
import { canVisit, missingRequired, progressOf, stepsForProgress } from '../src/domain/steps.ts';
import { slugify } from '../src/domain/validation.ts';
import { definition } from '../src/prototype.ts';
import { generateOnboardingWorld } from '../src/scenarios/generators.ts';

const contextFor = (id: string, seed?: number) => buildContext(definition.scenarios, id, seed);
const rows = <T>(world: WorldSeed, table: string) => (world.tables[table] ?? []) as unknown as T[];
const onboardingOf = (id: string) =>
  rows<OnboardingState>(generateOnboardingWorld(contextFor(id)), 'onboarding')[0];

describe('onboarding generator', () => {
  it('is deterministic and passes the integrity rules for every scenario', () => {
    for (const input of definition.scenarios) {
      const ctx = contextFor(input.id);
      const a = generateOnboardingWorld(ctx);
      expect(generateOnboardingWorld(contextFor(input.id))).toEqual(a);
      expect(
        validateWorld(a, { ...definition.integrity, referenceTime: ctx.scenario.referenceTime }),
        input.id
      ).toEqual([]);
      const membership = a.memberships.find((m) => m.personaId === ctx.scenario.actor.id);
      expect(membership?.role, input.id).toBe(ctx.scenario.actor.role);
      expect(rows<Workspace>(a, 'workspaces')).toHaveLength(1);
    }
  });

  it('derives the wizard position from scenario.actor.onboardingProgress', () => {
    expect(onboardingOf('not-started')).toBeUndefined();

    const half = onboardingOf('half-complete');
    expect(contextFor('half-complete').scenario.actor.onboardingProgress).toBe(0.5);
    expect(half?.completedSteps).toEqual(['profile', 'workspace']);
    expect(half?.currentStep).toBe('invite'); // step 3
    expect(half?.completedAt).toBeNull();

    const done = onboardingOf('completed');
    expect(done?.currentStep).toBe('done');
    expect(done?.completedAt).not.toBeNull();
    expect(done?.invites.length).toBeGreaterThan(0);

    const viewer = onboardingOf('viewer');
    expect(viewer?.personaId).toBe('user_0004');
    expect(viewer?.currentStep).toBe('workspace');
  });

  it('seeds invitations only once the invite step is done', () => {
    const completed = generateOnboardingWorld(contextFor('completed'));
    const half = generateOnboardingWorld(contextFor('half-complete'));
    expect(rows<Invitation>(completed, 'invitations').map((i) => i.email)).toEqual(
      onboardingOf('completed')?.invites.map((i) => i.email)
    );
    expect(rows(half, 'invitations')).toHaveLength(0);
    const fresh = generateOnboardingWorld(contextFor('not-started'));
    expect(fresh.personas).toHaveLength(1);
    expect(rows<Workspace>(fresh, 'workspaces')[0]).toMatchObject({
      teamSize: null,
      useCase: null,
    });
  });
});

describe('step logic', () => {
  it('maps progress to steps', () => {
    expect(stepsForProgress(0)).toEqual({ completed: [], current: 'profile' });
    expect(stepsForProgress(0.25)).toEqual({ completed: ['profile'], current: 'workspace' });
    expect(stepsForProgress(0.5).current).toBe('invite');
    expect(stepsForProgress(1)).toEqual({
      completed: ['profile', 'workspace', 'invite', 'preferences'],
      current: 'done',
    });
  });

  it('only lets people visit steps they have reached', () => {
    const state = {
      completedSteps: ['profile' as const],
      skippedSteps: [],
      currentStep: 'workspace' as const,
    };
    expect(canVisit(state, 'profile')).toBe(true);
    expect(canVisit(state, 'workspace')).toBe(true);
    expect(canVisit(state, 'invite')).toBe(false);
    expect(missingRequired(state)).toEqual(['workspace']);
    expect(progressOf({ ...state, completedAt: null })).toBe(0.2);
  });

  it('suggests URL handles', () => {
    expect(slugify('Acme Cloud!')).toBe('acme-cloud');
    expect(slugify('  Café   Ñandú  ')).toBe('cafe-nandu');
  });
});
