<script lang="ts">
import { TriangleAlert } from '@lucide/svelte';

/** Always visible: this is a simulation on fictional patients, not a medical record system. */
</script>

<div
  role="note"
  aria-label="Simulation notice"
  data-simulation-banner=""
  class="mb-6 flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-foreground"
>
  <TriangleAlert class="mt-0.5 size-4 shrink-0 text-foreground" aria-hidden="true" />
  <p>
    <strong class="font-semibold">Simulation with fictional patients.</strong>
    This is not a medical record system and makes no HIPAA or other compliance claim. Never enter real
    patient or health data.
  </p>
</div>
