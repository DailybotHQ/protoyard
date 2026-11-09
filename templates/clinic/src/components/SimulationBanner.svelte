<script lang="ts">
import { Icon } from 'texuli/icons';
import { Box, Text } from 'texuli/typography';

/** Always visible: this is a simulation on fictional patients, not a medical record system. */
</script>

<Box
  role="note"
  aria-label="Simulation notice"
  data-simulation-banner=""
  surface="muted"
  border="default"
  radius="lg"
  padding="none"
  class="mb-6 flex items-start gap-3 px-4 py-3"
>
  <Icon icon="warning" tone="warning" class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
  <Text size="sm">
    <Text as="strong" size="sm" weight="semibold">Simulation with fictional patients.</Text>
    This is not a medical record system and makes no HIPAA or other compliance claim. Never enter real
    patient or health data.
  </Text>
</Box>
