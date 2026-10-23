import type { Attachment } from 'svelte/attachments';

/**
 * An attachment that reports its element to `set` while it is mounted, and
 * `null` after. Primitives that spread their rest props on their element carry
 * it there, which gives a wrapper a bindable `ref` without the primitive
 * exposing one.
 */
export function refAttachment<T extends Element>(set: (node: T | null) => void): Attachment<T> {
  return (node) => {
    set(node);
    return () => set(null);
  };
}
