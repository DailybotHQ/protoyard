/**
 * `@protoyard/views-ui/states` — `QueryState`, the loading / empty / error /
 * offline / denied boundary for a `liveQuery` result, built on the
 * `@protoyard/ui` state components. Every view in the kit uses it for its own
 * data-less states, and route screens may import it statically (it is small).
 */
export { classifyQueryError, type QueryErrorInfo, type QueryErrorKind } from './classify.ts';
export { default as QueryState } from './QueryState.svelte';
