<script lang="ts">
import { devCommand } from '@/lib/commands';
import { created } from './created.svelte';

/**
 * Full-width frame for a prototype the create flow just started, placed
 * under the detail page hero so the device frame renders at a readable scale.
 * LivePreview loads only after something was created.
 */
const LivePreview = $derived(created.current ? import('../LivePreview.svelte') : null);
</script>

<div data-testid="created-preview" data-hydrated="true">
  {#if created.current && LivePreview}
    {#await LivePreview then module}
      {@const Preview = module.default}
      <!-- The control client already lists the new server, so the preview opens it framed. -->
      <div class="mt-6">
      <Preview
        titleId="create-preview-title"
        slug={created.current.slug}
        name={created.current.name}
        defaultShell={created.current.shell}
        platform={created.current.platform}
        devCommand={devCommand(created.current.slug)}
      />
      </div>
    {/await}
  {/if}
</div>
