import { defineRoutes } from '@protoyard/renderer-svelte';

/** The screen map is data-only; each screen (and the calendar view) loads in its own chunk. */
export const routes = defineRoutes([
  {
    path: '/',
    name: 'Front desk',
    description: "Today's appointments: check patients in, see who is waiting, book and cancel.",
    load: () => import('./screens/FrontDesk.svelte'),
  },
  {
    path: '/schedule',
    name: 'Schedule',
    description: 'Provider schedules on a week calendar; click a free slot to book.',
    load: () => import('./screens/Schedule.svelte'),
  },
  {
    path: '/patients',
    name: 'Patients',
    description: 'Search fictional patients and register new ones.',
    load: () => import('./screens/Patients.svelte'),
  },
  {
    path: '/patients/:id',
    name: 'Patient',
    description: 'One patient: details with masked sensitive fields, appointments and visit notes.',
    load: () => import('./screens/PatientDetail.svelte'),
  },
  {
    path: '/visits/:id',
    name: 'Visit',
    description: 'One appointment: check-in and the plain-text visit note (write, save, sign).',
    load: () => import('./screens/Visit.svelte'),
  },
  {
    path: '/audit',
    name: 'Audit log',
    description: 'Who did what, when; sensitive values are always redacted.',
    load: () => import('./screens/Audit.svelte'),
  },
]);
