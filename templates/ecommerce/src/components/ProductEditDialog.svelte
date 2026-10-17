<script lang="ts">
import { isValidationError, runService } from '@protoyard/renderer-svelte';
import { Button, Dialog, FormField, Input } from '@protoyard/ui';
import type { Product } from '../database/schema.ts';
import { centsToInput } from '../domain/catalog.ts';
import { useShop } from '../lib/context.ts';

/** Admin edit of price, "was" price and stock. Errors from the service's zod schema render inline. */
let { open = $bindable(false), product = null }: { open?: boolean; product?: Product | null } =
  $props();

const { services } = useShop();
let price = $state('');
let compareAt = $state('');
let stock = $state('');
let errors = $state<Record<string, string>>({});
let saving = $state(false);

$effect(() => {
  if (open && product) {
    price = centsToInput(product.priceCents);
    compareAt = product.compareAtCents ? centsToInput(product.compareAtCents) : '';
    stock = String(product.stock);
    errors = {};
  }
});

async function submit(event: SubmitEvent) {
  event.preventDefault();
  if (!product) return;
  const id = product.id;
  saving = true;
  errors = {};
  const result = await runService(() => services.products.update(id, { price, compareAt, stock }), {
    success: `Updated ${product.name}`,
  });
  saving = false;
  if (result.ok) open = false;
  else if (isValidationError(result.error)) errors = result.error.issues;
}
</script>

<Dialog bind:open title={product ? `Edit ${product.name}` : 'Edit product'} description="Changes apply to the storefront immediately. Orders keep the price they were placed at.">
  <form id="product-form" class="grid gap-4 sm:grid-cols-3" onsubmit={submit} novalidate>
    <FormField label="Price (USD)" required error={errors.price}>
      {#snippet children(control)}
        <Input {...control.props} inputmode="decimal" bind:value={price} placeholder="24.99" />
      {/snippet}
    </FormField>
    <FormField label="Was price" description="Optional, shows a sale" error={errors.compareAt}>
      {#snippet children(control)}
        <Input {...control.props} inputmode="decimal" bind:value={compareAt} placeholder="—" />
      {/snippet}
    </FormField>
    <FormField label="Stock" required error={errors.stock}>
      {#snippet children(control)}
        <Input {...control.props} type="number" inputmode="numeric" min="0" step="1" bind:value={stock} />
      {/snippet}
    </FormField>
  </form>
  {#snippet footer()}
    <Button variant="ghost" onclick={() => (open = false)}>Cancel</Button>
    <Button type="submit" form="product-form" loading={saving}>Save changes</Button>
  {/snippet}
</Dialog>
