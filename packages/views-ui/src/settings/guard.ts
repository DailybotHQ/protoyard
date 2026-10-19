/**
 * Blocks hash navigation while a form has unsaved changes. The listener runs
 * in the capture phase, so it sees `hashchange` before the hash router does
 * (listeners on the target run capture-first); it stops the event and puts
 * the old URL back with `replaceState`, which fires nothing. The router never
 * leaves the screen, so the unsaved state survives until the person decides.
 * `beforeunload` also asks before a reload or tab close.
 */
export interface NavigationGuardOptions {
  isDirty: () => boolean;
  /** Called with the blocked target; call `proceed()` to navigate after all (e.g. "Discard and leave"). */
  onBlocked: (attempt: { target: string; proceed: () => void }) => void;
}

export function guardHashNavigation(options: NavigationGuardOptions): () => void {
  let current = location.href;
  let allowNext = false;

  const onHashChange = (event: HashChangeEvent) => {
    const target = location.href;
    // Some engines fire twice, or for our own replaceState: nothing changed, nothing to guard.
    if (target === current) return;
    if (allowNext || !options.isDirty()) {
      allowNext = false;
      current = target;
      return;
    }
    event.stopImmediatePropagation();
    history.replaceState(history.state, '', current);
    options.onBlocked({
      target,
      proceed: () => {
        allowNext = true;
        history.pushState(history.state, '', target);
        window.dispatchEvent(
          new HashChangeEvent('hashchange', { oldURL: current, newURL: target })
        );
      },
    });
  };
  const onBeforeUnload = (event: BeforeUnloadEvent) => {
    if (!options.isDirty()) return;
    event.preventDefault();
    // Older engines need a value; browsers show their own wording.
    event.returnValue = '';
  };

  window.addEventListener('hashchange', onHashChange, { capture: true });
  window.addEventListener('beforeunload', onBeforeUnload);
  return () => {
    window.removeEventListener('hashchange', onHashChange, { capture: true });
    window.removeEventListener('beforeunload', onBeforeUnload);
  };
}
