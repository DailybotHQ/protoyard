import type { KindLoaders } from './renderers.ts';

/** The page renderer (pages-ui `PageApp`), for `page.html` and `index.html` only (see `renderers.ts`). */
export const PAGE_LOADERS: KindLoaders = {
  loadRenderer: () =>
    Promise.all([import('./content.css'), import('@protoyard/pages-ui/page')]).then(
      ([, module]) => module
    ),
};
