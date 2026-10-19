<script lang="ts">
import { Bot, ChartNoAxesColumn, FlaskConical, History } from '@lucide/svelte';
import {
  avatarImage,
  createRouter,
  getRuntime,
  Router,
  useAppearance,
  usePrincipal,
} from '@protoyard/renderer-svelte';
import { LayoutHost, navFromSidebar } from '@protoyard/ui';
import { onDestroy } from 'svelte';
import { ROLE_LABELS } from './domain/policy.ts';
import AgentDetail from './screens/AgentDetail.svelte';
import Agents from './screens/Agents.svelte';
import DatasetDetail from './screens/DatasetDetail.svelte';
import Evaluations from './screens/Evaluations.svelte';
import RunDetail from './screens/RunDetail.svelte';
import Runs from './screens/Runs.svelte';
import Usage from './screens/Usage.svelte';

const principal = usePrincipal();
const runtime = getRuntime();
const appearance = useAppearance();

/** Hash routes work on refresh and back/forward on any static host. */
const router = createRouter(
  [
    { path: '/', component: Agents, title: 'Agents' },
    { path: '/agents/:id', component: AgentDetail, title: 'Agent' },
    { path: '/runs', component: Runs, title: 'Runs' },
    { path: '/runs/:id', component: RunDetail, title: 'Run trace' },
    { path: '/evaluations', component: Evaluations, title: 'Evaluations' },
    { path: '/datasets/:id', component: DatasetDetail, title: 'Dataset' },
    { path: '/usage', component: Usage, title: 'Usage' },
  ],
  { titleSuffix: 'Agent Console' }
);
onDestroy(() => router.destroy());

const nav = [
  { href: '#/', label: 'Agents', icon: Bot, exact: true },
  { href: '#/runs', label: 'Runs', icon: History },
  { href: '#/evaluations', label: 'Evaluations', icon: FlaskConical },
  { href: '#/usage', label: 'Usage & cost', icon: ChartNoAxesColumn },
];
const layoutNav = $derived(
  navFromSidebar(nav, {
    brand: { label: 'Agent Console', icon: 'bot' },
    ...(principal.current
      ? {
          user: {
            image: avatarImage(principal.current.persona.avatar),
            name: principal.current.persona.name,
            detail: ROLE_LABELS[principal.current.role ?? ''] ?? principal.current.role ?? '',
          },
        }
      : {}),
  })
);
</script>

<LayoutHost layout={appearance.current.layout.value} nav={layoutNav} storageKey={runtime.manifest.storage.namespace}>
  <div class="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
    <p class="mb-4 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
      Agents, models and tools are <strong>simulated</strong>: no model provider is called.
    </p>
    <Router {router} />
  </div>
</LayoutHost>
