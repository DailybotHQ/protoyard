import { buildScenarioLink, type PrototypeRuntime } from '@protoyard/core';

/**
 * A reproducible link carries only scenario coordinates (scenario, actor,
 * seed) on top of the current page URL. Manual edits never go into a URL.
 */
export function reproducibleLink(
  runtime: PrototypeRuntime,
  options: { presentation?: boolean; href?: string } = {}
): string {
  const href = options.href ?? location.href;
  const url = new URL(href);
  for (const key of ['scenario', 'actor', 'seed', 'theme', 'mode', 'devtools']) {
    url.searchParams.delete(key);
  }
  const active = runtime.scenarios.active();
  const principal = runtime.session.principal();
  const defaultActor = active?.scenario.actor.id;
  return buildScenarioLink(url.toString(), {
    ...(active ? { scenario: active.scenario.id } : {}),
    ...(principal && principal.persona.id !== defaultActor ? { actor: principal.persona.id } : {}),
    ...(active && active.seed !== active.scenario.seed ? { seed: active.seed } : {}),
    ...(options.presentation ? { devtools: false } : {}),
  });
}
