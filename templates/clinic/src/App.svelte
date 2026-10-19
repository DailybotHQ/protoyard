<script lang="ts">
import { CalendarDays, ClipboardList, ShieldCheck, Stethoscope, Users } from '@lucide/svelte';
import { createRouter, Router, usePrincipal } from '@protoyard/renderer-svelte';
import { AppShell, Avatar, Badge, Header, Sidebar } from '@protoyard/ui';
import { onDestroy } from 'svelte';
import SimulationBanner from './components/SimulationBanner.svelte';
import { ROLE_LABELS } from './domain/policy.ts';
import { provideClinic } from './lib/context.ts';
import { routes } from './routes.ts';

const { runtime } = provideClinic();
const principal = usePrincipal();

/** Hash routes work on refresh and back/forward on any static host. Add screens here AND in `nav`. */
const router = createRouter(routes, { titleSuffix: runtime.manifest.name });
onDestroy(() => router.destroy());

const nav = $derived([
  {
    href: '#/',
    label: 'Front desk',
    icon: ClipboardList,
    active: router.isActive('/', true) || router.isActive('/visits'),
  },
  {
    href: '#/schedule',
    label: 'Schedule',
    icon: CalendarDays,
    active: router.isActive('/schedule'),
  },
  { href: '#/patients', label: 'Patients', icon: Users, active: router.isActive('/patients') },
  { href: '#/audit', label: 'Audit log', icon: ShieldCheck, active: router.isActive('/audit') },
]);
const clinicName = $derived(principal.current?.organization?.name ?? 'Clinic');
</script>

<AppShell sidebarLabel="Main navigation">
  {#snippet sidebar()}
    <Sidebar items={nav} label="Sections" collapsible={false}>
      {#snippet header()}
        <a href="#/" class="flex min-w-0 items-center gap-2.5 rounded-md px-1">
          <span class="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm" aria-hidden="true">
            <Stethoscope class="size-4" />
          </span>
          <span class="truncate text-sm font-semibold">{clinicName}</span>
        </a>
      {/snippet}
      {#snippet footer()}
        {#if principal.current}
          <!-- Bottom margin keeps the card clear of the fixed "Prototype" badge. -->
          <div class="mb-8 flex items-center gap-3 rounded-lg border border-sidebar-border bg-surface p-3">
            <Avatar name={principal.current.persona.name} src={principal.current.persona.avatar} size="sm" />
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium">{principal.current.persona.name}</p>
              <p class="truncate text-xs text-muted-foreground">{principal.current.persona.title}</p>
            </div>
            <Badge variant={principal.current.role === 'viewer' ? 'outline' : 'secondary'}>
              {ROLE_LABELS[principal.current.role ?? ''] ?? principal.current.role}
            </Badge>
          </div>
        {/if}
      {/snippet}
    </Sidebar>
  {/snippet}

  {#snippet header()}
    <Header class="lg:hidden" title={clinicName} />
  {/snippet}

  <div class="mx-auto w-full max-w-7xl px-4 py-6 pb-safe sm:px-6 lg:px-8">
    <SimulationBanner />
    <Router {router} />
  </div>
</AppShell>
