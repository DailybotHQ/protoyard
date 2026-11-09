<script lang="ts">
import { Button, Card } from '@protoyard/ui';
import { Heading, Text } from 'texuli/typography';
</script>

<!-- @prop heading: string — Short title for the content group. -->
<!-- @prop density: 'comfortable' | 'compact' — Controls interior spacing. -->
<Card class="grid w-full max-w-xs justify-items-start gap-1.5 p-4"><Text as="span" size="xs" weight="semibold" tone="primary" tracking="wide">WEEKLY REPORT</Text><Heading level={3} size="sm">Product health</Heading><Text size="sm" tone="muted">Activation is steady and feedback is trending up.</Text><Button variant="link" size="sm" href="#/catalog" class="h-auto p-0">View details <span aria-hidden="true">↗</span></Button></Card>
