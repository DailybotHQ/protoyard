import {
  buildScenarioLink,
  type PrototypeRuntime,
  STYLE_OVERRIDE_KEYS,
  type StylePresetOverrides,
} from '@protoyard/core';

/**
 * A reproducible link carries scenario coordinates (scenario, actor, seed),
 * the presentation shell override (`shell`) and the style preset overrides
 * (`radius`, `elevation`, `font`, `motion`) on top of the current page URL.
 * Manual data edits never go into a URL — use snapshots for those.
 */
export function reproducibleLink(
  runtime: PrototypeRuntime,
  options: { presentation?: boolean; href?: string } = {}
): string {
  const href = options.href ?? location.href;
  const url = new URL(href);
  for (const key of [
    'scenario',
    'actor',
    'seed',
    'theme',
    'mode',
    'devtools',
    'shell',
    'frame',
    ...STYLE_OVERRIDE_KEYS,
  ]) {
    url.searchParams.delete(key);
  }
  const active = runtime.scenarios.active();
  const principal = runtime.session.principal();
  const defaultActor = active?.scenario.actor.id;
  const overrides = runtime.overrides.get();
  const shellOverride = overrides.shell;
  const style: StylePresetOverrides = {};
  for (const key of STYLE_OVERRIDE_KEYS) {
    if (overrides[key] !== undefined) Object.assign(style, { [key]: overrides[key] });
  }
  return buildScenarioLink(url.toString(), {
    ...(active ? { scenario: active.scenario.id } : {}),
    ...(principal && principal.persona.id !== defaultActor ? { actor: principal.persona.id } : {}),
    ...(active && active.seed !== active.scenario.seed ? { seed: active.seed } : {}),
    // Visible, clearable presentation override (ADR-016 / ?shell=).
    ...(shellOverride ? { shell: shellOverride } : {}),
    // Visible, clearable style preset overrides (?radius= ?elevation= ?font= ?motion=).
    ...style,
    ...(options.presentation ? { devtools: false } : {}),
  });
}
