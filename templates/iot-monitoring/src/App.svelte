<script lang="ts">
import {
  avatarImage,
  createRouter,
  Router,
  useAppearance,
  usePrincipal,
} from '@protoyard/renderer-svelte';
import { LayoutHost, type NavModel } from '@protoyard/ui';
import { onDestroy } from 'svelte';
import { provideMonitoring } from './lib/context.svelte.ts';
import Alerts from './screens/Alerts.svelte';
import Overview from './screens/Overview.svelte';

const { runtime } = provideMonitoring();
const appearance = useAppearance();
const principal = usePrincipal();
const router = createRouter(
  [
    { path: '/', component: Overview, title: 'Overview' },
    { path: '/alerts', component: Alerts, title: 'Alerts and incidents' },
  ],
  { titleSuffix: runtime.manifest.name }
);
onDestroy(() => router.destroy());
const nav = $derived({
  brand: { label: 'Northstar Field Systems', href: '#/', icon: 'activity' },
  sections: [
    {
      id: 'monitoring',
      items: [
        { id: 'overview', label: 'Device map', href: '#/', icon: 'map', exact: true },
        { id: 'alerts', label: 'Alerts and incidents', href: '#/alerts', icon: 'bell' },
      ],
    },
  ],
  user: principal.current
    ? {
        image: avatarImage(principal.current.persona.avatar),
        name: principal.current.persona.name,
        detail: principal.current.role ?? 'Operator',
      }
    : undefined,
} satisfies NavModel);
</script>

<LayoutHost layout={appearance.current.layout.value} nav={nav} storageKey={runtime.manifest.storage.namespace}>
  <div class="mx-auto w-full max-w-7xl px-4 py-6 pb-safe sm:px-6 lg:px-8">
    <Router {router} />
  </div>
</LayoutHost>
