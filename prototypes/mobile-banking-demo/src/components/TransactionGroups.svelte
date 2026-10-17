<script lang="ts">
import type { Transaction } from '../database/schema.ts';
import { groupByMonth } from '../lib/derive.ts';
import { formatMonth, formatSigned } from '../lib/format.ts';
import TransactionRow from './TransactionRow.svelte';

let {
  transactions,
  now,
  accountNames,
}: {
  transactions: readonly Transaction[];
  now: Date;
  /** When given, each row shows which account it belongs to. */
  accountNames?: Record<string, string>;
} = $props();

const groups = $derived(groupByMonth(transactions));
</script>

<div class="flex flex-col gap-5">
  {#each groups as group (group.key)}
    <section aria-labelledby={`month-${group.key}`}>
      <div class="sticky top-14 z-10 -mx-4 flex items-baseline justify-between bg-background/95 px-4 py-1.5 backdrop-blur">
        <h3 id={`month-${group.key}`} class="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {formatMonth(group.key)}
        </h3>
        <span class="text-xs text-muted-foreground tabular-nums">Net {formatSigned(group.netCents)}</span>
      </div>
      <ul class="divide-y divide-border">
        {#each group.items as transaction (transaction.id)}
          <TransactionRow {transaction} {now} accountName={accountNames?.[transaction.accountId]} />
        {/each}
      </ul>
    </section>
  {/each}
</div>
