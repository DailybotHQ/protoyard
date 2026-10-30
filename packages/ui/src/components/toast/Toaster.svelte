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
type Props = ComponentProps<typeof TexuliToaster>;

let { ref = $bindable(null), ...props }: Props = $props();

const portal = useOverlayPortalTarget();
</script>

<TexuliToaster mode={portal.mode} container={portal.container} {...props} bind:ref />
