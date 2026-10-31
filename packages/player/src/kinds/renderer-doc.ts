import type { KindLoaders } from './renderers.ts';

/**
 * The doc renderer (pages-ui `DocApp`: the reading view, the doc editor and
 * its Word and PDF writers), for `doc.html` and `index.html` only (see
 * `renderers.ts`).
 */
export const DOC_LOADERS: KindLoaders = {
  loadRenderer: () =>
    Promise.all([import('./content.css'), import('@protoyard/pages-ui/doc')]).then(
      ([, module]) => module
    ),
};
