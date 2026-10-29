<script lang="ts">
import { ArrowLeft, Globe, MapPin, Pencil, Trash2, Users } from '@lucide/svelte';
import type { RouteProps } from '@protoyard/renderer-svelte';
import {
  avatarImage,
  back,
  can,
  Link,
  liveQuery,
  navigate,
  runService,
} from '@protoyard/renderer-svelte';
import { AlertDialog, Avatar, Badge, Button, Card, EmptyState, LoadingState } from '@protoyard/ui';
import { Icon } from 'texuli/icons';
import { LucideIcon } from 'texuli/icons/lucide';
import CompanyDialog from '../components/CompanyDialog.svelte';
import ContactDialog from '../components/ContactDialog.svelte';
import DealDialog from '../components/DealDialog.svelte';
import StageBadge from '../components/StageBadge.svelte';
import { CAPABILITIES } from '../domain/policy.ts';
import { useCrm } from '../lib/context.ts';
import { money } from '../lib/format.ts';

let { params }: RouteProps = $props();
const { db, services } = useCrm();
const id = $derived(params.id ?? '');
const currentId = () => params.id ?? '';

const company = liveQuery(() => db.companies.get(currentId()), { deps: currentId });
const contacts = liveQuery(() => db.contacts.where('companyId').equals(currentId()).toArray(), {
  initial: [],
  deps: currentId,
});
const deals = liveQuery(() => db.deals.where('companyId').equals(currentId()).toArray(), {
  initial: [],
  deps: currentId,
});

let editOpen = $state(false);
let contactOpen = $state(false);
let dealOpen = $state(false);
let deleteOpen = $state(false);
</script>

{#if company.loading}
  <LoadingState label="Loading company…" />
{:else if !company.current}
  <EmptyState title="Company not found" description="It may have been deleted, or another scenario is loaded.">
    {#snippet action()}<Button href="#/companies">Back to companies</Button>{/snippet}
  </EmptyState>
{:else}
  {@const c = company.current}
  <Button type="button" variant="ghost" onclick={() => back('/companies')} class="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
    <LucideIcon icon={ArrowLeft} class="size-4" /> Back
  </Button>
  <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
    <div class="flex items-center gap-4">
      <Avatar name={c.name} size="lg" />
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">{c.name}</h1>
        <p class="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span class="inline-flex items-center gap-1"><LucideIcon icon={Globe} class="size-3.5" /> {c.domain}</span>
          {#if c.city}<span class="inline-flex items-center gap-1"><LucideIcon icon={MapPin} class="size-3.5" /> {c.city}</span>{/if}
          <span class="inline-flex items-center gap-1"><LucideIcon icon={Users} class="size-3.5" /> {c.employees.toLocaleString()} employees</span>
          <Badge variant="secondary">{c.industry}</Badge>
        </p>
      </div>
    </div>
    <div class="flex flex-wrap gap-2">
      {#if can(CAPABILITIES.companiesWrite)}
        <Button variant="outline" onclick={() => (editOpen = true)}><LucideIcon icon={Pencil} class="size-4" /> Edit</Button>
      {/if}
      {#if can(CAPABILITIES.companiesDelete)}
        <Button variant="outline" class="text-destructive" onclick={() => (deleteOpen = true)}><LucideIcon icon={Trash2} class="size-4" /> Delete</Button>
      {/if}
    </div>
  </div>

  <div class="mt-6 grid gap-6 lg:grid-cols-2">
    <Card class="p-5">
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-semibold">Deals <span class="font-normal text-muted-foreground">{(deals.current ?? []).length}</span></h2>
        {#if can(CAPABILITIES.dealsCreate)}
          <Button size="sm" variant="ghost" onclick={() => (dealOpen = true)} disabled={services.isPaywalled()}><Icon icon="plus" class="size-4" /> Deal</Button>
        {/if}
      </div>
      <ul class="mt-3 divide-y divide-border">
        {#each deals.current ?? [] as deal (deal.id)}
          <li>
            <Link href={`/deals/${deal.id}`} class="flex items-center justify-between gap-3 py-3 hover:text-primary">
              <span class="truncate text-sm font-medium">{deal.title}</span>
              <span class="flex shrink-0 items-center gap-2"><span class="text-sm tabular-nums">{money(deal.amount)}</span><StageBadge stage={deal.stage} /></span>
            </Link>
          </li>
        {:else}
          <li class="py-3 text-sm text-muted-foreground">No deals with this company yet.</li>
        {/each}
      </ul>
    </Card>

    <Card class="p-5">
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-semibold">Contacts <span class="font-normal text-muted-foreground">{(contacts.current ?? []).length}</span></h2>
        {#if can(CAPABILITIES.contactsWrite)}
          <Button size="sm" variant="ghost" onclick={() => (contactOpen = true)} disabled={services.isPaywalled()}><Icon icon="plus" class="size-4" /> Contact</Button>
        {/if}
      </div>
      <ul class="mt-3 divide-y divide-border">
        {#each contacts.current ?? [] as person (person.id)}
          <li class="flex items-center gap-3 py-3">
            <Avatar name={`${person.firstName} ${person.lastName}`} {...avatarImage(person.avatar)} size="sm" decorative />
            <div class="min-w-0 text-sm">
              <p class="truncate font-medium">{person.firstName} {person.lastName}</p>
              <p class="truncate text-muted-foreground">{person.title} · {person.email}</p>
            </div>
          </li>
        {:else}
          <li class="py-3 text-sm text-muted-foreground">No contacts yet.</li>
        {/each}
      </ul>
    </Card>
  </div>

  <CompanyDialog bind:open={editOpen} company={c} />
  <ContactDialog bind:open={contactOpen} companyId={id} />
  <DealDialog bind:open={dealOpen} companyId={id} />
  <AlertDialog
    bind:open={deleteOpen}
    title={`Delete ${c.name}?`}
    description={`This also deletes its ${(contacts.current ?? []).length} contacts, ${(deals.current ?? []).length} deals and their activity — in one transaction.`}
    confirmLabel="Delete company"
    destructive
    onConfirm={async () => {
      const result = await runService(() => services.companies.remove(c.id), { success: 'Company deleted' });
      if (result.ok) navigate('/companies', { replace: true });
      else throw result.error;
    }}
  />
{/if}
