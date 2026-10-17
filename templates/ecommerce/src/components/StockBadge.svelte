<script lang="ts">
import { Badge } from '@protoyard/ui';
import type { Product } from '../database/schema.ts';
import { stockState } from '../domain/catalog.ts';

let { product, showInStock = false }: { product: Pick<Product, 'stock'>; showInStock?: boolean } =
  $props();
const level = $derived(stockState(product));
</script>

{#if level === 'sold-out'}
  <Badge variant="destructive">Sold out</Badge>
{:else if level === 'low'}
  <Badge variant="warning">Only {product.stock} left</Badge>
{:else if showInStock}
  <Badge variant="success">In stock</Badge>
{/if}
