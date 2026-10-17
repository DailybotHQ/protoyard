<script lang="ts">
import type { Account } from '../database/schema.ts';
import { ACCOUNT_TYPE_LABELS, formatMoney, LOW_BALANCE_CENTS } from '../lib/format.ts';
import AccountStatusBadge from './AccountStatusBadge.svelte';
import { ACCOUNT_ICONS } from './icons.ts';

let { account }: { account: Account } = $props();

const Icon = $derived(ACCOUNT_ICONS[account.type]);
const low = $derived(
  account.type !== 'credit' &&
    account.status === 'active' &&
    account.balanceCents < LOW_BALANCE_CENTS
);
</script>

<a
  href={`#/accounts/${account.id}`}
  class={[
    'flex w-64 shrink-0 snap-start flex-col gap-4 rounded-2xl border p-4 shadow-soft transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
    account.status === 'active'
      ? 'border-transparent bg-primary text-primary-foreground hover:bg-primary-hover'
      : 'border-border bg-surface text-foreground hover:bg-muted',
  ]}
  aria-label={`${account.name}, ${ACCOUNT_TYPE_LABELS[account.type]} ${account.masked}, balance ${formatMoney(account.balanceCents)}${account.status === 'active' ? '' : `, ${account.status}`}`}
>
  <div class="flex items-center justify-between gap-2">
    <span class="inline-flex items-center gap-2 text-sm font-medium">
      <Icon class="size-4" aria-hidden="true" />
      {account.name}
    </span>
    <AccountStatusBadge status={account.status} />
  </div>
  <div>
    <p class="text-2xl font-semibold tracking-tight tabular-nums">{formatMoney(account.balanceCents)}</p>
    <p class="mt-1 flex items-center gap-2 text-xs">
      <span>{ACCOUNT_TYPE_LABELS[account.type]} · {account.masked}</span>
      {#if low}
        <span class="rounded-full bg-warning px-1.5 py-px font-medium text-warning-foreground">Low balance</span>
      {/if}
    </p>
  </div>
</a>
