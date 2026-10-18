<script lang="ts">
import type { AssistantCanvas } from '@protoyard/ai-ui';
import { CanvasPanel } from '@protoyard/ai-ui';

interface Props {
  document: AssistantCanvas;
  onChange: (content: string) => void;
  onClose: () => void;
}

let { document, onChange, onClose }: Props = $props();
</script>

<CanvasPanel {document} {onChange} {onClose} />
