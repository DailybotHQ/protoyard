<script lang="ts">
import { safeHref } from '@texuli/core/url-policy';
import { Button } from 'texuli/button';

// A Protoyard screen that renders a linked Texuli component and texel.
let { label = 'Save draft', href = 'https://example.com/help' }: { label?: string; href?: string } =
  $props();

let clicks = $state(0);
const safe = $derived(safeHref(href, 'untrusted'));
</script>

<Button onclick={() => (clicks += 1)}>{label}</Button>
<p data-clicks>{clicks}</p>
{#if safe}<a {href}>Help</a>{:else}<span data-blocked-link>Help</span>{/if}
