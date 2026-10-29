<script lang="ts">
import { Copy } from '@lucide/svelte';
import { copyText } from '../format.ts';
import { reproducibleLink } from '../link.ts';
import Btn from '../primitives/Btn.svelte';
import Glyph from '../primitives/Glyph.svelte';
import Section from '../primitives/Section.svelte';
import type { DevtoolsState } from '../state.svelte.ts';

let { dt }: { dt: DevtoolsState } = $props();
const runtime = $derived(dt.runtime);
const slug = $derived(runtime.manifest.slug);
const link = $derived.by(() => {
  dt.active;
  dt.principal;
  return reproducibleLink(runtime);
});
const presentationLink = $derived.by(() => {
  dt.active;
  dt.principal;
  return reproducibleLink(runtime, { presentation: true });
});
const commands = $derived([
  { label: 'Run locally', command: `pnpm protoyard dev ${slug}` },
  { label: 'Build static site', command: `pnpm protoyard build ${slug}` },
  { label: 'Export ZIP', command: `pnpm protoyard export ${slug}` },
  {
    label: 'Publish (dry run)',
    command: `pnpm protoyard publish ${slug} --provider cloudflare --dry-run`,
  },
]);
const sandboxLink = $derived.by(() => {
  const url = new URL(link);
  url.searchParams.set('sandbox', 'try');
  return url.toString();
});
let copiedKey = $state<string | null>(null);

async function copy(key: string, text: string) {
  const ok = await copyText(text);
  copiedKey = ok ? key : null;
  dt.notify(
    ok ? 'success' : 'error',
    ok ? 'Copied to the clipboard.' : 'Could not access the clipboard.'
  );
  setTimeout(() => {
    if (copiedKey === key) copiedKey = null;
  }, 1500);
}
</script>

{#snippet copyRow(key: string, label: string, text: string, mono = true)}
  <div>
    <p class="mb-1 text-[11px] text-muted-foreground">{label}</p>
    <div class="flex items-stretch gap-1">
      <code class="min-w-0 flex-1 truncate rounded-md border border-border bg-muted px-2 py-1.5 text-[11px] {mono ? 'font-mono' : ''}" title={text}>{text}</code>
      <Btn
        type="button"
        class="inline-flex min-h-touch w-9 shrink-0 items-center justify-center rounded-md border border-border hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring sm:min-h-0 sm:w-8"
        aria-label={`Copy: ${label}`}
        onclick={() => copy(key, text)}
      >
        {#if copiedKey === key}<Glyph icon="check" class="size-3.5 text-success" aria-hidden="true" />{:else}<Glyph icon={Copy} class="size-3.5" aria-hidden="true" />{/if}
      </Btn>
    </div>
  </div>
{/snippet}

<Section
  title="Reproducible link"
  description="Carries scenario, persona, seed, shell (?shell=) and app layout (?layout=) when overridden. Manual data edits travel as snapshot files."
>
  <div class="space-y-2.5">
    {@render copyRow('link', 'Open this scenario', link)}
    {@render copyRow('presentation', 'Presentation mode (no DevTools)', presentationLink)}
    {@render copyRow('sandbox', 'Fresh sandbox (separate data; your world stays intact)', sandboxLink)}
  </div>
</Section>

<Section title="From your terminal" description="Building and publishing run in the CLI. The browser never deploys anything.">
  <div class="space-y-2.5">
    {#each commands as item (item.command)}
      {@render copyRow(item.command, item.label, item.command)}
    {/each}
  </div>
</Section>
