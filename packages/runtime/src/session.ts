import type { Overrides, SessionController, ThemeController } from '@protoyard/core';
import type { Kernel } from './kernel.ts';
import { applyOverrides } from './overrides.ts';

/**
 * Switching actor or organization only changes WHO is looking: it persists
 * an id in the control DB and recomputes the principal. Records are untouched.
 */
export function createSessionController(k: Kernel): SessionController {
  return {
    principal: () => k.principal,
    personas: () => k.personas,
    organizations: () => k.organizations,
    memberships: () => k.memberships,

    async switchActor(personaId) {
      if (!k.personas.some((p) => p.id === personaId)) {
        throw new Error(`Unknown persona "${personaId}".`);
      }
      k.actorId = personaId;
      // Keep the current org when the persona belongs to it, else its first org.
      const own = k.memberships.filter((m) => m.personaId === personaId);
      if (own.length && !own.some((m) => m.organizationId === k.organizationId)) {
        k.organizationId = own[0]?.organizationId ?? k.organizationId;
      }
      const writes = k.writeControl({
        actorId: personaId,
        ...(k.organizationId ? { organizationId: k.organizationId } : {}),
      });
      // An explicit switch wins over a leftover DevTools actor override.
      if (k.overrides.actorId !== undefined) {
        const { actorId: _drop, ...rest } = k.overrides;
        await Promise.all([writes, applyOverrides(k, rest as Overrides)]);
      } else {
        k.refreshDerived();
        await writes;
      }
    },

    async switchOrganization(organizationId) {
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
    },

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
      const saved = await k.control.setPreference(persona.id, patch);
      k.preferences.set(persona.id, saved);
      k.refreshDerived();
    },

    async setOverride(patch) {
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
        ...rest
      } = k.overrides;
      await applyOverrides(k, rest);
    },

    subscribe: (listener) => k.events.appearance.subscribe(listener),
  };
}
