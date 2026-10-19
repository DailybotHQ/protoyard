import { defineRoutes } from '@protoyard/renderer-svelte';

/** The screen map is data-only; each screen (and the calendar view) loads in its own chunk. */
export const routes = defineRoutes([
  {
    path: '/',
    name: 'Calendar',
    description: 'The week calendar: book, move and cancel.',
    load: () => import('./screens/Calendar.svelte'),
  },
  {
    path: '/bookings',
    name: 'Bookings',
    description: 'Every booking, filtered by upcoming, past and cancelled.',
    load: () => import('./screens/Bookings.svelte'),
  },
  {
    path: '/book',
    name: 'Book online',
    description: 'The public booking page: pick a resource, a free slot and confirm.',
    load: () => import('./screens/BookOnline.svelte'),
  },
  {
    path: '/resources',
    name: 'Resources',
    description: 'Rooms and people with their weekly opening hours.',
    load: () => import('./screens/Resources.svelte'),
  },
]);
