/**
 * @deprecated No longer needed: since Texuli 0.6 (G75) a dialog backdrop and
 * every overlay opened inside a modal register as inert exemptions with
 * `raise: false`, so a Select, Combobox or menu opened inside a dialog stays
 * above its backdrop and only the toast region is re-raised. Kept as a no-op
 * so existing callers keep working; returns a no-op uninstall function.
 */
export function installPopoverOrder(_doc?: Document): () => void {
  return () => {};
}
