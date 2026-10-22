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
  const path = src?.trim().replace(/^\.\//, '') ?? '';
  if (path && !/^[a-z][a-z0-9+.-]*:/i.test(path) && path.length <= 512) {
    return { kind: 'blueprint', value: path };
  }
  return { kind: 'share', value: namespace };
}
