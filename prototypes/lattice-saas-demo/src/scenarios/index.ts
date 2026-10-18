import { saasFragments } from '@protoyard/saas';
import { composeScenario, PRESETS } from '@protoyard/scenarios';

const organization = { id: 'org_northstar', name: 'Northstar Studio', size: 6 };
const owner = { id: 'user_0001', role: 'owner' };
const finishedOwner = { ...owner, onboardingComplete: true, onboardingProgress: 1 };

export const scenarios = [
  composeScenario(
    PRESETS['first-week'],
    {
      id: 'signed-out',
      name: 'Signed-out visitor',
      description: 'A new team lead explores Lattice before starting a workspace.',
      seed: 83_001,
      referenceTime: '2026-10-18T09:00:00.000Z',
      organization: { ...organization, subscription: 'trial' },
      actor: { ...owner, onboardingComplete: false, onboardingProgress: 0 },
      tags: ['default', 'auth', 'signed-out'],
    },
    saasFragments.signedOut(),
    saasFragments.oauthLinked('google')
  ),
  composeScenario(
    PRESETS['first-week'],
    {
      id: 'mid-onboarding',
      name: 'Mid-onboarding workspace',
      description: 'An invited workspace owner is halfway through setting up the team.',
      seed: 83_002,
      referenceTime: '2026-10-18T10:00:00.000Z',
      organization,
      actor: { ...owner, onboardingComplete: false, onboardingProgress: 0.5 },
      tags: ['onboarding', 'workspace'],
    },
    saasFragments.oauthLinked('google')
  ),
  composeScenario(
    PRESETS['first-week'],
    {
      id: 'trial-ending',
      name: 'Trial ending in two days',
      description: 'An onboarded owner reviews plans before the two-day trial expires.',
      seed: 83_003,
      referenceTime: '2026-10-18T11:00:00.000Z',
      organization,
      actor: finishedOwner,
      tags: ['billing', 'trial'],
    },
    saasFragments.trialEnding(2)
  ),
  composeScenario(
    PRESETS['active-month'],
    {
      id: 'past-due',
      name: 'Past-due billing',
      description: 'An onboarded owner reviews a failed invoice and simulated billing portal.',
      seed: 83_004,
      referenceTime: '2026-10-18T12:00:00.000Z',
      organization,
      actor: finishedOwner,
      tags: ['billing', 'past-due'],
    },
    saasFragments.pastDue()
  ),
  composeScenario(
    PRESETS['active-month'],
    {
      id: 'multi-workspace-admin',
      name: 'Multi-workspace admin',
      description: 'An admin switches between three workspaces and manages a project portfolio.',
      seed: 83_005,
      referenceTime: '2026-10-18T13:00:00.000Z',
      organization,
      actor: { ...finishedOwner, role: 'admin' },
      tags: ['workspaces', 'admin'],
    },
    saasFragments.multiWorkspace(3)
  ),
  composeScenario(PRESETS['active-month'], {
    id: 'viewer',
    name: 'Read-only project viewer',
    description: 'A viewer can review the project portfolio without changing team data.',
    seed: 83_006,
    referenceTime: '2026-10-18T14:00:00.000Z',
    organization,
    actor: { id: 'user_0001', role: 'viewer', onboardingComplete: true, onboardingProgress: 1 },
    tags: ['role', 'viewer'],
  }),
  composeScenario(
    PRESETS['active-month'],
    {
      id: 'mfa-enrolled',
      name: 'MFA enrolled',
      description: 'An owner account has simulated multi-factor authentication enabled.',
      seed: 83_007,
      referenceTime: '2026-10-18T15:00:00.000Z',
      organization,
      actor: finishedOwner,
      tags: ['auth', 'mfa'],
    },
    saasFragments.mfaEnrolled()
  ),
  composeScenario(
    PRESETS['active-month'],
    {
      id: 'pending-invite',
      name: 'Pending teammate invite',
      description: 'An owner checks a workspace with a pending invitation and team activity.',
      seed: 83_008,
      referenceTime: '2026-10-18T16:00:00.000Z',
      organization,
      actor: finishedOwner,
      tags: ['team', 'invites'],
    },
    saasFragments.pendingInvite(1)
  ),
];
