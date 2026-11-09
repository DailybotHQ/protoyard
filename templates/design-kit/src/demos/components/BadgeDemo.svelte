<script lang="ts">
import { Badge } from '@protoyard/ui';
</script>

<!-- @prop tone: 'neutral' | 'success' | 'warning' — Communicates a concise state. -->
<div class="flex flex-wrap items-center justify-center gap-2">
  <Badge variant="secondary">Draft</Badge><Badge variant="success">Approved</Badge><Badge variant="warning">Needs review</Badge>
</div>
