import { getInertRegistry } from '@texuli/core/inert';

/**
 * Keeps a popover that opens inside a modal dialog above the dialog's
 * backdrop.
 *
 * Texuli 0.5.0 registers a top-layer dialog backdrop as an inert exemption,
 * and every overlay that opens re-shows the open exemptions so the toast
 * region keeps painting above it. The backdrop is re-shown too: a Select,
 * Combobox or menu opened inside the dialog ends up under it, and so does the
 * dialog itself, so nothing in the dialog can be clicked (Texuli gap N30).
 *
 * When a popover opens while a backdrop is open, this re-shows, in order, the
 * open popovers around it (the dialog content), the popover itself and then
 * the toast regions, the stacking Texuli means. Re-showing a top-layer
 * popover keeps focus and state (Texuli re-shows its own content the same way).
 */

const BACKDROP = /-backdrop$/;
/** Exempt regions that paint above every overlay (popovers such as a Select are exemptions too). */
const REGIONS = new Set(['toast-region', 'undo-toaster', 'announcer']);
let uninstall: (() => void) | null = null;

function isOpenPopover(element: Element | null): element is HTMLElement {
  if (!(element instanceof HTMLElement) || !element.hasAttribute('popover')) return false;
  try {
    return element.matches(':popover-open');
  } catch {
    return false;
  }
}

/** Open popovers containing `node`, outermost first. */
function popoverAncestors(node: Element | null, skip: Set<Element>): HTMLElement[] {
  const chain: HTMLElement[] = [];
  for (let current = node?.parentElement ?? null; current; current = current.parentElement) {
    if (isOpenPopover(current) && !skip.has(current)) chain.unshift(current);
  }
  return chain;
}

/** Installs the fix on `doc` once; returns the uninstall function. */
export function installPopoverOrder(
  doc: Document | undefined = typeof document === 'undefined' ? undefined : document
): () => void {
  if (!doc) return () => {};
  if (uninstall) return uninstall;
  // Re-shows queue their own `toggle` events: skip each once.
  const reshown = new WeakSet<Element>();

  const reshow = (element: HTMLElement): void => {
    reshown.add(element);
    try {
      element.hidePopover();
      element.showPopover();
    } catch {
      reshown.delete(element);
    }
  };

  const onToggle = (event: Event): void => {
    const target = event.target;
    if ((event as Event & { newState?: string }).newState !== 'open') return;
    if (!(target instanceof HTMLElement)) return;
    if (reshown.has(target)) {
      reshown.delete(target);
      return;
    }
    const exemptions = getInertRegistry().exemptions();
    const backdrops = exemptions.filter((entry) => BACKDROP.test(entry.label ?? ''));
    const regions = exemptions.filter((entry) => REGIONS.has(entry.label ?? ''));
    // Backdrops and regions are what get raised: never re-order around them.
    const skip = new Set([...backdrops, ...regions].map((entry) => entry.element));
    if (skip.has(target) || !isOpenPopover(target)) return;
    if (!backdrops.some((entry) => isOpenPopover(entry.element))) return;
    const owners = [
      ...popoverAncestors(target, skip),
      ...popoverAncestors(doc.activeElement, skip),
    ].filter((element, index, list) => element !== target && list.indexOf(element) === index);
    const openRegions = regions
      .filter((entry) => isOpenPopover(entry.element))
      .map((entry) => entry.element as HTMLElement);
    for (const element of [...owners, target, ...openRegions]) reshow(element);
  };

  doc.addEventListener('toggle', onToggle, true);
  uninstall = () => {
    doc.removeEventListener('toggle', onToggle, true);
    uninstall = null;
  };
  return uninstall;
}
