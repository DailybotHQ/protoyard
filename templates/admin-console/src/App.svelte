<script lang="ts">
import { Building2, LayoutDashboard, ScrollText, ShieldCheck, Users } from '@lucide/svelte';
import {
  avatarImage,
  can,
  createRouter,
  Router,
  useAppearance,
  usePrincipal,
} from '@protoyard/renderer-svelte';
import { EmptyState, LayoutHost, navFromSidebar } from '@protoyard/ui';
import { onDestroy } from 'svelte';
import ImpersonationBanner from './components/ImpersonationBanner.svelte';
import { CAPABILITIES, ROLE_LABELS } from './domain/policy.ts';
import { provideAdmin } from './lib/context.ts';
import { routes } from './routes.ts';
import ImpersonatedView from './screens/ImpersonatedView.svelte';

const { runtime, impersonation } = provideAdmin();
const principal = usePrincipal();
const appearance = useAppearance();

/** Hash routes work on refresh and back/forward on any static host. Add screens here AND in `nav`. */
const router = createRouter(routes, { titleSuffix: runtime.manifest.name });
onDestroy(() => router.destroy());

const nav = $derived([
  { href: '#/', label: 'Overview', icon: LayoutDashboard, active: router.isActive('/', true) },
  { href: '#/tenants', label: 'Tenants', icon: Building2, active: router.isActive('/tenants') },
  { href: '#/users', label: 'Users', icon: Users, active: router.isActive('/users') },
  { href: '#/audit', label: 'Audit log', icon: ScrollText, active: router.isActive('/audit') },
]);
const staff = $derived(can(CAPABILITIES.read));
const layoutNav = $derived(
  navFromSidebar(nav, {
    brand: { label: principal.current?.organization?.name ?? 'Admin Console', icon: 'shield' },
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

<ImpersonationBanner />

{#if impersonation.current}
  <ImpersonatedView />
{:else if !staff}
  <div class="mx-auto max-w-lg p-8">
    <EmptyState
      icon={ShieldCheck}
      title="No console access"
      description="This persona is not on the staff team. Switch to a staff persona in DevTools, or load a scenario."
    />
  </div>
{:else}
  <LayoutHost layout={appearance.current.layout.value} nav={layoutNav} storageKey={runtime.manifest.storage.namespace}>
    <div class="mx-auto w-full max-w-7xl px-4 py-6 pb-safe sm:px-6 lg:px-8">
      <Router {router} />
    </div>
  </LayoutHost>
{/if}
