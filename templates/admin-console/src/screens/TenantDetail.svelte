<script lang="ts">
import { ArrowLeft } from '@lucide/svelte';
import { can, liveQuery, runService, useClock } from '@protoyard/renderer-svelte';
import {
  AlertDialog,
  Avatar,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorState,
  LoadingState,
} from '@protoyard/ui';
import PageHeader from '../components/PageHeader.svelte';
import ReasonDialog from '../components/ReasonDialog.svelte';
import StatusBadge from '../components/StatusBadge.svelte';
import { CAPABILITIES, ROLE_LABELS } from '../domain/policy.ts';
import { useAdmin } from '../lib/context.ts';
import { formatDate, formatDateTime, fromNow, plural, usd } from '../lib/format.ts';
import { type TenantPerson, tenantPeople } from '../lib/queries.ts';

let { params }: { params: { id?: string } } = $props();
const id = $derived(params.id ?? '');

const { db, services } = useAdmin();
const clock = useClock();
const tenant = liveQuery(() => db.tenants.get(id), { initial: undefined, deps: () => id });
const subscription = liveQuery(() => db.subscriptions.where('tenantId').equals(id).first(), {
  initial: undefined,
  deps: () => id,
});
const people = liveQuery(() => tenantPeople(db, id), { initial: [], deps: () => id });

let suspendOpen = $state(false);
let impersonateOpen = $state(false);
let target = $state<TenantPerson | null>(null);

const canSuspend = $derived(can(CAPABILITIES.tenantsSuspend));
const canBilling = $derived(can(CAPABILITIES.billingManage));
const canDisable = $derived(can(CAPABILITIES.usersDisable));
const canImpersonate = $derived(can(CAPABILITIES.usersImpersonate));

const reactivate = () =>
  runService(() => services.tenants.reactivate(id), { success: 'Tenant reactivated' });
const toggleCancel = (cancel: boolean, subscriptionId: string) =>
  runService(
    () =>
      cancel
        ? services.subscriptions.cancel(subscriptionId)
        : services.subscriptions.resume(subscriptionId),
    {
      success: cancel ? 'Cancellation scheduled' : 'Subscription resumed',
    }
  );
const setDisabled = (person: TenantPerson, disabled: boolean) =>
  runService(() => services.users.setDisabled(person.persona.id, disabled), {
    success: `${person.persona.name} ${disabled ? 'disabled' : 'enabled'}`,
  });
</script>

<a href="#/tenants" class="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
  <ArrowLeft class="size-4" aria-hidden="true" />Tenants
</a>

{#if tenant.loading}
  <LoadingState label="Loading tenant" class="py-16" />
{:else if tenant.error}
  <ErrorState title="Could not load this tenant" message={String(tenant.error)} />
{:else if !tenant.current}
  <EmptyState title="Tenant not found" description="It may belong to another scenario. Go back to the tenant list." />
{:else}
  {@const t = tenant.current}
  <PageHeader title={t.name} description={`${t.domain} · ${t.region} · customer since ${formatDate(t.createdAt)}`}>
    {#snippet actions()}
      <StatusBadge status={t.status} />
      {#if canSuspend && t.status === 'suspended'}
        <AlertDialog
          title={`Reactivate ${t.name}?`}
          description="Their people can use the product again right away. This is recorded in the audit log."
          confirmLabel="Reactivate"
          onConfirm={async () => {
            await reactivate();
          }}
        >
          {#snippet trigger({ props })}<Button {...props}>Reactivate</Button>{/snippet}
        </AlertDialog>
      {:else if canSuspend && t.status !== 'churned'}
        <Button variant="destructive" onclick={() => (suspendOpen = true)}>Suspend tenant</Button>
      {/if}
    {/snippet}
  </PageHeader>

  {#if t.status === 'suspended'}
    <p role="status" class="mb-6 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
      Suspended {t.suspendedAt ? formatDateTime(t.suspendedAt) : ''}: {t.suspendedReason}
    </p>
  {/if}

  <div class="grid gap-6 lg:grid-cols-[1fr_20rem]">
    <Card>
      <CardHeader>
        <CardTitle>People</CardTitle>
        <CardDescription>{plural((people.current ?? []).length, 'person')} in this tenant</CardDescription>
      </CardHeader>
      <CardContent>
        <ul class="divide-y divide-border">
          {#each people.current ?? [] as person (person.persona.id)}
            <li class="flex flex-wrap items-center justify-between gap-3 py-3">
              <span class="flex min-w-0 items-center gap-3">
                <Avatar name={person.persona.name} size="sm" decorative />
                <span class="min-w-0">
                  <span class="block truncate text-sm font-medium">{person.persona.name}</span>
                  <span class="block truncate text-xs text-muted-foreground">
                    {ROLE_LABELS[person.membership.role] ?? person.membership.role} · seen {fromNow(person.access.lastSeenAt, clock.now)}
                  </span>
                </span>
              </span>
              <span class="flex items-center gap-2">
                {#if person.access.disabled}<StatusBadge status="disabled" />{/if}
                {#if canDisable}
                  <Button size="sm" variant="ghost" onclick={() => setDisabled(person, !person.access.disabled)}>
                    {person.access.disabled ? 'Enable' : 'Disable'}
                  </Button>
                {/if}
                {#if canImpersonate}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={person.access.disabled}
                    aria-label={`Impersonate ${person.persona.name}`}
                    onclick={() => {
                      target = person;
                      impersonateOpen = true;
                    }}
                  >Impersonate</Button>
                {/if}
              </span>
            </li>
          {:else}
            <li class="py-3 text-sm text-muted-foreground">Nobody joined this tenant yet.</li>
          {/each}
        </ul>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Subscription</CardTitle>
        <CardDescription>Simulated billing: no card or payment processor exists.</CardDescription>
      </CardHeader>
      <CardContent class="grid gap-3 text-sm">
        {#if subscription.current}
          {@const s = subscription.current}
          <div class="flex items-center justify-between"><span>Plan</span><span class="font-medium capitalize">{s.plan}</span></div>
          <div class="flex items-center justify-between"><span>Status</span><StatusBadge status={s.status} /></div>
          <div class="flex items-center justify-between"><span>Seats</span><span>{s.seats}</span></div>
          <div class="flex items-center justify-between"><span>MRR</span><span class="tabular-nums">{usd(s.mrrCents)}</span></div>
          {#if s.status !== 'canceled'}
            <div class="flex items-center justify-between">
              <span>{s.cancelAtPeriodEnd ? 'Ends' : 'Renews'}</span><span>{formatDate(s.renewsAt)}</span>
            </div>
            {#if canBilling}
              {#if s.cancelAtPeriodEnd}
                <Button variant="outline" onclick={() => toggleCancel(false, s.id)}>Resume subscription</Button>
              {:else}
                <AlertDialog
                  title="Cancel at period end?"
                  description={`${t.name} keeps access until ${formatDate(s.renewsAt)}, then the subscription ends. You can resume before then.`}
                  confirmLabel="Schedule cancellation"
                  destructive
                  onConfirm={async () => {
                    await toggleCancel(true, s.id);
                  }}
                >
                  {#snippet trigger({ props })}<Button variant="outline" {...props}>Cancel subscription</Button>{/snippet}
                </AlertDialog>
              {/if}
            {/if}
          {/if}
        {:else}
          <p class="text-muted-foreground">No subscription.</p>
        {/if}
      </CardContent>
    </Card>
  </div>

  <ReasonDialog
    bind:open={suspendOpen}
    title={`Suspend ${t.name}?`}
    description="Everyone in this tenant loses access until a staff member reactivates it."
    confirmLabel="Suspend tenant"
    destructive
    success="Tenant suspended"
    action={(reason) => services.tenants.suspend(t.id, { reason })}
  />
  <ReasonDialog
    bind:open={impersonateOpen}
    title={`Impersonate ${target?.persona.name ?? ''}?`}
    description="You'll see the product as this person (simulated). The reason and every start and stop go to the audit log."
    confirmLabel="Start impersonating"
    success={`Now viewing as ${target?.persona.name ?? ''}`}
    action={(reason) => services.impersonation.start(target?.persona.id ?? '', { reason })}
  />
{/if}
