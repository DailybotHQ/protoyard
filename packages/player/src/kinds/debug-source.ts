/**
 * Where a deck in the player came from, for the debug panel's agent
 * reference: a `?src=` path (a catalog deck or a file served beside the
 * player) names the blueprint file; anything else (a `#bp=` share link, a
 * picked or pasted file, an embed) is named by its content namespace, the
 * share id the player stores it under.
 */
export interface DeckDebugSource {
  /** The same shape as `AgentReferenceSource` in `@protoyard/decks/agent`. */
  kind: 'blueprint' | 'share';
  value: string;
}

export function deckDebugSource(search: string, namespace: string): DeckDebugSource {
  let src: string | null = null;
  try {
    src = new URLSearchParams(search).get('src');
  } catch {
    src = null;
  }
  // The player loads `?src=` by its path only, so a query or fragment is dropped here too.
  const path = (src?.trim().replace(/^\.\//, '') ?? '').split(/[?#]/, 1)[0] ?? '';
  // Untrusted: the value reaches a command an agent may run, so only a plain relative
  // `.json` path qualifies (the rule of isSafeDeckPath in @protoyard/decks/text).
  if (isSafeDeckPath(path)) return { kind: 'blueprint', value: path };
  return { kind: 'share', value: namespace };
}

/** Mirrors `isSafeDeckPath` (`@protoyard/decks/text`); the player does not depend on that package. */
function isSafeDeckPath(value: string): boolean {
  if (value.length > 256 || !/^[A-Za-z0-9_][A-Za-z0-9_./-]*\.json$/.test(value)) return false;
  return value.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}
