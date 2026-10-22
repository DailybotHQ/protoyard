<script lang="ts">
import { PageApp } from '@protoyard/pages-ui/page';
import { getRuntime } from '@protoyard/renderer-svelte';
import { pageDocument } from './prototype.ts';

/** Level-2 page entry: same PageApp as the player for kind: "page". */
const runtime = getRuntime();
</script>

<div class="min-h-dvh bg-background text-foreground">
  <PageApp page={pageDocument} {runtime} brandName={runtime.manifest.name} />
</div>
