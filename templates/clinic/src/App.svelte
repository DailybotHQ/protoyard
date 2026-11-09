<script lang="ts">
import { CalendarDays, ClipboardList, ShieldCheck, Stethoscope, Users } from '@lucide/svelte';
import { createRouter, Router, usePrincipal } from '@protoyard/renderer-svelte';
import { AppShell, Avatar, Badge, Header, Sidebar } from '@protoyard/ui';
import { onDestroy } from 'svelte';
import { LucideIcon } from 'texuli/icons/lucide';
import { Box, Text } from 'texuli/typography';
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
        <a href="#/" class="flex min-w-0 items-center gap-2.5 px-1">
          <Box surface="muted" radius="lg" padding="none" elevation="sm" class="grid size-8 shrink-0 place-items-center" aria-hidden="true">
            <LucideIcon icon={Stethoscope} tone="primary" class="size-4" />
          </Box>
          <Text as="span" size="sm" weight="semibold" truncate>{clinicName}</Text>
        </a>
      {/snippet}
      {#snippet footer()}
        {#if principal.current}
          <!-- Bottom margin keeps the card clear of the fixed "Prototype" badge. -->
          <Box surface="default" border="default" radius="lg" padding="none" class="mb-8 flex items-center gap-3 p-3">
            <Avatar name={principal.current.persona.name} src={principal.current.persona.avatar} size="sm" />
            <div class="min-w-0 flex-1">
              <Text size="sm" weight="medium" truncate>{principal.current.persona.name}</Text>
              <Text size="xs" tone="muted" truncate>{principal.current.persona.title}</Text>
            </div>
            <Badge variant={principal.current.role === 'viewer' ? 'outline' : 'secondary'}>
              {ROLE_LABELS[principal.current.role ?? ''] ?? principal.current.role}
            </Badge>
          </Box>
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
