<script lang="ts">
import type { Membership, Persona } from '@protoyard/core';
import { avatarImage, liveQuery } from '@protoyard/renderer-svelte';
import { Avatar, Badge } from '@protoyard/ui';
import { useCrudApp } from '../lib/context.ts';

const { runtime } = useCrudApp();

const members = liveQuery(
  async () => {
    const db = runtime.db as {
      table(name: string): { toArray(): Promise<unknown[]> };
    };
    const [personas, memberships] = await Promise.all([
      db.table('py_personas').toArray() as Promise<Persona[]>,
      db.table('py_memberships').toArray() as Promise<Membership[]>,
    ]);
    const byPersona = new Map(memberships.map((m) => [m.personaId, m]));
    return personas
      .map((p) => ({
        persona: p,
        role: byPersona.get(p.id)?.role ?? 'member',
      }))
      .sort((a, b) => a.persona.name.localeCompare(b.persona.name));
  },
  { initial: [] }
);
</script>

<div class="space-y-4">
  <div>
    <h1 class="text-xl font-semibold">Members</h1>
    <p class="text-sm text-muted-foreground">
      Workspace people from the seeded team. Roles are simulated policy, not security.
    </p>
  </div>
  <ul class="divide-y divide-border rounded-lg border border-border bg-card">
    {#each members.current ?? [] as row (row.persona.id)}
      <li class="flex items-center gap-3 px-4 py-3">
        <Avatar name={row.persona.name} {...avatarImage(row.persona.avatar)} size="sm" />
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-medium">{row.persona.name}</p>
          <p class="truncate text-xs text-muted-foreground">
            {row.persona.title ?? row.persona.email ?? row.persona.id}
          </p>
        </div>
        <Badge variant={row.role === 'viewer' ? 'outline' : 'secondary'}>{row.role}</Badge>
      </li>
    {:else}
      <li class="px-4 py-6 text-sm text-muted-foreground">No members loaded.</li>
    {/each}
  </ul>
</div>
