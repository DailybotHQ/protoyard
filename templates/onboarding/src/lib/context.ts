import type { PrototypeRuntime } from '@protoyard/core';
import { getRuntime, type LiveQuery, liveQuery, usePrincipal } from '@protoyard/renderer-svelte';
import { getContext, setContext } from 'svelte';
import type { OnboardingDatabase, OnboardingState, Workspace } from '../database/schema.ts';
import { createOnboardingServices, type OnboardingServices } from '../domain/services.ts';

const KEY = Symbol('onboarding');

export interface OnboardingApp {
  runtime: PrototypeRuntime<OnboardingDatabase>;
  db: OnboardingDatabase;
  services: OnboardingServices;
  /** The ACTIVE persona's onboarding row (undefined until they first act). Follows persona switches. */
  progress: LiveQuery<OnboardingState | undefined>;
  /** The active organization's workspace row. */
  workspace: LiveQuery<Workspace | undefined>;
}

/** Called once in App.svelte (during component init); screens read it with `useOnboarding()`. */
export function provideOnboarding(): OnboardingApp {
  const runtime = getRuntime() as unknown as PrototypeRuntime<OnboardingDatabase>;
  const principal = usePrincipal();
  const personaId = () => principal.current?.persona.id ?? '';
  const organizationId = () => principal.current?.organization?.id ?? '';
  const app: OnboardingApp = {
    runtime,
    db: runtime.db,
    services: createOnboardingServices(runtime),
    progress: liveQuery(() => runtime.db.onboarding.get(personaId()), { deps: personaId }),
    workspace: liveQuery(() => runtime.db.workspaces.get(organizationId()), {
      deps: organizationId,
    }),
  };
  setContext(KEY, app);
  return app;
}

export function useOnboarding(): OnboardingApp {
  const app = getContext<OnboardingApp | undefined>(KEY);
  if (!app) throw new Error('useOnboarding() must be used inside App.svelte');
  return app;
}
