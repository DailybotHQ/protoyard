<script lang="ts">
import {
  createRouter,
  liveQuery,
  Router,
  useAppearance,
  useClock,
  usePrincipal,
} from '@protoyard/renderer-svelte';
import { LayoutHost, type NavModel } from '@protoyard/ui';
import { onDestroy } from 'svelte';
import { provideLogistics } from './lib/context.svelte.ts';
import Dispatch from './screens/Dispatch.svelte';
import Schedule from './screens/Schedule.svelte';

const logistics = provideLogistics();
const appearance = useAppearance();
const principal = usePrincipal();
const clock = useClock();
const router = createRouter(
  [
    { path: '/', component: Dispatch, title: 'Dispatch map' },
    { path: '/schedule', component: Schedule, title: 'Route timeline' },
  ],
  { titleSuffix: logistics.runtime.manifest.name }
);
onDestroy(() => router.destroy());
const vehicles = liveQuery(() => logistics.db.vehicles.toArray(), { initial: [] });
const nav = $derived({
  brand: {
    label: principal.current?.organization?.name ?? 'Harbor Dispatch',
    href: '#/',
    icon: 'truck',
  },
  sections: [
    {
      id: 'dispatch',
      items: [
        { id: 'map', label: 'Live map', href: '#/', icon: 'map', exact: true },
        { id: 'routes', label: 'Route timeline', href: '#/schedule', icon: 'calendar' },
      ],
    },
  ],
  user: principal.current
    ? { name: principal.current.persona.name, detail: principal.current.role ?? 'Operator' }
    : undefined,
} satisfies NavModel);
</script>

<LayoutHost layout={appearance.current.layout.value} nav={nav} storageKey={logistics.runtime.manifest.storage.namespace}>
  <div class="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
    <p class="mb-4 text-xs text-muted-foreground">Simulated time · {clock.now.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })} UTC · {vehicles.current?.length ?? 0} vehicles</p>
    <Router {router} />
  </div>
</LayoutHost>
