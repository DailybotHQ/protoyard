<script lang="ts">
import { Pagination } from '@protoyard/ui';

const invoices = Array.from({ length: 47 }, (_, index) => ({
  id: `INV-${String(2000 + index)}`,
  amount: ((index * 37) % 900) + 100,
}));
const PAGE_SIZE = 5;

let page = $state(1);
let bigPage = $state(6);
let compactPage = $state(2);
const visible = $derived(invoices.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE));
</script>

<div class="grid gap-6">
  <div class="grid gap-2">
    <p class="text-xs text-muted-foreground">With data ({invoices.length} invoices, 5 per page)</p>
    <ul class="grid max-w-sm divide-y divide-border rounded-lg border border-border bg-surface text-sm">
      {#each visible as invoice (invoice.id)}
        <li class="flex justify-between px-3 py-2">
          <span>{invoice.id}</span>
          <span class="tabular-nums text-muted-foreground">${invoice.amount}.00</span>
        </li>
      {/each}
    </ul>
    <Pagination bind:page total={invoices.length} pageSize={PAGE_SIZE} label="Invoice pages" />
  </div>
  <div class="grid gap-2">
    <p class="text-xs text-muted-foreground">Many pages with ellipses (page {bigPage} of 40)</p>
    <Pagination bind:page={bigPage} pageCount={40} label="Search result pages" />
  </div>
  <div class="grid gap-2">
    <p class="text-xs text-muted-foreground">Compact</p>
    <Pagination bind:page={compactPage} pageCount={8} compact label="Compact pages" />
  </div>
</div>
