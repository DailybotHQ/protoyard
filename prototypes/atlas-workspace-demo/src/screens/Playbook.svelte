<script lang="ts">
import { Badge, Card } from '@protoyard/ui';
import PageHeader from '../components/PageHeader.svelte';
</script>

<PageHeader title="Operations playbook" description="A compact guide to the fictional Atlas workspace." />

<article class="mx-auto max-w-4xl space-y-5">
  <Card class="p-5 sm:p-7">
    <h2 class="text-lg font-semibold">Daily overview</h2>
    <p class="mt-2 text-sm leading-6 text-muted-foreground">Review orders, active customers and the revenue trend together. All numbers come from deterministic local scenario data.</p>
  </Card>
  <Card class="p-5 sm:p-7">
    <h2 class="text-lg font-semibold">Customer operations</h2>
    <p class="mt-2 text-sm leading-6 text-muted-foreground">Search and filter the customer directory, then open a record for its profile and related activity. Changes use the prototype's validated local services.</p>
  </Card>
  <Card class="p-5 sm:p-7">
    <h2 class="text-lg font-semibold">Scenario scale</h2>
    <p class="mt-2 text-sm leading-6 text-muted-foreground">Use DevTools to switch between empty, active and massive workspaces. The generator is seeded, so each scenario is repeatable.</p>
    <div class="mt-3 flex flex-wrap gap-2"><Badge variant="outline">Empty</Badge><Badge variant="outline">Active</Badge><Badge variant="outline">Massive</Badge></div>
  </Card>
  <Card class="p-5 sm:p-7">
    <h2 class="text-lg font-semibold">Trust boundary</h2>
    <p class="mt-2 text-sm leading-6 text-muted-foreground">Atlas is a browser-only simulation. Personas and access controls demonstrate product states; they do not authenticate people or protect real data.</p>
  </Card>
</article>
