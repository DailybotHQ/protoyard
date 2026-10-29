<script lang="ts">
import { CalendarCheck, CalendarPlus, Clock, UserCheck, UserX } from '@lucide/svelte';
import { can, Link, liveQuery, runService, useClock } from '@protoyard/renderer-svelte';
import { Button, EmptyState, Select, Skeleton, StatCard } from '@protoyard/ui';
import { LucideIcon } from 'texuli/icons/lucide';
import AppointmentDialog from '../components/AppointmentDialog.svelte';
import PageHeader from '../components/PageHeader.svelte';
import StatusBadge from '../components/StatusBadge.svelte';
import type { Appointment } from '../database/schema.ts';
import { checkInBlocker, patientName, waitMinutes } from '../domain/clinic.ts';
import { CAPABILITIES } from '../domain/policy.ts';
import { useClinic } from '../lib/context.ts';
import { formatLongDay, formatTime, isoDay } from '../lib/format.ts';

const { db, services } = useClinic();
const clock = useClock();

const day = $derived(isoDay(clock.now));
let providerId = $state('all');
const providers = liveQuery(() => db.providers.toArray(), { initial: [] });
// Re-runs when appointments change (services, scenario loads, the timeline) and when the day or filter changes.
const today = liveQuery(
  async () => {
    const rows = await db.appointments
      .where('start')
      .between(`${day}T00:00:00.000Z`, `${day}T23:59:59.999Z`, true, true)
      .toArray();
    const shown = rows
      .filter((a) => providerId === 'all' || a.providerId === providerId)
      .sort((a, b) =>
        a.start < b.start ? -1 : a.start > b.start ? 1 : a.providerId < b.providerId ? -1 : 1
      );
    const patients = await db.patients.bulkGet([...new Set(shown.map((a) => a.patientId))]);
    return {
      rows: shown,
      patients: new Map(patients.filter((p) => p !== undefined).map((p) => [p.id, p])),
    };
  },
  { initial: undefined, deps: () => [day, providerId] }
);

const rows = $derived(today.current?.rows ?? []);
const counts = $derived({
  total: rows.filter((a) => a.status !== 'cancelled').length,
  waiting: rows.filter((a) => a.status === 'checked-in').length,
  seen: rows.filter((a) => a.status === 'completed').length,
  noShow: rows.filter((a) => a.status === 'no-show').length,
});
const providerName = $derived(new Map((providers.current ?? []).map((p) => [p.id, p.name])));
const canManage = $derived(can(CAPABILITIES.appointmentsManage));

let bookOpen = $state(false);
let draft = $state<{ start: string; end: string; providerId?: string } | null>(null);

function openBooking() {
  // The next quarter hour from now, 30 minutes long.
  const quarter = 15 * 60_000;
  const start = new Date(Math.ceil((clock.now.getTime() + 1) / quarter) * quarter).toISOString();
  draft = {
    start,
    end: new Date(Date.parse(start) + 30 * 60_000).toISOString(),
    ...(providerId !== 'all' ? { providerId } : {}),
  };
  bookOpen = true;
}

const checkIn = (a: Appointment) =>
  runService(() => services.appointments.checkIn(a.id), {
    success: `${patientName(today.current?.patients.get(a.patientId))} checked in`,
  });
</script>

<PageHeader title="Front desk" description="{formatLongDay(clock.now.toISOString())} · times in UTC">
  {#snippet actions()}
    <label class="grid gap-1 text-xs text-muted-foreground">
      Provider
      <Select
        aria-label="Provider"
        items={[{ value: 'all', label: 'All providers' }, ...(providers.current ?? []).map((p) => ({ value: p.id, label: p.name }))]}
        bind:value={providerId}
      />
    </label>
    {#if canManage}
      <Button onclick={openBooking}><LucideIcon icon={CalendarPlus} class="size-4" />Book appointment</Button>
    {/if}
  {/snippet}
</PageHeader>

<section aria-label="Today at a glance" class="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
  <StatCard label="Appointments today" value={String(counts.total)} icon={CalendarCheck} />
  <StatCard label="Waiting" value={String(counts.waiting)} hint="Checked in, not yet seen" icon={Clock} />
  <StatCard label="Seen" value={String(counts.seen)} icon={UserCheck} />
  <StatCard label="No-shows" value={String(counts.noShow)} icon={UserX} />
</section>

<h2 class="mb-3 text-lg font-semibold">Today's appointments</h2>
{#if today.current === undefined}
  <div class="grid gap-2" aria-busy="true" aria-label="Loading appointments">
    {#each [0, 1, 2, 3] as i (i)}<Skeleton class="h-16 w-full" />{/each}
  </div>
{:else if rows.length === 0}
  <EmptyState title="No appointments today" description={canManage ? 'Book the first one, or pick another provider.' : 'Nothing is booked for today.'} />
{:else}
  <ul class="grid gap-2" aria-label="Today's appointments" data-front-desk-list="">
    {#each rows as a (a.id)}
      {@const patient = today.current.patients.get(a.patientId)}
      {@const blocker = checkInBlocker(a, clock.now)}
      {@const wait = waitMinutes(a, clock.now)}
      <li
        class="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3 sm:flex-row sm:items-center sm:justify-between"
        aria-label="{formatTime(a.start)} {patientName(patient)}"
        data-appointment={a.id}
      >
        <div class="flex min-w-0 items-start gap-3">
          <span class="w-20 shrink-0 text-sm font-medium tabular-nums">{formatTime(a.start)}</span>
          <div class="min-w-0">
            <p class="truncate font-medium">
              <Link href="/patients/{a.patientId}" class="hover:underline">{patientName(patient)}</Link>
              <span class="text-xs font-normal text-muted-foreground tabular-nums">{patient?.mrn}</span>
            </p>
            <p class="truncate text-sm text-muted-foreground">{a.reason} · {providerName.get(a.providerId) ?? a.providerId}</p>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-2 sm:justify-end">
          <StatusBadge status={a.status} />
          {#if wait > 0}
            <span class="text-xs text-muted-foreground tabular-nums">waiting {wait} min</span>
          {/if}
          {#if canManage && blocker === null}
            <Button size="sm" onclick={() => checkIn(a)}>Check in</Button>
          {/if}
          <Button size="sm" variant="ghost" href="#/visits/{a.id}">Open</Button>
        </div>
      </li>
    {/each}
  </ul>
{/if}

<AppointmentDialog bind:open={bookOpen} providers={providers.current ?? []} initial={draft} />
