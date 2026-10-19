import {
  buildScenarioLink,
  type PrototypeRuntime,
  STYLE_OVERRIDE_KEYS,
  type StylePresetOverrides,
} from '@protoyard/core';
import { encodeThemeShare, type ThemeShareDefinition } from '@protoyard/themes';

/**
 * A reproducible link carries scenario coordinates (scenario, actor, seed)
 * and the active look overrides on top of the current page URL: theme and
 * mode (`theme`, `mode`), the presentation shell (`shell`), the app layout
 * (`layout`) and the style presets (`radius`, `elevation`, `font`, `motion`).
 * Stale values for any of them in the page URL are replaced.
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
    'layout',
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
    // Visible, clearable look overrides (?theme= ?mode= ?layout=).
    ...(overrides.themeId ? { theme: overrides.themeId } : {}),
    ...(overrides.mode ? { mode: overrides.mode } : {}),
    ...(overrides.layout ? { layout: overrides.layout } : {}),
    // Visible, clearable presentation override (ADR-016 / ?shell=).
    ...(shellOverride ? { shell: shellOverride } : {}),
    // Visible, clearable style preset overrides (?radius= ?elevation= ?font= ?motion=).
    ...style,
    ...(options.presentation ? { devtools: false } : {}),
  });
}

/** Adds a compact Studio draft to the current hash route without losing it. */
export function themeShareLink(
  runtime: PrototypeRuntime,
  definition: ThemeShareDefinition,
  options: { href?: string } = {}
): string {
  const url = new URL(reproducibleLink(runtime, options));
  const hash = url.hash.slice(1) || '/';
  const queryIndex = hash.indexOf('?');
  const path = queryIndex < 0 ? hash : hash.slice(0, queryIndex);
  const query = new URLSearchParams(queryIndex < 0 ? '' : hash.slice(queryIndex + 1));
  query.set('themeDef', encodeThemeShare(definition));
  url.hash = `${path}?${query.toString()}`;
  return url.toString();
}
