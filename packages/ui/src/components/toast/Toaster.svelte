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

// The framed screen is always a containing block (absolute or fixed in every
// shell), so the contained stack is told so (`positioned`) and Texuli never
// reads its computed style (G99). A caller's `container` is read as usual.
const positioned = $derived(portal.mode === 'contained' && props.container === undefined);
</script>

<TexuliToaster mode={portal.mode} container={portal.container} {positioned} {...props} bind:ref />
