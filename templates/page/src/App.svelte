<script lang="ts">
import { setBlockHost } from '@protoyard/blocks-ui';
import { PageApp } from '@protoyard/pages-ui/page';
import { getRuntime } from '@protoyard/renderer-svelte';
import { mountEmbeddedApp } from '../../deck/src/embed-host.ts';
import { pageDocument } from './prototype.ts';

/** Level-2 page entry: same PageApp as the player for kind: "page". */
const runtime = getRuntime();
setBlockHost({
  mountEmbed: (target, app) => mountEmbeddedApp(target, app, runtime.manifest.storage.namespace),
});
</script>

<div class="min-h-dvh bg-background text-foreground">
  <PageApp page={pageDocument} {runtime} brandName={runtime.manifest.name} />
</div>
