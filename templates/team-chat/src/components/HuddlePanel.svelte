<script lang="ts">
import { Button } from '@protoyard/ui';
import type { TeamChatServices } from '../domain/services.ts';

let {
  huddleId,
  services,
  onClose,
}: {
  huddleId: string;
  services: TeamChatServices;
  onClose: () => void;
} = $props();

let captions = $state('Captions appear here (always on).');
let phase = $state('idle');
const voice = services.createHuddleVoice(huddleId);

$effect(() => {
  const prev = voice;
  // Poll captions from the huddle row via voice callbacks already writing DB;
  // also mirror phase for the label.
  const id = setInterval(() => {
    phase = voice.state;
  }, 200);
  return () => {
    clearInterval(id);
    prev.stop();
  };
});

function startPtt() {
  voice.start('push-to-talk');
  phase = voice.state;
}

async function finishPtt() {
  const line = await voice.finishListening();
  if (line) captions = `${captions}\nYou: ${line}`.trim();
  phase = voice.state;
}
</script>

<section
  class="border-t border-border bg-card px-4 py-3 shadow-soft"
  data-py-huddle=""
  aria-label="Simulated huddle"
>
  <div class="mb-2 flex items-center justify-between gap-2">
    <div>
      <p class="text-sm font-semibold">Huddle (simulated)</p>
      <p class="text-xs text-muted-foreground">
        Local captions only — no cloud speech. Phase: {phase}
      </p>
    </div>
    <Button size="sm" variant="outline" onclick={onClose}>Leave</Button>
  </div>
  <pre class="mb-2 max-h-24 overflow-y-auto rounded-md border border-border bg-muted/40 p-2 text-xs whitespace-pre-wrap">{captions}</pre>
  <div class="flex gap-2">
    <Button
      size="sm"
      onpointerdown={() => startPtt()}
      onpointerup={() => void finishPtt()}
      onpointercancel={() => void finishPtt()}
    >
      Hold to talk
    </Button>
  </div>
</section>
