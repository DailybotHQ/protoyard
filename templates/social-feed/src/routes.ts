import { defineRoutes } from '@protoyard/renderer-svelte';

/** The screen map is data-only; each screen loads in its own chunk. */
export const routes = defineRoutes([
  {
    path: '/',
    name: 'Feed',
    description: 'Home and everyone timelines with the composer.',
    load: () => import('./screens/Feed.svelte'),
  },
  {
    path: '/notifications',
    name: 'Notifications',
    description: 'Reactions, comments, follows and mentions aimed at you.',
    load: () => import('./screens/Notifications.svelte'),
  },
  {
    path: '/people',
    name: 'People',
    description: 'Everyone in the network, with follow buttons.',
    load: () => import('./screens/People.svelte'),
  },
  {
    path: '/people/:handle',
    name: 'Profile',
    description: 'A person, their follow state and their posts.',
    load: () => import('./screens/Profile.svelte'),
  },
]);
