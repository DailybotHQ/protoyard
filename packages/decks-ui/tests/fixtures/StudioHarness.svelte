<script lang="ts">
import { DeckApp } from '../../src/app/index.ts';
import DeckStudioPanel from '../../src/studio/DeckStudioPanel.svelte';
import type { DeckStudio } from '../../src/studio/index.ts';

/** A deck rendered from the studio's live preview, next to the studio panel. */
let { studio }: { studio: DeckStudio } = $props();
</script>

<div data-testid="preview">
  <DeckApp deck={studio.preview} syncHash={false} autofocus={false} />
</div>
<DeckStudioPanel {studio} />
