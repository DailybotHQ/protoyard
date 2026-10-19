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
    path: '/layouts',
    name: 'Layout gallery',
    description: 'Compare the workspace across supported layouts and themes.',
    load: () => import('./screens/LayoutGallery.svelte'),
  },
  {
    path: '/playbook',
    name: 'Operations playbook',
    description: 'Read the workspace guide in a documentation layout.',
    load: () => import('./screens/Playbook.svelte'),
  },
  {
    path: '/access',
    name: 'Simulated access',
    description: 'Preview a split sign-in surface and learn the simulation boundary.',
    load: () => import('./screens/Access.svelte'),
  },
  {
    path: '/onboarding',
    name: 'Workspace tour',
    description: 'Walk through a three-step workspace orientation.',
    load: () => import('./screens/Onboarding.svelte'),
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
