<script lang="ts" module>
import type { DropdownMenuEntry } from '@protoyard/ui';
import { Button } from '@protoyard/ui';

export interface Menu {
  label: string;
  items: DropdownMenuEntry[];
}
</script>

<script lang="ts">
import { DropdownMenu } from '@protoyard/ui';

/** The app's menu bar: each menu is a real dropdown of actions (no decorative items). */
let { menus }: { menus: Menu[] } = $props();
</script>

<nav aria-label="Application menu" class="flex h-9 shrink-0 items-center gap-0.5 border-b border-border bg-surface px-2 text-sm">
  {#each menus as menu (menu.label)}
    <DropdownMenu items={menu.items} align="start">
      {#snippet trigger({ props })}
        <Button
          {...props}
          type="button"
          class="rounded-md px-2.5 py-1 text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none data-[state=open]:bg-muted"
        >
          {menu.label}
        </Button>
      {/snippet}
    </DropdownMenu>
  {/each}
</nav>
