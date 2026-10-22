/**
 * `@protoyard/pages-ui/print` — printing for page and doc kinds: the print
 * stylesheet (`print.css`, all rules inside `@media print`, loaded with this
 * subpath and with `@protoyard/pages-ui/styles.css`) and `PrintButton`.
 * Deck slide-per-page print stays in `@protoyard/decks-ui`.
 */
export const PRINT_UI_SUBPATH = 'print' as const;
/** Add to a host root so the print stylesheet applies to it (PageHost and DocHost already match). */
export const PRINT_ROOT_CLASS = 'py-print-root' as const;
export { default as PrintButton } from './PrintButton.svelte';
