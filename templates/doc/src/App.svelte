<script lang="ts">
import { setBlockHost } from '@protoyard/blocks-ui';
import { blueprintMotionLevel } from '@protoyard/blueprint';
import { DocApp } from '@protoyard/pages-ui/doc';
import { getRuntime } from '@protoyard/renderer-svelte';
import { MotionProvider } from 'texuli/motion';
import blueprintJson from '../blueprint.json';
import { mountEmbeddedApp } from './embed-host.ts';
import { docDocument } from './prototype.ts';

/** Level-2 doc entry: same DocApp as the player for kind: "doc". */
const runtime = getRuntime();
/** blueprint.json `motion.level` caps every Texuli animation on the doc (reduced motion still wins). */
const motionLevel = blueprintMotionLevel(
  blueprintJson as { motion?: { level: 'full' | 'subtle' | 'none' } }
);
setBlockHost({
  mountEmbed: (target, app) => mountEmbeddedApp(target, app, runtime.manifest.storage.namespace),
});
</script>

<MotionProvider level={motionLevel}>
  <div class="min-h-dvh">
    <DocApp doc={docDocument} {runtime} brandName={runtime.manifest.name} />
  </div>
</MotionProvider>
