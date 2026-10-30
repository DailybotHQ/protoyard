/**
 * Caller handlers on an element a component also listens on, with Texuli's
 * uniform-contract rule: the caller's handler runs first and never replaces
 * the component's own. (Texuli keeps its helpers internal, so this package
 * states the same two rules here.)
 */

type Handler<E extends Event> = ((event: E) => unknown) | null | undefined;

/** The component's handler runs unless the caller called `preventDefault()`. */
export function composeHandlers<E extends Event>(
  caller: Handler<E>,
  own: (event: E) => unknown
): (event: E) => void {
  return (event) => {
    caller?.(event);
    if (!event.defaultPrevented) own(event);
  };
}

/** The component's handler always runs (bookkeeping that must not be skipped). */
export function chainHandlers<E extends Event>(
  caller: Handler<E>,
  own: (event: E) => unknown
): (event: E) => void {
  return (event) => {
    caller?.(event);
    own(event);
  };
}
