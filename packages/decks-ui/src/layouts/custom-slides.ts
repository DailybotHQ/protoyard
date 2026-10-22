import type { CustomSlide } from '@protoyard/decks/schema';
import type { Component } from 'svelte';

/**
 * What an owned custom slide component receives: its own slide (a frozen
 * copy), the current step, the number of steps and the slide's `data`. Never
 * the raw deck or the runtime's write services; a prototype that wants them
 * passes them to its component itself.
 */
export interface CustomSlideProps {
  slide: Readonly<CustomSlide>;
  /** 0 before the first reveal, up to `stepCount`. */
  step: number;
  /** The slide's reveal steps (its `steps` labels). */
  stepCount: number;
  /** `props.data`, bounded JSON (a frozen copy; `{}` when the slide has none). */
  data: Readonly<Record<string, unknown>>;
}

export type CustomSlideComponent = Component<CustomSlideProps>;

/** A lazy loader: the component's module loads the first time its slide shows. */
export type CustomSlideLoader = () => Promise<{ default: CustomSlideComponent }>;

/** A generated deck's `src/custom-slides.ts`: component id → lazy loader. */
export type CustomSlideRegistry = Readonly<Record<string, CustomSlideLoader>>;

/** A deep-frozen copy, so a component can never change the deck's data. */
export function frozenCopy<T>(value: T): Readonly<T> {
  const copy = structuredClone(value);
  const freeze = (node: unknown): void => {
    if (node === null || typeof node !== 'object' || Object.isFrozen(node)) return;
    Object.freeze(node);
    for (const child of Object.values(node as Record<string, unknown>)) freeze(child);
  };
  freeze(copy);
  return copy;
}

/** The registry's loader for `id`, never one inherited from `Object.prototype`. */
export function customSlideLoader(
  registry: CustomSlideRegistry | undefined,
  id: string
): CustomSlideLoader | null {
  if (!registry || !Object.hasOwn(registry, id)) return null;
  const loader = registry[id];
  return typeof loader === 'function' ? loader : null;
}
