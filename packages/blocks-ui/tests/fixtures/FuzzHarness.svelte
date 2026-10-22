<script lang="ts">
import type { BlockStateHost } from '@protoyard/blocks/interactive';
import { BlockRenderer, setBlockHost } from '../../src/index.ts';

/** Renders many documents, each in its own tagged wrapper, so a failure names its document. */
let {
  docs,
  stateHost,
}: { docs: readonly { id: string; blocks: readonly unknown[] }[]; stateHost: BlockStateHost } =
  $props();

// The host context reads through, so the getter keeps `stateHost` current.
setBlockHost({
  get stateHost() {
    return stateHost;
  },
  documentId: 'security-fuzz',
  viewerId: 'viewer',
  step: 1,
});
</script>

{#each docs as doc (doc.id)}
  <section data-fuzz-doc={doc.id}>
    <BlockRenderer blocks={doc.blocks} />
  </section>
{/each}
