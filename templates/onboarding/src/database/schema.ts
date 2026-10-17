import type { DatabaseDefinition } from '@protoyard/core';
import type { Dexie, EntityTable } from 'dexie';

/**
 * Domain tables in Dexie store syntax: the first key is the primary key, the
 * rest are indexes. To add a table, add a NEW version (never edit an old
 * one), bump `storage.schemaVersion` in protoyard.json, and add the typed
 * table to `OnboardingDatabase` below.
 *
 * - `onboarding`: one row per persona — where they are in the wizard and
 *   every answer given so far. Written after EVERY step, so a reload resumes
 *   exactly where the person left off.
 * - `workspaces`: one row per organization, configured in the Workspace step.
 * - `invitations`: real rows created by the Invite step.
 *
 * Rows are type aliases (not interfaces) so they stay assignable to `Row`.
 */

/** Wizard order. Add a step here, in `STEP_DETAILS`, and as a component in src/steps/. */
export const STEP_IDS = ['profile', 'workspace', 'invite', 'preferences', 'done'] as const;
export type StepId = (typeof STEP_IDS)[number];

/** Steps that collect answers (everything except the final summary). */
export const ACTIONABLE_STEPS = STEP_IDS.filter((s) => s !== 'done') as Exclude<StepId, 'done'>[];

export const OPTIONAL_STEPS: readonly StepId[] = ['invite', 'preferences'];

export const DEPARTMENTS = [
  'Engineering',
  'Design',
  'Product',
  'Marketing',
  'Sales',
  'Operations',
  'Other',
] as const;

export const TIMEZONES = [
  'America/Los_Angeles',
  'America/New_York',
  'America/Bogota',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Madrid',
  'Europe/Berlin',
  'Asia/Kolkata',
  'Asia/Tokyo',
  'Australia/Sydney',
  'UTC',
] as const;

export const TEAM_SIZES = ['1', '2-10', '11-50', '51-200', '201+'] as const;
export type TeamSize = (typeof TEAM_SIZES)[number];

export const USE_CASES = ['projects', 'support', 'sales', 'internal', 'other'] as const;
export type UseCase = (typeof USE_CASES)[number];

export const INVITE_ROLES = ['admin', 'member', 'viewer'] as const;
export type InviteRole = (typeof INVITE_ROLES)[number];

export const DIGESTS = ['daily', 'weekly', 'never'] as const;
export type Digest = (typeof DIGESTS)[number];

export const COLOR_MODES = ['system', 'light', 'dark'] as const;
export type ColorModeChoice = (typeof COLOR_MODES)[number];

export type ProfileAnswers = {
  fullName: string;
  jobTitle: string;
  department: (typeof DEPARTMENTS)[number];
  timezone: string;
};

export type InviteAnswer = { email: string; role: InviteRole };

export type PreferenceAnswers = {
  mode: ColorModeChoice;
  digest: Digest;
  productUpdates: boolean;
  mentions: boolean;
};

export type OnboardingState = {
  /** Same as `personaId`: one onboarding per person. */
  id: string;
  personaId: string;
  currentStep: StepId;
  completedSteps: StepId[];
  skippedSteps: StepId[];
  profile: ProfileAnswers | null;
  invites: InviteAnswer[];
  preferences: PreferenceAnswers | null;
  startedAt: string | null;
  updatedAt: string;
  completedAt: string | null;
};

export type Workspace = {
  /** Organization id (`py_organizations`). */
  id: string;
  name: string;
  /** URL handle: `app.example.com/<slug>`. */
  slug: string;
  teamSize: TeamSize | null;
  useCase: UseCase | null;
  updatedAt: string;
  updatedBy: string;
};

export type Invitation = {
  id: string;
  email: string;
  role: InviteRole;
  /** Persona id (`py_personas`). */
  invitedBy: string;
  status: 'pending' | 'revoked';
  createdAt: string;
};

export type OnboardingDatabase = Dexie & {
  onboarding: EntityTable<OnboardingState, 'id'>;
  workspaces: EntityTable<Workspace, 'id'>;
  invitations: EntityTable<Invitation, 'id'>;
};

export const database: DatabaseDefinition = {
  versions: [
    {
      version: 1,
      stores: {
        onboarding: 'id, personaId, currentStep, completedAt',
        workspaces: 'id, slug',
        invitations: 'id, email, invitedBy, status, createdAt',
      },
    },
  ],
};
