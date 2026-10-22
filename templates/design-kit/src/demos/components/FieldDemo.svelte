<script lang="ts">
let value = $state('');
</script>

<!-- @prop label: string — Visible, persistent name for the input. -->
<!-- @prop required: boolean — Marks a value that must be provided. -->
<label class="field-label" for="demo-email">Work email</label>
<input id="demo-email" class="demo-input" type="email" bind:value placeholder="you@example.com" />
<p class="demo-caption">Your address stays in this local preview.</p>
