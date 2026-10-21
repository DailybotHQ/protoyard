<script lang="ts">
import { liveQuery, usePrincipal } from '@protoyard/renderer-svelte';
import { Card } from '@protoyard/ui';
import { useBlueprintApp } from './context.ts';

const { services, blueprint, runtime } = useBlueprintApp();
// The counts depend on the active role (a role that cannot read shows —), and a
// persona switch changes no data table, so the persona is a dependency.
const principal = usePrincipal(runtime);
const personaId = $derived(principal.current?.persona.id ?? '');

/** Row count per entity; null when the active role cannot read it. */
const counts = liveQuery(
  async () =>
    Object.fromEntries(
      await Promise.all(
        blueprint.entities.map(async (entity) => [
          entity.name,
          await (services[entity.name]?.list() ?? Promise.resolve([])).then(
            (rows) => rows.length,
            () => null
          ),
        ])
      )
    ) as Record<string, number | null>,
  { initial: {}, deps: () => [personaId] }
);
</script>

<div class="space-y-6">
  <div>
    <h1 class="text-2xl font-semibold">{blueprint.name}</h1>
    {#if blueprint.description}
      <p class="mt-1 max-w-2xl text-sm text-muted-foreground">{blueprint.description}</p>
    {/if}
  </div>
  <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
    {#each blueprint.entities as entity (entity.name)}
      {@const count = counts.current?.[entity.name]}
      <Card class="p-4" data-testid={`home-count-${entity.name}`}>
        <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {entity.label ?? entity.plural.replace(/-/g, ' ')}
        </p>
        <p class="mt-2 text-3xl font-semibold">{count === null ? '—' : (count ?? 0)}</p>
        <a class="mt-3 inline-block text-sm text-primary hover:underline" href={`#/${entity.plural}`}>Open list</a>
      </Card>
    {/each}
  </div>
</div>
