import 'fake-indexeddb/auto';

/**
 * happy-dom rejects `Animation.finished` when Svelte cancels a transition
 * (real browsers don't surface this), producing unhandled AbortErrors in
 * component tests. Marking the promise as handled keeps them honest and quiet.
 */
if (typeof Element !== 'undefined' && typeof Element.prototype.animate === 'function') {
  const original = Element.prototype.animate;
  Element.prototype.animate = function animate(
    this: Element,
    ...args: Parameters<Element['animate']>
  ) {
    const animation = original.apply(this, args);
    animation.finished?.catch(() => {});
    return animation;
  };
}
