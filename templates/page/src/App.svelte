<script lang="ts">
import { setBlockHost } from '@protoyard/blocks-ui';
import { blueprintMotionLevel } from '@protoyard/blueprint';
import { PageApp } from '@protoyard/pages-ui/page';
import { getRuntime } from '@protoyard/renderer-svelte';
import { MotionProvider } from 'texuli/motion';
import blueprintJson from '../blueprint.json';
import { mountEmbeddedApp } from './embed-host.ts';
import { pageDocument } from './prototype.ts';

/** Level-2 page entry: same PageApp as the player for kind: "page". */
const runtime = getRuntime();
/** blueprint.json `motion.level` caps every Texuli animation on the page (reduced motion still wins). */
const motionLevel = blueprintMotionLevel(
  blueprintJson as { motion?: { level: 'full' | 'subtle' | 'none' } }
);
setBlockHost({
  mountEmbed: (target, app) => mountEmbeddedApp(target, app, runtime.manifest.storage.namespace),
});
</script>

<MotionProvider level={motionLevel}>
  <div class="min-h-dvh bg-background text-foreground">
    <PageApp page={pageDocument} {runtime} brandName={runtime.manifest.name} />
  </div>
</MotionProvider>
