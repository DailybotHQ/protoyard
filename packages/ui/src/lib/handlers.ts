/**
 * Caller handlers on an element a component also listens on: Texuli's
 * uniform-contract helpers, public from `texuli/cx` since 0.9 (G95). The
 * caller's handler runs first and never replaces the component's own;
 * `composeHandlers` skips the component's after `preventDefault()`,
 * `chainHandlers` always runs it.
 */
export { chainHandlers, composeHandlers } from 'texuli/cx';
