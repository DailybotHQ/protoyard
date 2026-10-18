<script lang="ts">
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@protoyard/ui';

interface Props {
  title: string;
  description?: string;
}

let {
  title,
  description = 'This simulated SaaS kit screen is scaffolded; full UI lands in a later task.',
}: Props = $props();
</script>

<div class="mx-auto flex min-h-app max-w-lg flex-col justify-center p-6" data-saas-kit-screen={title}>
  <Card>
    <CardHeader>
      <CardTitle>{title}</CardTitle>
      <CardDescription>{description}</CardDescription>
    </CardHeader>
    <CardContent>
      <p class="text-sm text-muted-foreground">
        Simulation only — nothing here authenticates a real user or contacts a provider.
      </p>
    </CardContent>
  </Card>
</div>
