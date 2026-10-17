/**
 * happy-dom rejects `Animation.finished` when Svelte cancels a transition
 * (browsers don't surface this), producing unhandled AbortErrors in tests.
 * Marking the promise as handled keeps component tests honest and quiet.
 */
const original = Element.prototype.animate;
if (typeof original === 'function') {
  Element.prototype.animate = function animate(
    this: Element,
    ...args: Parameters<Element['animate']>
  ) {
    const animation = original.apply(this, args);
    animation.finished?.catch(() => {});
    return animation;
  };
}
