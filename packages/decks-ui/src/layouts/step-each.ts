import type { PropSteps } from './prop-steps.ts';
import type { PropFragmentAttributes } from './steps.ts';

// Its own module, so only the layouts that use it (team avatars, a lazy
// family) load it, never the DeckApp entry.
/** Sets (or removes) one element's fragment attributes. */
function applyAttributes(element: Element, attributes: PropFragmentAttributes): void {
  for (const name of [
    'data-py-fragment-kind',
    'data-py-fragment',
    'data-py-fragment-active',
    'data-py-fragment-reveal',
    'aria-hidden',
    'inert',
  ]) {
    const value = attributes[name];
    if (value === undefined || value === false) element.removeAttribute(name);
    else element.setAttribute(name, value === true ? '' : value);
  }
}

/**
 * For list items a shared block renders (the people grid): an attachment that
 * puts the step attributes of item `i` (`pathOf(i)`) on the `i`-th element
 * matching `selector` inside the node. It re-runs when the step changes, and
 * re-applies when the block's own content arrives (blocks load lazily).
 * It only sets attributes; it never writes markup.
 */
export function stepEach(
  read: PropSteps,
  selector: string,
  count: number,
  pathOf: (index: number) => readonly (string | number)[]
): (node: HTMLElement) => () => void {
  return (node) => {
    // Read synchronously, so the attachment depends on the current step.
    const attributes = Array.from({ length: count }, (_, index) => read(pathOf(index)));
    const apply = () => {
      node.querySelectorAll(selector).forEach((element, index) => {
        const value = attributes[index];
        if (value) applyAttributes(element, value);
      });
    };
    apply();
    const observer =
      typeof MutationObserver === 'undefined' ? null : new MutationObserver(() => apply());
    observer?.observe(node, { childList: true, subtree: true });
    return () => observer?.disconnect();
  };
}
