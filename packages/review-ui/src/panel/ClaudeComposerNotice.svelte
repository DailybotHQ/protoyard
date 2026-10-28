<script lang="ts">
import { Alert } from 'texuli/alert';
</script>

<Alert tone="info" hideIcon class="claude-composer-notice" role="status">
  Threads live in Claude’s comment panel.
</Alert>

<style>
  :global(.claude-composer-notice) {
    margin: 0;
    color: var(--tx-muted-foreground, #52525b);
    font-size: 0.875rem;
  }
</style>
