/** `@protoyard/pages-ui/form` — public page form block UI. */
export const FORM_UI_SUBPATH = 'form' as const;
export { getFormServices, setFormServices } from './context.ts';
export { default as FormBlock } from './FormBlock.svelte';
export type { FormPort, FormResponse, FormServices, ResponsesPort } from './ports.ts';
export { default as ResponsesPanel } from './ResponsesPanel.svelte';
