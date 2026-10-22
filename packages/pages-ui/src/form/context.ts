import type { FormServices } from '@protoyard/pages';
import { getContext, setContext } from 'svelte';

const FORM_SERVICES_KEY = Symbol.for('@protoyard/pages-ui/form-services');

/** Provide form services to FormBlock descendants (and tests). */
export function setFormServices(services: FormServices | null): void {
  setContext(FORM_SERVICES_KEY, services);
}

/** Read form services from the nearest PageApp/DocApp. */
export function getFormServices(): FormServices | null {
  return getContext<FormServices | null>(FORM_SERVICES_KEY) ?? null;
}
