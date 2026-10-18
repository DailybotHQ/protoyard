import { type ColorMode, isExampleEmail, type PrototypeRuntime } from '@protoyard/core';
import { createWorkspaces, type OnboardingStepDefinition, ValidationError } from '@protoyard/saas';
import { z } from 'zod';

/**
 * Step definitions for the onboarding wizard UI. Each step is an engine step
 * (`@protoyard/saas` `createOnboarding`: id, label, optional, zod schema)
 * plus what the screen needs: fields to render, defaults, and `apply`, the
 * real change the answer makes (rename the workspace, invite people, set the
 * color mode). `apply` runs after validation and before the answer is saved;
 * if it throws, the person stays on the step and nothing moves forward.
 */

/** The runtime the wizard needs: the core contract plus identity and members writes. */
export type OnboardingRuntime = PrototypeRuntime & {
  identity: {
    write<T>(fn: (ops: IdentityWriteOps) => T | Promise<T>): Promise<T>;
  };
};
interface IdentityWriteOps {
  getPersona(id: string): Promise<Record<string, unknown> | undefined>;
  putPersona(input: Record<string, unknown>): Promise<unknown>;
}

export interface OnboardingSelectOption {
  value: string;
  label: string;
}

export interface OnboardingField {
  name: string;
  label: string;
  /** `emails` is a textarea of comma- or newline-separated addresses, submitted as a list. */
  kind: 'text' | 'emails' | 'select';
  required?: boolean;
  placeholder?: string;
  description?: string;
  options?: readonly OnboardingSelectOption[];
}

export interface OnboardingStepContext {
  runtime: OnboardingRuntime;
}

export interface OnboardingUiStep extends OnboardingStepDefinition {
  /** One line under the step title. */
  intro?: string;
  /** Rendered by the wizard unless the prototype passes a snippet for this step id. */
  fields?: readonly OnboardingField[];
  /** Field values when nothing was answered yet (strings, as typed). */
  defaults?: (ctx: OnboardingStepContext) => Record<string, string>;
  /** When true the fields are read-only (e.g. a viewer on the workspace step). */
  readOnly?: (ctx: OnboardingStepContext) => boolean;
  /** Explains a read-only step. */
  readOnlyNote?: string;
  /** The real change the validated answer makes, before it is saved. Throw to stay. */
  apply?: (answer: unknown, ctx: OnboardingStepContext) => void | Promise<void>;
}

/** Turns typed field strings into the step's input (`emails` → string[]). */
export function stepInput(
  step: OnboardingUiStep,
  values: Record<string, string>
): Record<string, unknown> {
  const input: Record<string, unknown> = { ...values };
  for (const field of step.fields ?? []) {
    if (field.kind === 'emails') {
      input[field.name] = (values[field.name] ?? '')
        .split(/[\s,;]+/)
        .map((email) => email.trim())
        .filter(Boolean);
    }
  }
  return input;
}

/** Back from a saved answer to the strings the fields show. */
export function stepValues(
  step: OnboardingUiStep,
  answer: unknown
): Record<string, string> | undefined {
  if (typeof answer !== 'object' || answer === null) return undefined;
  const values: Record<string, string> = {};
  for (const field of step.fields ?? []) {
    const value = (answer as Record<string, unknown>)[field.name];
    if (Array.isArray(value)) values[field.name] = value.join(', ');
    else if (value !== undefined && value !== null) values[field.name] = String(value);
  }
  return values;
}

const ProfileSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter your full name').max(60, 'Keep it under 60 characters'),
  jobTitle: z.string().trim().max(60, 'Keep it under 60 characters').default(''),
});

const WorkspaceSchema = z.object({
  name: z.string().trim().min(2, 'Name your workspace').max(80, 'Keep it under 80 characters'),
});

const InviteSchema = z.object({
  emails: z
    .array(
      z
        .string()
        .trim()
        .toLowerCase()
        .pipe(z.email('Enter valid email addresses'))
        .refine(isExampleEmail, 'Use fictional addresses at example.com')
    )
    .max(10, 'Invite up to 10 people at a time'),
});

const COLOR_MODES = ['light', 'dark', 'system'] as const;
const PreferencesSchema = z.object({
  mode: z.enum(COLOR_MODES, 'Pick a color mode'),
});

const nameFromEmail = (email: string) =>
  (email.split('@')[0] ?? email)
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ') || email;

/**
 * Profile → Workspace → Invite teammates (optional) → Preferences (optional).
 * Every answer changes something real in the prototype.
 */
export function defaultOnboardingSteps(): OnboardingUiStep[] {
  return [
    {
      id: 'profile',
      label: 'Profile',
      description: 'Tell us about you',
      intro: 'This is how teammates see you.',
      schema: ProfileSchema,
      fields: [
        { name: 'fullName', label: 'Full name', kind: 'text', required: true },
        { name: 'jobTitle', label: 'Job title', kind: 'text', placeholder: 'Product designer' },
      ],
      defaults: ({ runtime }) => {
        const persona = runtime.session.principal()?.persona;
        return { fullName: persona?.name ?? '', jobTitle: persona?.title ?? '' };
      },
      async apply(answer, { runtime }) {
        const { fullName, jobTitle } = answer as z.output<typeof ProfileSchema>;
        const personaId = runtime.session.principal()?.persona.id;
        if (!personaId) throw new ValidationError({ form: 'Sign in first.' });
        await runtime.identity.write(async (ops) => {
          const persona = await ops.getPersona(personaId);
          if (persona) await ops.putPersona({ ...persona, name: fullName, title: jobTitle });
        });
      },
    },
    {
      id: 'workspace',
      label: 'Workspace',
      description: 'Name your space',
      intro: 'Your team works here.',
      schema: WorkspaceSchema,
      fields: [{ name: 'name', label: 'Workspace name', kind: 'text', required: true }],
      defaults: ({ runtime }) => ({ name: runtime.session.principal()?.organization?.name ?? '' }),
      readOnly: ({ runtime }) => !runtime.session.can('workspaces:rename'),
      readOnlyNote: 'Only people who manage the workspace can rename it. Review it and continue.',
      async apply(answer, { runtime }) {
        if (!runtime.session.can('workspaces:rename')) return;
        const organization = runtime.session.principal()?.organization;
        if (!organization) return;
        const { name } = answer as z.output<typeof WorkspaceSchema>;
        if (name !== organization.name) {
          await createWorkspaces(runtime as never).rename(organization.id, { name });
        }
      },
    },
    {
      id: 'invite',
      label: 'Invite teammates',
      description: 'Optional',
      optional: true,
      intro: 'They join the workspace as members. Simulated: nobody receives an email.',
      schema: InviteSchema,
      fields: [
        {
          name: 'emails',
          label: 'Email addresses',
          kind: 'emails',
          placeholder: 'sam@example.com, kai@example.com',
          description: 'Separate addresses with commas or new lines.',
        },
      ],
      async apply(answer, { runtime }) {
        const { emails } = answer as z.output<typeof InviteSchema>;
        if (emails.length === 0) return;
        if (!runtime.session.can('members:invite')) {
          throw new ValidationError({
            emails: "Your role can't invite people. Skip this step instead.",
          });
        }
        const self = runtime.session.principal()?.persona.email?.toLowerCase();
        if (self && emails.includes(self)) {
          throw new ValidationError({ emails: "That's your own email" });
        }
        const members = new Set(
          runtime.members.list().map((member) => member.persona.email?.toLowerCase())
        );
        for (const email of emails) {
          if (members.has(email)) continue;
          await runtime.members.invite({ name: nameFromEmail(email), email, role: 'member' });
        }
      },
    },
    {
      id: 'preferences',
      label: 'Preferences',
      description: 'Optional',
      optional: true,
      intro: 'Saved for you on this prototype.',
      schema: PreferencesSchema,
      fields: [
        {
          name: 'mode',
          label: 'Color mode',
          kind: 'select',
          options: [
            { value: 'system', label: 'Match my system' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ],
        },
      ],
      defaults: ({ runtime }) => ({ mode: runtime.theme.appearance().mode.value }),
      async apply(answer, { runtime }) {
        const { mode } = answer as { mode: ColorMode };
        await runtime.theme.setPreference({ mode });
      },
    },
  ];
}
