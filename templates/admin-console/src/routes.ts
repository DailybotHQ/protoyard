import { defineRoutes } from '@protoyard/renderer-svelte';
import { CAPABILITIES } from './domain/policy.ts';

/** The console's screen map is data-only; each screen loads in its own chunk. */
export const routes = defineRoutes([
  {
    path: '/',
    name: 'Overview',
    description: 'Platform health: tenants, people, revenue and recent staff actions.',
    capability: CAPABILITIES.read,
    load: () => import('./screens/Overview.svelte'),
  },
  {
    path: '/tenants',
    name: 'Tenants',
    description: 'Every customer organization, filterable by status and plan.',
    capability: CAPABILITIES.read,
    load: () => import('./screens/Tenants.svelte'),
  },
  {
    path: '/tenants/:id',
    name: 'Tenant',
    description: 'One tenant: people, subscription, suspension and impersonation.',
    capability: CAPABILITIES.read,
    load: () => import('./screens/TenantDetail.svelte'),
  },
  {
    path: '/users',
    name: 'Users',
    description: 'People across all tenants.',
    capability: CAPABILITIES.read,
    load: () => import('./screens/Users.svelte'),
  },
  {
    path: '/audit',
    name: 'Audit log',
    description: 'Every staff action, newest first.',
    capability: CAPABILITIES.read,
    load: () => import('./screens/Audit.svelte'),
  },
]);
