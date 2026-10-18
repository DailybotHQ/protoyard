import { buildScenarioLink, type PrototypeRuntime } from '@protoyard/core';

/**
 * A reproducible link carries scenario coordinates (scenario, actor, seed)
 * and the presentation shell override (`shell`) on top of the current page
 * URL. Manual data edits never go into a URL — use snapshots for those.
 */
export function reproducibleLink(
  runtime: PrototypeRuntime,
  options: { presentation?: boolean; href?: string } = {}
): string {
  const href = options.href ?? location.href;
  const url = new URL(href);
  for (const key of ['scenario', 'actor', 'seed', 'theme', 'mode', 'devtools', 'shell']) {
    url.searchParams.delete(key);
  }
  const active = runtime.scenarios.active();
  const principal = runtime.session.principal();
  const defaultActor = active?.scenario.actor.id;
  const shellOverride = runtime.overrides.get().shell;
  return buildScenarioLink(url.toString(), {
    ...(active ? { scenario: active.scenario.id } : {}),
    ...(principal && principal.persona.id !== defaultActor ? { actor: principal.persona.id } : {}),
    ...(active && active.seed !== active.scenario.seed ? { seed: active.seed } : {}),
    // Visible, clearable presentation override (ADR-016 / ?shell=).
    ...(shellOverride ? { shell: shellOverride } : {}),
    ...(options.presentation ? { devtools: false } : {}),
  });
}
