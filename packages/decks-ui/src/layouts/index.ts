/**
 * `@protoyard/decks-ui/layouts`: custom slides, the one slide kind a
 * generated deck renders with its own code. The 20 catalog layouts render on
 * the `@texuli/slides` stage (`@texuli/slides/layouts`).
 */

export { default as CustomSlideHost } from './CustomSlideHost.svelte';
export {
  type CustomSlideComponent,
  type CustomSlideLoader,
  type CustomSlideProps,
  type CustomSlideRegistry,
  customSlideLoader,
  frozenCopy,
} from './custom-slides.ts';
