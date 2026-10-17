<script lang="ts">
import { Badge, type BadgeVariant } from '@protoyard/ui';
import type { DealStage } from '../database/schema.ts';
import { STAGE_LABELS } from '../domain/services.ts';

let { stage }: { stage: DealStage } = $props();

const VARIANTS: Record<DealStage, BadgeVariant> = {
  lead: 'secondary',
  qualified: 'info',
  proposal: 'outline',
  negotiation: 'warning',
  won: 'success',
  lost: 'destructive',
};
</script>

<Badge variant={VARIANTS[stage]}>{STAGE_LABELS[stage]}</Badge>
