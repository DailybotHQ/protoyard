import {
  type ColorMode,
  MEMBER_CAPABILITIES,
  type Organization,
  type Persona,
  type PrototypeRuntime,
  parseInput,
  ValidationError,
} from '@protoyard/core';
import { z } from 'zod';

/**
 * Services behind the generated settings screen. Profile and workspace edits
 * go through the runtime identity writer (`py_personas` / `py_organizations`),
 * so the session, persona switcher and members list see them at once.
 * Everything is a simulation: roles here are UX, not security.
 */

/** Workspace settings and the danger zone follow team-management rights (owners and admins). */
export const WORKSPACE_CAPABILITY = MEMBER_CAPABILITIES.update;

export const ProfileInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Enter at least 2 characters')
    .max(80, 'Use at most 80 characters'),
  avatarColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Choose a six-digit color such as #4f46e5'),
});
export type ProfileInput = z.input<typeof ProfileInputSchema>;

export const WorkspaceInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Enter at least 2 characters')
    .max(80, 'Use at most 80 characters'),
});
export type WorkspaceInput = z.input<typeof WorkspaceInputSchema>;

export const AppearanceInputSchema = z.object({
  themeId: z.string().min(1).optional(),
  mode: z.enum(['light', 'dark', 'system']).optional(),
});
export type AppearanceInput = z.input<typeof AppearanceInputSchema>;

/** The runtime identity writer (`@protoyard/runtime`), typed structurally. */
interface IdentityWriter {
  write<T>(
    fn: (ops: {
      putPersona(input: Persona): Promise<Persona>;
      putOrganization(input: Organization): Promise<Organization>;
    }) => Promise<T>
  ): Promise<T>;
}

function identityOf(runtime: PrototypeRuntime): IdentityWriter | null {
  const identity = (runtime as { identity?: unknown }).identity;
  return identity && typeof (identity as IdentityWriter).write === 'function'
    ? (identity as IdentityWriter)
    : null;
}

export interface SettingsServices {
  /** False on runtimes without an identity writer: profile and workspace are then read-only. */
  readonly canWriteIdentity: boolean;
  /** Renames the signed-in persona and sets its avatar color (only ever your own profile). */
  updateProfile(input: ProfileInput): Promise<Persona>;
  /** Renames the active organization. Owners and admins only. */
  renameWorkspace(input: WorkspaceInput): Promise<Organization>;
  /** Theme and color mode, persisted per persona by the runtime. */
  setAppearance(input: AppearanceInput): Promise<void>;
  /** Reloads the active scenario from its seed: every change in this prototype is lost. */
  resetWorkspaceData(): Promise<void>;
}

export function createSettingsServices(runtime: PrototypeRuntime): SettingsServices {
  const identity = identityOf(runtime);

  function principal() {
    const current = runtime.session.principal();
    if (!current) throw new ValidationError({ form: 'Sign in to change settings.' });
    return current;
  }

  function writer(): IdentityWriter {
    if (!identity) {
      throw new ValidationError({ form: 'This prototype cannot edit identities.' });
    }
    return identity;
  }

  return {
    canWriteIdentity: identity !== null,

    async updateProfile(input) {
      const { persona } = principal();
      const data = parseInput(ProfileInputSchema, input);
      const write = writer();
      return runtime.environment.run('settings.profile.update', () =>
        write.write((ops) => ops.putPersona({ ...persona, ...data }))
      );
    },

    async renameWorkspace(input) {
      const { organization } = principal();
      runtime.session.assert(WORKSPACE_CAPABILITY);
      if (!organization) throw new ValidationError({ form: 'There is no active workspace.' });
      const data = parseInput(WorkspaceInputSchema, input);
      const write = writer();
      return runtime.environment.run('settings.workspace.rename', () =>
        write.write((ops) => ops.putOrganization({ ...organization, ...data }))
      );
    },

    async setAppearance(input) {
      principal();
      const data = parseInput(AppearanceInputSchema, input);
      if (data.themeId !== undefined) {
        const theme =
          runtime.theme.get(data.themeId) ?? (await runtime.theme.ensure?.(data.themeId));
        if (!theme) throw new ValidationError({ themeId: 'That theme is not available.' });
      }
      const patch: { themeId?: string; mode?: ColorMode } = {};
      if (data.themeId !== undefined) patch.themeId = data.themeId;
      if (data.mode !== undefined) patch.mode = data.mode;
      await runtime.theme.setPreference(patch);
    },

    async resetWorkspaceData() {
      principal();
      runtime.session.assert(WORKSPACE_CAPABILITY);
      await runtime.scenarios.reset();
    },
  };
}
