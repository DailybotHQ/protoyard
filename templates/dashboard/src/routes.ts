import { defineRoutes } from '@protoyard/renderer-svelte';

/** The dashboard's screen map is data-only; each screen loads in its own chunk. */
export const routes = defineRoutes([
  {
    path: '/',
    name: 'Overview',
    description: 'Review workspace performance and recent activity.',
    load: () => import('./screens/Overview.svelte'),
  },
  {
    path: '/customers',
    name: 'Customers',
    description: 'Browse workspace customers.',
    capability: 'customers:read',
    load: () => import('./screens/Customers.svelte'),
  },
  {
    path: '/customers/:id',
    name: 'Customer',
    description: 'Inspect an individual customer.',
    capability: 'customers:read',
    load: () => import('./screens/CustomerDetail.svelte'),
  },
  {
    path: '/orders',
    name: 'Orders',
    description: 'Browse and manage workspace orders.',
    capability: 'orders:read',
    load: () => import('./screens/Orders.svelte'),
  },
  {
    path: '/settings',
    name: 'Settings',
    description: 'Manage workspace preferences.',
    capability: 'settings:read',
    load: () => import('./screens/Settings.svelte'),
  },
]);
