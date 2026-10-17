import { createRuntimeId, type PrototypeRuntime } from '@protoyard/core';
import type {
  Invitation,
  OnboardingDatabase,
  OnboardingState,
  StepId,
  Workspace,
} from '../database/schema.ts';
import { CAPABILITIES } from './policy.ts';
import { canVisit, isOptional, missingRequired, nextStep, STEP_DETAILS } from './steps.ts';
import {
  type InvitesInput,
  InvitesSchema,
  type PreferencesInput,
  PreferencesSchema,
  type ProfileInput,
  ProfileSchema,
  parse,
  ValidationError,
  type WorkspaceInput,
  WorkspaceSchema,
} from './validation.ts';

/**
 * Domain services: the ONLY way screens change data. Each mutation
 *   1. checks the simulated policy (`session.assert`) — enforced even if the UI is bypassed,
 *   2. validates input with zod (field errors come back as `ValidationError.issues`),
 *   3. runs through the simulated environment (latency / offline / failures),
 *   4. writes the answer AND the new wizard position in ONE Dexie transaction,
 *      so a reload always resumes exactly where the person left off.
 */

/** The state of someone who has not touched onboarding yet (not persisted until they act). */
export function freshState(personaId: string, at: string): OnboardingState {
  return {
    id: personaId,
    personaId,
    currentStep: 'profile',
    completedSteps: [],
    skippedSteps: [],
    profile: null,
    invites: [],
    preferences: null,
    startedAt: null,
    updatedAt: at,
    completedAt: null,
  };
}

/** Marks `step` as completed or skipped and moves to the next one. */
function settle(state: OnboardingState, step: StepId, how: 'completed' | 'skipped', at: string) {
  const without = (list: StepId[]) => list.filter((s) => s !== step);
  return {
    ...state,
    completedSteps:
      how === 'completed'
        ? [...without(state.completedSteps), step]
        : without(state.completedSteps),
    skippedSteps:
      how === 'skipped' ? [...without(state.skippedSteps), step] : without(state.skippedSteps),
    currentStep: nextStep(step),
    startedAt: state.startedAt ?? at,
    updatedAt: at,
  } satisfies OnboardingState;
}

export function createOnboardingServices(runtime: PrototypeRuntime<OnboardingDatabase>) {
  const { db, session, environment, clock } = runtime;
  const now = () => clock.now().toISOString();
  const principal = () => {
    const p = session.principal();
    if (!p) throw new Error('No active persona. Load a scenario first.');
    return p;
  };
  const read = async (personaId: string) =>
    (await db.onboarding.get(personaId)) ?? freshState(personaId, now());

  /** Read-modify-write of the actor's onboarding row inside one transaction. */
  const mutate = (
    area: string,
    change: (state: OnboardingState, at: string) => OnboardingState | Promise<OnboardingState>
  ) => {
    const personaId = principal().persona.id;
    return environment.run(area, () =>
      db.transaction('rw', db.onboarding, db.workspaces, db.invitations, async () => {
        const at = now();
        const next = await change(await read(personaId), at);
        await db.onboarding.put(next);
        return next;
      })
    );
  };

  return {
    /** Current state for a persona, or a fresh one. Read-only. */
    state: (personaId = principal().persona.id) => read(personaId),

    async saveProfile(input: ProfileInput) {
      session.assert(CAPABILITIES.progress);
      const profile = parse(ProfileSchema, input);
      return mutate('onboarding.profile', (state, at) =>
        settle({ ...state, profile }, 'profile', 'completed', at)
      );
    },

    async saveWorkspace(input: WorkspaceInput) {
      session.assert(CAPABILITIES.progress);
      session.assert(CAPABILITIES.workspaceUpdate);
      const data = parse(WorkspaceSchema, input);
      const { persona, organization } = principal();
      const workspaceId = organization?.id ?? 'org_0001';
      return mutate('onboarding.workspace', async (state, at) => {
        const workspace: Workspace = {
          id: workspaceId,
          ...data,
          updatedAt: at,
          updatedBy: persona.id,
        };
        await db.workspaces.put(workspace);
        return settle(state, 'workspace', 'completed', at);
      });
    },

    /** People who may not change the workspace still confirm they have seen it. */
    async acknowledgeWorkspace() {
      session.assert(CAPABILITIES.progress);
      return mutate('onboarding.workspace', (state, at) =>
        settle(state, 'workspace', 'completed', at)
      );
    },

    async saveInvites(input: InvitesInput) {
      session.assert(CAPABILITIES.progress);
      session.assert(CAPABILITIES.invitesCreate);
      const { invites } = parse(InvitesSchema, input);
      const { persona } = principal();
      const own = invites.findIndex((i) => i.email === persona.email?.toLowerCase());
      if (own >= 0)
        throw new ValidationError({ [`invites.${own}.email`]: "That's your own email" });
      return mutate('onboarding.invite', async (state, at) => {
        // Re-submitting the step replaces this wizard's earlier invitations instead of duplicating them.
        const earlier = new Set(state.invites.map((i) => i.email));
        const pending = await db.invitations.where('status').equals('pending').toArray();
        await db.invitations.bulkDelete(
          pending.filter((i) => i.invitedBy === persona.id && earlier.has(i.email)).map((i) => i.id)
        );
        const stillPending = new Set(
          pending
            .filter((i) => !(i.invitedBy === persona.id && earlier.has(i.email)))
            .map((i) => i.email)
        );
        const rows: Invitation[] = invites
          .filter((i) => !stillPending.has(i.email))
          .map((i) => ({
            id: createRuntimeId('invitation'),
            email: i.email,
            role: i.role,
            invitedBy: persona.id,
            status: 'pending',
            createdAt: at,
          }));
        await db.invitations.bulkAdd(rows);
        return settle({ ...state, invites }, 'invite', 'completed', at);
      });
    },

    async savePreferences(input: PreferencesInput) {
      session.assert(CAPABILITIES.progress);
      const preferences = parse(PreferencesSchema, input);
      const next = await mutate('onboarding.preferences', (state, at) =>
        settle({ ...state, preferences }, 'preferences', 'completed', at)
      );
      // Applies for real: the theme preference is stored per persona by the runtime.
      await runtime.theme.setPreference({ mode: preferences.mode });
      return next;
    },

    async skip(step: StepId) {
      session.assert(CAPABILITIES.progress);
      if (!isOptional(step)) {
        throw new ValidationError({
          form: `${STEP_DETAILS[step].label} is required and can't be skipped.`,
        });
      }
      // Skipping a step that was already answered keeps those answers (and anything they created).
      return mutate(`onboarding.${step}`, (state, at) => {
        // Same rule as goTo: skipping a later step must not jump past unfinished required ones.
        if (!canVisit(state, step)) {
          throw new ValidationError({
            form: `Finish the earlier steps before ${STEP_DETAILS[step].label}.`,
          });
        }
        return settle(
          state,
          step,
          state.completedSteps.includes(step) ? 'completed' : 'skipped',
          at
        );
      });
    },

    /** Back / jump to a step already reached. Persisted, so a reload lands there too. */
    async goTo(step: StepId) {
      session.assert(CAPABILITIES.progress);
      return mutate('onboarding.navigate', (state, at) => {
        if (!canVisit(state, step)) {
          throw new ValidationError({
            form: `Finish the earlier steps before ${STEP_DETAILS[step].label}.`,
          });
        }
        return { ...state, currentStep: step, startedAt: state.startedAt ?? at, updatedAt: at };
      });
    },

    async complete() {
      session.assert(CAPABILITIES.progress);
      return mutate('onboarding.complete', (state, at) => {
        const missing = missingRequired(state);
        if (missing.length > 0) {
          throw new ValidationError({
            form: `Finish ${missing.map((s) => STEP_DETAILS[s].label).join(' and ')} first.`,
          });
        }
        return { ...state, currentStep: 'done', completedAt: at, updatedAt: at };
      });
    },

    /** Starts over at step 1. Earlier answers stay as defaults; sent invitations stay sent. */
    async restart() {
      session.assert(CAPABILITIES.progress);
      return mutate('onboarding.restart', (state, at) => ({
        ...state,
        currentStep: 'profile',
        completedSteps: [],
        skippedSteps: [],
        startedAt: at,
        completedAt: null,
        updatedAt: at,
      }));
    },

    async revokeInvitation(id: string) {
      session.assert(CAPABILITIES.invitesCreate);
      await environment.run('invitations.revoke', async () => {
        const changed = await db.invitations.update(id, { status: 'revoked' });
        if (changed === 0) throw new Error('This invitation no longer exists.');
      });
    },
  };
}

export type OnboardingServices = ReturnType<typeof createOnboardingServices>;
