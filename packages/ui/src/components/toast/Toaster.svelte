<script lang="ts">
import type { ComponentProps } from 'svelte';
import { Toaster as TexuliToaster } from 'texuli/toast';
import { useOverlayPortalTarget } from '../../lib/use-overlay-portal.svelte.ts';

/**
 * Texuli's `Toaster` (same props), kept inside a framed device or browser
 * screen: while a shell sets an overlay portal target, the stack renders
 * `contained` in that screen (out of the top layer, above contained dialogs);
 * without a frame it is Texuli's top-layer viewport. A caller's `mode` and
 * `container` still win.
 */
// `ref` is declared here: Texuli types it with an interface from a path it does
// not export, so a declaration that names it cannot be emitted.
type Props = Omit<ComponentProps<typeof TexuliToaster>, 'ref'> & { ref?: HTMLElement | null };

let { ref = $bindable(null), ...props }: Props = $props();

const portal = useOverlayPortalTarget();

// Texuli gap G99: a contained viewport reads its container's computed position
// while it mounts, which forces a synchronous layout of the whole app on its
// first render (a 36 ms long task on a 5,000-message screen). Contain it one
// frame later, when layout is clean and the read is cheap; until then (no
// toast can have been raised yet) it is the top-layer viewport.
let settled = $state(false);
$effect(() => {
  const frame = requestAnimationFrame(() => {
    settled = true;
  });
  return () => cancelAnimationFrame(frame);
});
const mode = $derived(settled ? portal.mode : 'top-layer');
const container = $derived(settled ? portal.container : null);
</script>

<TexuliToaster {mode} {container} {...props} bind:ref />
