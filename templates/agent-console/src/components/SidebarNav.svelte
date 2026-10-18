<script lang="ts">
import type { HashRouter } from '@protoyard/renderer-svelte';
import { Link } from '@protoyard/renderer-svelte';
import { getAppShellContext, type IconComponent } from '@protoyard/ui';

/**
 * Section navigation. Rendered inside AppShell's sidebar so it can close the
 * phone drawer after a selection (the drawer stays open otherwise).
 */
let {
  router,
  items,
}: {
  router: HashRouter;
  items: { href: string; label: string; icon: IconComponent; exact?: boolean }[];
} = $props();

const shell = getAppShellContext();
</script>

<nav aria-label="Sections">
  <ul class="flex flex-col gap-0.5">
    {#each items as item (item.href)}
      <li>
        <Link
          href={item.href}
          {router}
          exact={item.exact}
          onclick={() => shell?.closeSidebar()}
          class="group flex w-full min-h-touch items-center gap-3 rounded-md px-2.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring lg:min-h-0"
          activeClass="bg-primary/10 !text-primary"
        >
          <item.icon class="size-4 shrink-0" aria-hidden="true" />
          {item.label}
        </Link>
      </li>
    {/each}
  </ul>
</nav>
