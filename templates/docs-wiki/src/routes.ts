import { defineRoutes } from '@protoyard/renderer-svelte';

/** The screen map is data-only; each screen (and the editor) loads in its own chunk. */
export const routes = defineRoutes([
  {
    path: '/',
    name: 'Home',
    description: 'Every space, recently updated pages and a search box.',
    load: () => import('./screens/Home.svelte'),
  },
  {
    path: '/search',
    name: 'Search',
    description: 'Full-text search over titles and bodies, with highlighted matches (?q=).',
    load: () => import('./screens/Search.svelte'),
  },
  {
    path: '/spaces/:id',
    name: 'Space',
    description: "A space's page tree (drag to move) and its recent changes.",
    load: () => import('./screens/SpaceHome.svelte'),
  },
  {
    path: '/pages/:id',
    name: 'Page',
    description:
      'A page rendered through the safe Markdown preview, with its breadcrumb and subpages.',
    load: () => import('./screens/PageView.svelte'),
  },
  {
    path: '/pages/:id/edit',
    name: 'Edit page',
    description: 'The Markdown editor with a live safe preview; saving adds a version.',
    load: () => import('./screens/PageEdit.svelte'),
  },
  {
    path: '/pages/:id/history',
    name: 'Page history',
    description: 'Every version of a page: preview, changed lines, and restore.',
    load: () => import('./screens/PageHistory.svelte'),
  },
]);
