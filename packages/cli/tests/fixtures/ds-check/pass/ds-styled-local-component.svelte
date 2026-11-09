<script lang="ts">
import { Badge } from 'texuli/badge';

let { label }: { label: string } = $props();
</script>

<Badge>{label}</Badge>
