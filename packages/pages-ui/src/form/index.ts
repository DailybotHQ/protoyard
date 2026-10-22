/** `@protoyard/pages-ui/form` — public page form block UI. */
export const FORM_UI_SUBPATH = 'form' as const;
export { default as FormBlock } from './FormBlock.svelte';
export { default as ResponsesPanel } from './ResponsesPanel.svelte';
export { getFormServices, setFormServices } from './context.ts';
