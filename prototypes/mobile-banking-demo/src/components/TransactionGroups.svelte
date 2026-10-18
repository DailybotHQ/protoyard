<script lang="ts">
import type { Transaction } from '../database/schema.ts';
import { groupByMonth } from '../lib/derive.ts';
import { formatMonth, formatSigned } from '../lib/format.ts';
import TransactionRow from './TransactionRow.svelte';

let {
  transactions,
  now,
  accountNames,
  headingLevel = 3,
}: {
  transactions: readonly Transaction[];
  now: Date;
  /** When given, each row shows which account it belongs to. */
  accountNames?: Record<string, string>;
  /** Month heading level, so it follows the screen's outline. */
  headingLevel?: 2 | 3;
} = $props();

const groups = $derived(groupByMonth(transactions));
</script>

<div class="flex flex-col gap-5">
  {#each groups as group (group.key)}
    <section aria-labelledby={`month-${group.key}`}>
      <!-- Offset clears MobileHeader (min-h-14 + safe-area top) inside the shell scroll main. -->
      <div
        class="sticky top-[calc(3.5rem+env(safe-area-inset-top,0px))] z-10 -mx-4 flex items-baseline justify-between bg-background/95 px-4 py-1.5 backdrop-blur"
      >
        <svelte:element this={`h${headingLevel}`} id={`month-${group.key}`} class="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {formatMonth(group.key)}
        </svelte:element>
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
