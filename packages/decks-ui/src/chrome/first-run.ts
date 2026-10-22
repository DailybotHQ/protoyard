/**
 * The first-visit hint's rules, apart from its component so a deck can decide
 * whether to load the hint at all (`FirstRunHint.svelte` is its own chunk).
 */
/** How long the first-visit hint stays when nobody touches the deck. */
export const FIRST_RUN_HINT_MS = 6000;

/** The `localStorage` key that remembers a deck namespace has shown its hint. */
export function firstRunHintKey(namespace: string): string {
  return `protoyard:deck-hint:${namespace}`;
}

/**
 * Whether the hint may show on this page: never with `?hint=0`, in a hidden
 * document or under automation (screenshots, artifact thumbnail capture);
 * `?hint=1` forces it on (for checks), still once per namespace.
 */
export function firstRunHintAllowed(win: Window = window): boolean {
  let flag: string | null = null;
  try {
    flag = new URLSearchParams(win.location.search).get('hint');
  } catch {
    flag = null;
  }
  if (flag === '0') return false;
  if (flag === '1') return true;
  if (win.document.visibilityState === 'hidden') return false;
  return win.navigator.webdriver !== true;
}

/** True once per namespace: reads and records the flag; storage that throws or is missing counts as unseen but is not retried. */
export function claimFirstRunHint(namespace: string, storage: () => Storage | null): boolean {
  const key = firstRunHintKey(namespace);
  try {
    const store = storage();
    if (!store) return true;
    if (store.getItem(key) !== null) return false;
    store.setItem(key, '1');
    return true;
  } catch {
    return true;
  }
}

/** True when this namespace has already shown its hint (read only; storage errors count as unseen). */
export function firstRunHintSeen(namespace: string, storage: () => Storage | null): boolean {
  try {
    return storage()?.getItem(firstRunHintKey(namespace)) != null;
  } catch {
    return false;
  }
}
