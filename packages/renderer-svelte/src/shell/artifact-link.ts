/**
 * Claude artifacts retain a plain hash token, but not a query string. These
 * helpers translate a known `#scenario--persona--theme` token into the query
 * parameters already understood by the runtime. Route hashes (including
 * `#/…` and deck slide hashes) are deliberately left alone.
 */
export interface ArtifactLinkOptions {
  scenarios: readonly string[];
  /** Known starting persona ids. Unknown ids are ignored. */
  personas?: readonly string[];
  /** Themes bundled with this prototype. Unknown ids are ignored. */
  themes?: readonly string[];
}

const SCENARIO_ID = /^[a-z][a-z0-9-]*$/;
const PERSONA_ID = /^[A-Za-z0-9_-]{1,64}$/;
const THEME_ID = /^[a-z][a-z0-9-]*$/;

/** Returns runtime query parameters for a valid artifact token, or `null`. */
export function artifactLinkSearch(hash: string, options: ArtifactLinkOptions): string | null {
  if (!hash.startsWith('#')) return null;
  const parts = hash.slice(1).split('--');
  if (parts.length < 1 || parts.length > 3) return null;
  const scenario = parts[0];
  if (!scenario || !SCENARIO_ID.test(scenario) || !options.scenarios.includes(scenario))
    return null;

  const params = new URLSearchParams({ scenario });
  const second = parts[1];
  const third = parts[2];
  let persona: string | undefined;
  let theme: string | undefined;

  if (second !== undefined) {
    if (options.personas?.includes(second) && PERSONA_ID.test(second)) persona = second;
    else if (options.themes?.includes(second) && THEME_ID.test(second)) theme = second;
  }
  if (third !== undefined && options.themes?.includes(third) && THEME_ID.test(third)) {
    theme = third;
  }

  if (persona) params.set('actor', persona);
  if (theme) params.set('theme', theme);
  return `?${params.toString()}`;
}

/**
 * Reads and consumes a validated artifact token at boot. Replacing the hash
 * before the app mounts keeps the token from being interpreted as a route.
 */
export function consumeArtifactLink(options: ArtifactLinkOptions): string | undefined {
  if (typeof location === 'undefined') return undefined;
  const search = artifactLinkSearch(location.hash, options);
  if (!search) return undefined;
  history.replaceState(history.state, '', `${location.pathname}${location.search}#/`);
  return search;
}
