<script lang="ts">
import { ReceiptText } from '@lucide/svelte';
import { liveQuery, type RouteProps, useClock } from '@protoyard/renderer-svelte';
import { Button, EmptyState, Select, Skeleton } from '@protoyard/ui';
import Page from '../components/Page.svelte';
import Segmented from '../components/Segmented.svelte';
import TransactionGroups from '../components/TransactionGroups.svelte';
import { CATEGORIES, type Category } from '../database/schema.ts';
import { useBank } from '../lib/context.ts';
import { type Direction, matchesFilter, sortAccounts } from '../lib/derive.ts';
import { CATEGORY_LABELS } from '../lib/format.ts';

let { query }: RouteProps = $props();

const PAGE = 30;
const { db } = useBank();
const clock = useClock();

const accounts = liveQuery(() => db.accounts.toArray());
const transactions = liveQuery(() => db.transactions.orderBy('at').reverse().toArray());

// svelte-ignore state_referenced_locally
let accountId = $state(query.get('account') ?? '');
let category = $state<Category | ''>('');
let direction = $state<Direction>('all');
let limit = $state(PAGE);

const accountList = $derived(sortAccounts(accounts.current ?? []));
const names = $derived(Object.fromEntries(accountList.map((a) => [a.id, a.name])));
const accountItems = $derived([
  { value: '', label: 'All accounts' },
  ...accountList.map((a) => ({ value: a.id, label: `${a.name} ${a.masked}` })),
]);
const categoryItems = [
  { value: '', label: 'All categories' },
  ...CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] })),
];
const filtered = $derived(
  (transactions.current ?? []).filter((t) => matchesFilter(t, { accountId, category, direction }))
);
const visible = $derived(filtered.slice(0, limit));
const hasMore = $derived(filtered.length > visible.length);

// New filters start from the first page again.
$effect(() => {
  void accountId;
  void category;
  void direction;
  limit = PAGE;
});

let sentinel = $state<HTMLElement | null>(null);
$effect(() => {
  if (!sentinel || !hasMore || typeof IntersectionObserver === 'undefined') return;
  const observer = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) limit += PAGE;
  });
  observer.observe(sentinel);
  return () => observer.disconnect();
});
</script>

<Page title="Activity" subtitle="Every account, newest first">
  <div class="flex flex-col gap-2">
    <div class="grid grid-cols-2 gap-2">
      <Select items={accountItems} bind:value={accountId} aria-label="Filter by account" />
      <Select items={categoryItems} bind:value={category} aria-label="Filter by category" />
    </div>
    <Segmented
      label="Direction"
      bind:value={direction}
      options={[
        { value: 'all', label: 'All' },
        { value: 'in', label: 'Money in' },
        { value: 'out', label: 'Money out' },
      ]}
    />
  </div>

  <p class="text-xs text-muted-foreground" aria-live="polite">
    {#if !transactions.loading}
      Showing {visible.length} of {filtered.length} transaction{filtered.length === 1 ? '' : 's'}
    {/if}
  </p>

  {#if transactions.loading}
    <div class="flex flex-col gap-3">{#each [1, 2, 3, 4] as n (n)}<Skeleton class="h-12" />{/each}</div>
  {:else if filtered.length === 0}
    <EmptyState
      icon={ReceiptText}
      title={(transactions.current?.length ?? 0) === 0 ? 'No activity yet' : 'Nothing matches'}
      description={(transactions.current?.length ?? 0) === 0
        ? 'Deposits, payments and transfers will appear here.'
        : 'Change the filters to see more.'}
    />
  {:else}
    <TransactionGroups transactions={visible} now={clock.now} accountNames={names} />
    {#if hasMore}
      <div bind:this={sentinel} class="flex justify-center">
        <Button variant="outline" onclick={() => (limit += PAGE)}>Load more</Button>
      </div>
    {:else}
      <p class="text-center text-xs text-muted-foreground">You've reached the beginning of your history.</p>
    {/if}
  {/if}
</Page>
