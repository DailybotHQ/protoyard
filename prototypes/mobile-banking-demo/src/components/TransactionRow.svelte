<script lang="ts">
import { LucideIcon } from 'texuli/icons/lucide';
import type { Transaction } from '../database/schema.ts';
import { CATEGORY_LABELS, formatDay, formatSigned } from '../lib/format.ts';
import { CATEGORY_ICONS } from './icons.ts';

let {
  transaction,
  now,
  accountName,
}: { transaction: Transaction; now: Date; accountName?: string } = $props();

const CategoryGlyph = $derived(CATEGORY_ICONS[transaction.category]);
const pending = $derived(transaction.status === 'pending');
const incoming = $derived(transaction.amountCents > 0);
</script>

<li class="flex min-h-14 items-center gap-3 py-2.5">
  <span
    class={[
      'grid size-10 shrink-0 place-items-center rounded-full',
      incoming ? 'bg-success text-success-foreground' : 'bg-muted text-muted-foreground',
    ]}
    aria-hidden="true"
  >
    <LucideIcon icon={CategoryGlyph} class="size-4" />
  </span>
  <div class="min-w-0 flex-1">
    <p class="truncate text-sm font-medium">{transaction.description}</p>
    <p class="truncate text-xs text-muted-foreground">
      {formatDay(transaction.at, now)} · {CATEGORY_LABELS[transaction.category]}{accountName
        ? ` · ${accountName}`
        : ''}
    </p>
  </div>
  <div class="text-right">
    <p
      class={[
        'text-sm font-semibold tabular-nums',
        incoming && 'text-success',
        pending && 'text-muted-foreground italic',
      ]}
    >
      {formatSigned(transaction.amountCents)}
    </p>
    {#if pending}
      <p class="text-xs font-medium text-warning-foreground">
        <span class="rounded-full bg-warning px-1.5 py-px">Pending</span>
      </p>
    {/if}
  </div>
</li>
