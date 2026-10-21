<script lang="ts">
import type { Snippet } from 'svelte';
import type { HTMLAnchorAttributes } from 'svelte/elements';
import type { Router } from './hash-router.svelte.ts';
import { toHref } from './match.ts';

/**
 * `<Link href="/deals/1">` → `<a href="#/deals/1">`. With a `router`, the
 * link gets `aria-current="page"` and `activeClass` when it matches.
 */
let {
  href,
  router,
  exact = false,
  activeClass = '',
  class: className = '',
  children,
  ...rest
}: Omit<HTMLAnchorAttributes, 'href'> & {
  href: string;
  router?: Router;
  exact?: boolean;
  activeClass?: string;
  children?: Snippet;
} = $props();

const resolved = $derived(/^(https?:|mailto:|tel:)/.test(href) ? href : toHref(href));
const active = $derived(router ? router.isActive(href, exact) : false);
</script>

<a
  href={resolved}
  class={[className, active && activeClass]}
  aria-current={active ? 'page' : undefined}
  {...rest}
>
  {@render children?.()}
</a>
