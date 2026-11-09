<script lang="ts">
import { Button } from '@protoyard/ui';
import { Box, Text } from 'texuli/typography';
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

<Box
  as="section"
  surface="default"
  border="block-start"
  radius="none"
  padding="none"
  elevation="sm"
  class="px-4 py-3"
  data-py-huddle=""
  aria-label="Simulated huddle"
>
  <div class="mb-2 flex items-center justify-between gap-2">
    <div>
      <Text size="sm" weight="semibold">Huddle (simulated)</Text>
      <Text size="xs" tone="muted">
        Local captions only — no cloud speech. Phase: {phase}
      </Text>
    </div>
    <Button size="sm" variant="outline" onclick={onClose}>Leave</Button>
  </div>
  <Box surface="subtle" border="default" radius="md" padding="sm" class="mb-2 max-h-24 overflow-y-auto">
    <Text as="div" size="xs" class="whitespace-pre-wrap">{captions}</Text>
  </Box>
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
</Box>
