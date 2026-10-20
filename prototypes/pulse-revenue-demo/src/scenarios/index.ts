import type { ScenarioInput } from '@protoyard/core';
import { presetScenario } from '@protoyard/scenarios/presets';

const REFERENCE_TIME = '2026-10-16T09:00:00.000Z';
const organization = { id: 'org_0001', name: 'Pulse Revenue Labs', size: 8 };

export const scenarios: ScenarioInput[] = [
  presetScenario(
    'brand-new-signup',
    {},
    {
      id: 'empty',
      name: 'No transactions yet',
      description: 'A new Pulse Revenue workspace before its first recorded transaction.',
      seed: 129_001,
      referenceTime: REFERENCE_TIME,
      organization: { ...organization, ageDays: 12, subscription: 'trial' },
      actor: { id: 'user_0001', role: 'owner', onboardingComplete: true },
    }
  ),
  presetScenario(
    'quarter-of-history',
    {},
    {
      id: 'quarter-of-history',
      name: 'Quarter of history',
      description: 'Ninety days of rising fictional revenue with a weekly business rhythm.',
      seed: 129_002,
      referenceTime: REFERENCE_TIME,
      organization: { ...organization, ageDays: 90, subscription: 'pro' },
      actor: { id: 'user_0001', role: 'owner' },
      tags: ['default'],
    }
  ),
  presetScenario(
    'launch-spike',
    {},
    {
      id: 'launch-spike',
      name: 'Launch spike',
      description: 'A recent product launch creates a visible surge in transactions and revenue.',
      seed: 129_003,
      referenceTime: REFERENCE_TIME,
      organization: { ...organization, ageDays: 45, subscription: 'pro' },
      actor: { id: 'user_0002', role: 'admin' },
    }
  ),
  presetScenario(
    'quarter-of-history',
    {},
    {
      id: 'viewer',
      name: 'Read-only viewer',
      description: 'The quarter of revenue history viewed without export or record editing.',
      seed: 129_002,
      referenceTime: REFERENCE_TIME,
      organization: { ...organization, ageDays: 90, subscription: 'pro' },
      actor: { id: 'user_0004', role: 'viewer', joinedDaysAgo: 14 },
    }
  ),
];
