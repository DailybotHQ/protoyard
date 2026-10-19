import type { Overrides, SessionController, ThemeController } from '@protoyard/core';
import type { Kernel } from './kernel.ts';
import { applyOverrides } from './overrides.ts';

/**
 * Switching actor or organization only changes WHO is looking: it persists
 * an id in the control DB and recomputes the principal. Records are untouched.
 * Sign-in / sign-out (UX simulation, not authentication) persist `signedOut`
 * next to `actorId`, so the state survives a reload.
 */
export function createSessionController(k: Kernel): SessionController {
  /** Recomputes the principal; an explicit session action wins over a DevTools actor override. */
  async function dropActorOverride(writes: Promise<void> = Promise.resolve()) {
    if (k.overrides.actorId !== undefined) {
      const { actorId: _drop, ...rest } = k.overrides;
      await Promise.all([writes, applyOverrides(k, rest as Overrides)]);
    } else {
      k.refreshDerived();
      await writes;
    }
  }

  /** Acts as `personaId`; `signedOut` stays as given (switching never signs in). */
  async function act(personaId: string, signedOut: boolean) {
    if (!k.personas.some((p) => p.id === personaId)) {
      throw new Error(`Unknown persona "${personaId}".`);
    }
    k.actorId = personaId;
    k.signedOut = signedOut;
    // Keep the current org when the persona belongs to it, else its first org.
    const own = k.memberships.filter((m) => m.personaId === personaId);
    if (own.length && !own.some((m) => m.organizationId === k.organizationId)) {
      k.organizationId = own[0]?.organizationId ?? k.organizationId;
    }
    await dropActorOverride(
      k.writeControl({
        actorId: personaId,
        ...(k.organizationId ? { organizationId: k.organizationId } : {}),
        signedOut: signedOut ? true : null,
      })
    );
  }

  return {
    principal: () => k.principal,
    personas: () => k.personas,
    organizations: () => k.organizations,
    memberships: () => k.memberships,

    switchActor: (personaId) =>
      k.pending.track({ kind: 'session', label: 'Switching persona…' }, () =>
        act(personaId, k.signedOut)
      ),

    signIn: (personaId) =>
      k.pending.track({ kind: 'session', label: 'Signing in…' }, () => act(personaId, false)),

    signOut: () =>
      k.pending.track({ kind: 'session', label: 'Signing out…' }, async () => {
        k.signedOut = true;
        await dropActorOverride(k.writeControl({ signedOut: true }));
      }),

    isSignedIn: () => k.principal !== null,
    authState: () => (k.principal ? 'signed-in' : 'signed-out'),

    switchOrganization: (organizationId) =>
      k.pending.track({ kind: 'session', label: 'Switching organization…' }, async () => {
        if (!k.organizations.some((o) => o.id === organizationId)) {
          throw new Error(`Unknown organization "${organizationId}".`);
        }
        k.organizationId = organizationId;
        const writes = k.writeControl({ organizationId });
        if (k.overrides.organizationId !== undefined) {
          const { organizationId: _drop, ...rest } = k.overrides;
          await Promise.all([writes, applyOverrides(k, rest as Overrides)]);
        } else {
          k.refreshDerived();
          await writes;
        }
      }),

    can: (capability, resource) => k.policy.can(k.principal, capability, resource),
    assert: (capability, resource) => k.policy.assert(k.principal, capability, resource),

    async refresh() {
      await k.reloadIdentity();
      k.refreshDerived();
    },

    subscribe: (listener) => k.events.session.subscribe(listener),
  };
}

/**
 * Appearance is computed state only; applying CSS variables to the DOM is the
 * renderer's job. Nothing here touches the data DB.
 */
export function createThemeController(k: Kernel): ThemeController {
  return {
    themes: () => k.themes,
    get: (id) => k.themes.find((t) => t.id === id),
    appearance: () => k.appearance,

    async setPreference(patch) {
      const persona = k.principal?.persona;
      if (!persona)
        throw new Error('No active persona: load a scenario before saving preferences.');
      if (patch.themeId !== undefined) await k.ensureTheme(patch.themeId);
      const saved = await k.control.setPreference(persona.id, patch);
      k.preferences.set(persona.id, saved);
      k.refreshDerived();
    },

    async setOverride(patch) {
      if (patch.themeId !== undefined) await k.ensureTheme(patch.themeId);
      const next: Record<string, unknown> = { ...k.overrides };
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined) delete next[key];
        else next[key] = value;
      }
      await applyOverrides(k, next as Overrides);
    },

    async clearOverride() {
      const {
        themeId: _t,
        mode: _m,
        reducedMotion: _r,
        density: _d,
        viewport: _v,
        shell: _s,
        device: _dv,
        orientation: _o,
        layout: _l,
        ...rest
      } = k.overrides;
      await applyOverrides(k, rest);
    },

    subscribe: (listener) => k.events.appearance.subscribe(listener),
  };
}
