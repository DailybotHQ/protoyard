/** Remembered panel state. Storage can be unavailable, so every access is guarded. */

export interface PanelPrefs {
  open: boolean;
  tab: string;
}

const DEFAULTS: PanelPrefs = { open: false, tab: 'scenario' };

export function prefsKey(namespace: string): string {
  return `protoyard.${namespace}.devtools`;
}

export function loadPrefs(
  namespace: string,
  storage: Storage | undefined = globalThis.localStorage
): PanelPrefs {
  try {
    const raw = storage?.getItem(prefsKey(namespace));
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<PanelPrefs>;
    return {
      open: typeof parsed.open === 'boolean' ? parsed.open : DEFAULTS.open,
      tab: typeof parsed.tab === 'string' ? parsed.tab : DEFAULTS.tab,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function savePrefs(
  namespace: string,
  prefs: PanelPrefs,
  storage: Storage | undefined = globalThis.localStorage
): void {
  try {
    storage?.setItem(prefsKey(namespace), JSON.stringify(prefs));
  } catch {
    // Private mode / quota: the panel simply forgets its state.
  }
}
