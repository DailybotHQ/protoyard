/** Persist side-panel width per prototype namespace (local preference, not persona). */

export const SIDE_PANEL_WIDTH_MIN = 240;
export const SIDE_PANEL_WIDTH_MAX = 560;
export const SIDE_PANEL_WIDTH_DEFAULT = 360;
export const SIDE_PANEL_WIDTH_STEP = 16;

export function sidePanelWidthKey(namespace: string): string {
  return `protoyard.${namespace}.side-panel-width`;
}

export function clampSidePanelWidth(width: number, max = SIDE_PANEL_WIDTH_MAX): number {
  const ceiling = Math.max(SIDE_PANEL_WIDTH_MIN, max);
  return Math.min(ceiling, Math.max(SIDE_PANEL_WIDTH_MIN, Math.round(width)));
}

export function loadSidePanelWidth(
  namespace: string,
  storage: Storage | undefined = globalThis.localStorage
): number {
  try {
    const raw = storage?.getItem(sidePanelWidthKey(namespace));
    if (!raw) return SIDE_PANEL_WIDTH_DEFAULT;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return SIDE_PANEL_WIDTH_DEFAULT;
    return clampSidePanelWidth(parsed);
  } catch {
    return SIDE_PANEL_WIDTH_DEFAULT;
  }
}

export function saveSidePanelWidth(
  namespace: string,
  width: number,
  storage: Storage | undefined = globalThis.localStorage
): void {
  try {
    storage?.setItem(sidePanelWidthKey(namespace), String(clampSidePanelWidth(width)));
  } catch {
    // Private mode / quota: width simply does not persist.
  }
}
