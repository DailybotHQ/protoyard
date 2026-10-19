import type { PrototypeRuntime, Theme, ThemeInput } from '@protoyard/core';
import type { ThemeControllerExtras } from '@protoyard/runtime';
import { CAPABILITIES } from './policy.ts';

/**
 * Theme Lab writes: UI → assert → environment.run → control-DB persist
 * (via the runtime theme controller). Favorites stay on the data DB.
 */
export function createThemeLabServices(
  runtime: PrototypeRuntime,
  themeExtras: ThemeControllerExtras
) {
  const { session, environment } = runtime;

  return {
    /** Validate and save (or replace) a custom theme. */
    async saveCustom(input: ThemeInput): Promise<Theme> {
      session.assert(CAPABILITIES.themeManage);
      return environment.run('theme.saveCustom', () => themeExtras.saveCustom(input));
    },

    /**
     * Register a theme if needed (library / draft) then set the override.
     * Viewers may apply any theme, including library themes that are not yet
     * on the runtime list (registered under theme:apply without manage).
     * Only designers may save brand-new Theme Studio drafts via saveCustom.
     */
    async activate(theme: Theme): Promise<Theme> {
      session.assert(CAPABILITIES.themeApply);
      return environment.run('theme.activate', async () => {
        const known = runtime.theme.themes().some((entry) => entry.id === theme.id);
        if (!known) {
          // Library/preview registration is allowed for theme:apply holders so
          // viewers can use library cards. saveCustom still enforces the 24 cap.
          await themeExtras.saveCustom(theme);
        }
        await runtime.theme.setOverride({ themeId: theme.id });
        return theme;
      });
    },

    async removeCustom(id: string): Promise<void> {
      session.assert(CAPABILITIES.themeManage);
      return environment.run('theme.removeCustom', () => themeExtras.removeCustom(id));
    },
  };
}

export type ThemeLabServices = ReturnType<typeof createThemeLabServices>;
