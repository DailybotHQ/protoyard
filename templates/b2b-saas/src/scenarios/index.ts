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
      description: 'A new owner starts signed out and can try the simulated Google SSO flow.',
      seed: 83_001,
      referenceTime: '2026-10-18T09:00:00.000Z',
      organization: { ...organization, subscription: 'trial' },
      actor: { ...owner, onboardingComplete: false, onboardingProgress: 0 },
      tags: ['default', 'signed-out'],
    },
    saasFragments.signedOut(),
    saasFragments.oauthLinked('google')
  ),
  composeScenario(
    PRESETS['active-month'],
    {
      id: 'active',
      name: 'Active workspace',
      description: 'An onboarded owner with multiple workspaces and active projects.',
      seed: 83_002,
      referenceTime: '2026-10-18T14:00:00.000Z',
      organization,
      actor: finishedOwner,
      tags: ['workspaces'],
    },
    saasFragments.multiWorkspace(2)
  ),
  composeScenario(
    PRESETS['first-week'],
    {
      id: 'trial-ending',
      name: 'Trial ending soon',
      description: 'An onboarded owner sees a three-day trial reminder and billing options.',
      seed: 83_003,
      referenceTime: '2026-10-18T11:00:00.000Z',
      organization,
      actor: finishedOwner,
    },
    saasFragments.trialEnding(3)
  ),
  composeScenario(
    PRESETS['active-month'],
    {
      id: 'past-due',
      name: 'Past-due billing',
      description: 'An onboarded owner explores a failed invoice and plan portal.',
      seed: 83_004,
      referenceTime: '2026-10-18T12:00:00.000Z',
      organization,
      actor: finishedOwner,
    },
    saasFragments.pastDue()
  ),
  composeScenario(
    PRESETS['active-month'],
    {
      id: 'pending-invites',
      name: 'Pending invitations',
      description: 'A team owner reviews two invitations in the workspace and inbox.',
      seed: 83_005,
      referenceTime: '2026-10-18T13:00:00.000Z',
      organization,
      actor: finishedOwner,
    },
    saasFragments.pendingInvite(2)
  ),
  composeScenario(
    PRESETS['active-month'],
    {
      id: 'mfa-enrolled',
      name: 'MFA enrolled',
      description: 'An owner account has simulated MFA enabled for sign-in walkthroughs.',
      seed: 83_006,
      referenceTime: '2026-10-18T15:00:00.000Z',
      organization,
      actor: finishedOwner,
    },
    saasFragments.mfaEnrolled()
  ),
];
