<script lang="ts">
import { setBlockHost } from '@protoyard/blocks-ui';
import { DocApp } from '@protoyard/pages-ui/doc';
import { getRuntime } from '@protoyard/renderer-svelte';
import { mountEmbeddedApp } from './embed-host.ts';
import { docDocument } from './prototype.ts';

/** Level-2 doc entry: same DocApp as the player for kind: "doc". */
const runtime = getRuntime();
setBlockHost({
  mountEmbed: (target, app) => mountEmbeddedApp(target, app, runtime.manifest.storage.namespace),
});
</script>

<div class="min-h-dvh bg-background text-foreground">
  <DocApp doc={docDocument} {runtime} brandName={runtime.manifest.name} />
</div>
