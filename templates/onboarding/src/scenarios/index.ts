import type { ScenarioInput } from '@protoyard/core';
import { fragments, presetScenario } from '@protoyard/scenarios/presets';

/**
 * Scenarios are versioned, seeded worlds built from the shared presets in
 * @protoyard/scenarios. The wizard position is DERIVED from
 * `actor.onboardingProgress` (0..1) by the generator: 0.5 → two of the four
 * answer steps done, so the person resumes at step 3. Add a scenario by
 * appending an entry here AND listing its id in protoyard.json → "scenarios".
 */

export const REFERENCE_TIME = '2026-10-16T09:00:00.000Z';

const organization = { id: 'org_0001', name: 'Acme Cloud', size: 4 };

export const scenarios: ScenarioInput[] = [
  presetScenario('brand-new-signup', {
    id: 'not-started',
    name: 'Not started',
    description: 'The owner signed up a minute ago and lands on step 1 of the wizard.',
    seed: 11,
    referenceTime: REFERENCE_TIME,
    organization,
    actor: { id: 'user_0001', role: 'owner' },
  }),
  presetScenario('onboarding-in-progress', {
    id: 'half-complete',
    name: 'Half complete',
    description:
      'Profile and workspace are done (progress 0.5); the owner resumes at step 3, Invite teammates.',
    seed: 22,
    referenceTime: REFERENCE_TIME,
    organization,
    actor: { id: 'user_0001', role: 'owner' },
    tags: ['default'],
  }),
  presetScenario('first-week', fragments.onboarding(1), {
    id: 'completed',
    name: 'Completed',
    description:
      'Onboarding finished a week ago: shows the post-onboarding home with the summary and pending invitations.',
    seed: 33,
    referenceTime: REFERENCE_TIME,
    organization,
    actor: { id: 'user_0001', role: 'owner' },
  }),
  presetScenario('read-only-viewer', fragments.onboarding(0.25), {
    id: 'viewer',
    name: 'Viewer joins',
    description:
      'A viewer invited to an existing workspace. Their wizard is at the Workspace step, which they can review but not change; inviting is blocked.',
    seed: 44,
    referenceTime: REFERENCE_TIME,
    organization,
    actor: { id: 'user_0004', role: 'viewer', joinedDaysAgo: 0 },
  }),
];
