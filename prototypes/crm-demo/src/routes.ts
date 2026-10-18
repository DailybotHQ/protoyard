import { defineRoutes } from '@protoyard/renderer-svelte';

/** Screens are loaded on demand and this data can be inspected without Svelte compilation. */
export const routes = defineRoutes([
  {
    path: '/',
    name: 'Dashboard',
    description: 'Review CRM activity and pipeline performance.',
    load: () => import('./screens/Dashboard.svelte'),
  },
  {
    path: '/pipeline',
    name: 'Pipeline',
    description: 'Review deals across pipeline stages.',
    load: () => import('./screens/Pipeline.svelte'),
  },
  {
    path: '/deals',
    name: 'Deals',
    description: 'Browse and manage CRM deals.',
    capability: 'deals:read',
    load: () => import('./screens/Deals.svelte'),
  },
  {
    path: '/deals/:id',
    name: 'Deal',
    description: 'Inspect an individual deal.',
    capability: 'deals:read',
    load: () => import('./screens/DealDetail.svelte'),
  },
  {
    path: '/companies',
    name: 'Companies',
    description: 'Browse CRM companies.',
    capability: 'companies:read',
    load: () => import('./screens/Companies.svelte'),
  },
  {
    path: '/companies/:id',
    name: 'Company',
    description: 'Inspect an individual company.',
    capability: 'companies:read',
    load: () => import('./screens/CompanyDetail.svelte'),
  },
  {
    path: '/contacts',
    name: 'Contacts',
    description: 'Browse CRM contacts.',
    capability: 'contacts:read',
    load: () => import('./screens/Contacts.svelte'),
  },
  {
    path: '/activity',
    name: 'Activity',
    description: 'Review recent CRM activity.',
    load: () => import('./screens/ActivityFeed.svelte'),
  },
  {
    path: '/team',
    name: 'Team & settings',
    description: 'Review team members and workspace settings.',
    load: () => import('./screens/Team.svelte'),
  },
]);
