<script lang="ts">
import { Badge, Card } from '@protoyard/ui';
import PageHeader from '../components/PageHeader.svelte';
</script>

<PageHeader title="Welcome to Atlas" description="A split-screen preview of a workspace access page." />

<Card class="mx-auto max-w-lg p-6 sm:p-8">
  <Badge variant="outline">Simulation only</Badge>
  <h2 class="mt-4 text-xl font-semibold">Choose a workspace persona</h2>
  <p class="mt-2 text-sm leading-6 text-muted-foreground">
    This page does not collect credentials or sign anyone in. Use Protoyard DevTools to switch
    between the owner, admin, member and viewer personas and inspect their locally simulated access.
  </p>
  <a class="mt-5 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2" href="#/settings">Review role-aware settings</a>
</Card>
