import { defineRoutes } from '@protoyard/renderer-svelte';

/** The screen map is data-only; each screen (and the charts it uses) loads in its own chunk. */
export const routes = defineRoutes([
  {
    path: '/',
    name: 'Overview',
    description: 'Key metrics and the editable product dashboard.',
    load: () => import('./screens/Overview.svelte'),
  },
  {
    path: '/trends',
    name: 'Trends',
    description: 'Event and user trends with filters, breakdowns and saved segments.',
    load: () => import('./screens/Trends.svelte'),
  },
  {
    path: '/funnels',
    name: 'Funnels',
    description: 'The activation funnel with breakdowns and time to convert.',
    load: () => import('./screens/Funnels.svelte'),
  },
  {
    path: '/retention',
    name: 'Retention',
    description: 'Cohort retention by day or week.',
    load: () => import('./screens/Retention.svelte'),
  },
  {
    path: '/live',
    name: 'Live',
    description: 'A live counter on simulated time and the latest events.',
    load: () => import('./screens/Live.svelte'),
  },
  {
    path: '/reports',
    name: 'Reports',
    description: 'Saved Trends reports: open, rename and delete with ownership rules.',
    load: () => import('./screens/Reports.svelte'),
  },
  {
    path: '/alerts',
    name: 'Alerts',
    description: 'Daily metric alerts that fire as simulated time advances.',
    load: () => import('./screens/Alerts.svelte'),
  },
  {
    path: '/segments',
    name: 'Segments',
    description: 'Saved segments: rename and delete with ownership rules.',
    load: () => import('./screens/Segments.svelte'),
  },
]);
