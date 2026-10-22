<script lang="ts">
let clicks = $state(0);
</script>

<!-- @prop variant: 'solid' | 'outline' — Visual emphasis for the action. -->
<!-- @prop disabled: boolean — Prevents activation while unavailable. -->
<div class="demo-row">
  <button class="primary" onclick={() => clicks++}>Save changes</button>
  <button class="secondary">Cancel</button>
  <button class="quiet" disabled>Unavailable</button>
</div>
<p class="demo-caption" aria-live="polite">Saved {clicks} times in this preview.</p>
