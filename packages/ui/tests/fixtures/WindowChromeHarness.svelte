<script lang="ts">
import type {
  WindowChromeState,
  WindowChromeVariant,
} from '../../src/components/window-chrome/types.ts';
import WindowChrome from '../../src/components/window-chrome/WindowChrome.svelte';

interface Props {
  title?: string;
  variant?: WindowChromeVariant;
  state?: WindowChromeState;
  maximized?: boolean;
  showToolbar?: boolean;
}

let {
  title = 'Notes',
  variant = 'mac-like',
  state = $bindable('open' as WindowChromeState),
  maximized = $bindable(false),
  showToolbar = false,
}: Props = $props();
</script>

<div class="h-[320px] w-[480px]" data-testid="host">
  {#if showToolbar}
    <WindowChrome {title} {variant} bind:state bind:maximized>
      {#snippet toolbar()}
        <div
          class="flex h-9 items-center gap-2 px-3 text-xs text-muted-foreground"
          data-testid="toolbar"
        >
          File · Edit · View
        </div>
      {/snippet}
      <p data-testid="body">Window body</p>
    </WindowChrome>
  {:else}
    <WindowChrome {title} {variant} bind:state bind:maximized>
      <p data-testid="body">Window body</p>
    </WindowChrome>
  {/if}
</div>

<p data-testid="state">{state}</p>
<p data-testid="maximized">{maximized ? 'true' : 'false'}</p>
