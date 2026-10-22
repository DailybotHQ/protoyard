<script lang="ts">
import { DocApp } from '@protoyard/pages-ui/doc';
import { getRuntime } from '@protoyard/renderer-svelte';
import { docDocument } from './prototype.ts';

/** Level-2 doc entry: same DocApp as the player for kind: "doc". */
const runtime = getRuntime();
</script>

<div class="min-h-dvh bg-background text-foreground">
  <DocApp doc={docDocument} {runtime} brandName={runtime.manifest.name} />
</div>
