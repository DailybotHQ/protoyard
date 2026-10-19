import {
  PermissionDeniedError,
  type Persona,
  type PrototypeRuntime,
  ValidationError,
} from '@protoyard/core';
import type { StepEffect } from '@protoyard/saas';
import { defaultOnboardingSteps, type OnboardingUiStep } from '@protoyard/saas-ui';

/**
 * The Lattice onboarding wizard: the kit's four default steps (Profile,
 * Workspace, Invite teammates, Preferences), with every data change moved
 * from the step's `apply` (which ran before and outside the wizard's save)
 * into an engine `effect`. `createOnboarding().submit` runs
 * `session.assert` → zod → `environment.run('onboarding.<step>')` → ONE
 * `identity.write` transaction that writes the effect AND the wizard row, so
 * a simulated offline or failure, a permission denial or a validation error
 * writes nothing: the profile name, the workspace name, the invited people
 * and the step's answer commit together or not at all.
 *
 * Preferences only changes the color mode, which lives in control state (not
 * the data database); it is applied after the answer is saved
 * (`afterSubmit`), so a failed save leaves it unchanged too.
 */

export const ONBOARDING_INVITE_ROLE = 'member';

interface ProfileAnswer {
  fullName: string;
  jobTitle: string;
}
interface WorkspaceAnswer {
  name: string;
}
interface InviteAnswer {
  emails: string[];
}

interface PersonaTable {
  toArray(): Promise<Persona[]>;
}
interface DatabaseLike {
  table(name: string): PersonaTable;
}

const nameFromEmail = (email: string) =>
  (email.split('@')[0] ?? email)
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ') || email;

function activeOrganizationId(runtime: PrototypeRuntime): string {
  const organizationId = runtime.session.principal()?.organization?.id;
  if (!organizationId) throw new ValidationError({ form: 'Choose a workspace first.' });
  return organizationId;
}

/** Step effects: each runs inside the wizard's transaction with identity writes. */
export function latticeOnboardingEffects(runtime: PrototypeRuntime): Record<string, StepEffect> {
  const db = runtime.db as unknown as DatabaseLike;
  return {
    async profile(answer, { personaId, identity }) {
      const { fullName, jobTitle } = answer as ProfileAnswer;
      const persona = await identity.getPersona(personaId);
      if (!persona) throw new ValidationError({ form: 'Sign in first.' });
      await identity.putPersona({ ...persona, name: fullName, title: jobTitle });
    },

    async workspace(answer, { identity }) {
      const organizationId = activeOrganizationId(runtime);
      const current = await identity.getOrganization(organizationId);
      if (!current) throw new ValidationError({ form: 'This workspace no longer exists.' });
      const { name } = answer as WorkspaceAnswer;
      // A viewer confirms the name read-only; only a real rename needs the capability.
      if (name === current.name) return;
      runtime.session.assert('workspaces:rename', { organizationId });
      await identity.putOrganization({ ...current, name });
    },

    async invite(answer, { identity }) {
      const emails = [...new Set((answer as InviteAnswer).emails)];
      if (emails.length === 0) return;
      const organizationId = activeOrganizationId(runtime);
      try {
        runtime.session.assert('members:invite', { organizationId, role: ONBOARDING_INVITE_ROLE });
      } catch (error) {
        if (error instanceof PermissionDeniedError) {
          throw new ValidationError({
            emails: "Your role can't invite people. Skip this step instead.",
          });
        }
        throw error;
      }
      const self = runtime.session.principal()?.persona.email?.toLowerCase();
      if (self && emails.includes(self)) {
        throw new ValidationError({ emails: "That's your own email" });
      }
      const personas = await db.table('py_personas').toArray();
      for (const email of emails) {
        const existing = personas.find((persona) => persona.email?.toLowerCase() === email);
        if (existing) {
          const already = await identity.listMemberships({
            personaId: existing.id,
            organizationId,
          });
          if (already.length > 0) continue;
        }
        const persona =
          existing ??
          (await identity.putPersona({
            name: nameFromEmail(email),
            email,
            onboardingComplete: false,
            summary: 'Invited during onboarding',
          }));
        await identity.putMembership({
          personaId: persona.id,
          organizationId,
          role: ONBOARDING_INVITE_ROLE,
        });
      }
    },
  };
}

/** The wizard steps the Lattice `/onboarding` screen renders. */
export function latticeOnboardingSteps(runtime: PrototypeRuntime): OnboardingUiStep[] {
  const effects = latticeOnboardingEffects(runtime);
  return defaultOnboardingSteps().map(({ apply, ...step }) => {
    const effect = effects[step.id];
    if (effect) return { ...step, effect };
    return apply ? { ...step, afterSubmit: apply } : step;
  });
}
