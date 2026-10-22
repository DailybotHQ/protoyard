<script lang="ts">
import type { AnyBlueprint, Blueprint } from '@protoyard/blueprint';
import { DEFAULT_UNTRUSTED_DOCUMENT_LIMITS } from '@protoyard/blueprint';
import { Button, type DropzoneFile, FileDropzone } from '@protoyard/ui';
import { loadBlueprintFromFile, type SourceIssue } from './resolve.ts';

/**
 * The picker: drop or browse for a blueprint.json, or open the bundled demo.
 * Every file goes through the untrusted loader; problems are listed here and
 * the player only starts on a valid blueprint. Loaded lazily, so a share link
 * or `?src` never downloads it.
 */
let {
  onBlueprint,
  loadDemo,
}: {
  onBlueprint: (blueprint: AnyBlueprint, label: string) => void | Promise<void>;
  loadDemo: () => Promise<Blueprint>;
} = $props();

let issues = $state<SourceIssue[]>([]);
let fileName = $state<string | null>(null);
let busy = $state(false);
// The dropzone keeps picked files; clear it so the next pick (after a rejected
// file) is accepted with `multiple={false}`.
let picked = $state<DropzoneFile[]>([]);

async function open(file: File) {
  busy = true;
  fileName = file.name;
  issues = [];
  try {
    picked = [];
    const result = await loadBlueprintFromFile(file);
    if ('issues' in result) issues = result.issues;
    else await onBlueprint(result.blueprint, file.name);
  } finally {
    busy = false;
  }
}

async function demo() {
  await onBlueprint(await loadDemo(), 'demo blueprint');
}
</script>

<main class="flex min-h-dvh items-center justify-center bg-background px-4 py-10 text-foreground">
  <section
    class="w-full max-w-lg rounded-xl border border-border bg-surface p-6 shadow-float"
    aria-labelledby="py-picker-title"
    data-testid="player-picker"
  >
    <h1 id="py-picker-title" class="text-lg font-semibold">Open a blueprint</h1>
    <p class="mt-2 text-sm text-muted-foreground">
      Choose a blueprint.json to run it as a working prototype in this browser. Its data is
      simulated and stays on this device.
    </p>
    <FileDropzone
      class="mt-4"
      accept=".json,application/json"
      maxSize={DEFAULT_UNTRUSTED_DOCUMENT_LIMITS.maxBytes}
      multiple={false}
      bind:files={picked}
      disabled={busy}
      label="Blueprint file"
      description="Drop a blueprint.json here, or browse for it. Up to 256 KB."
      browseLabel="Choose a file"
      onAdd={(files) => {
        const [file] = files;
        if (file) void open(file);
      }}
    />
    {#if busy}
      <p class="mt-3 text-sm text-muted-foreground" role="status">Checking {fileName}…</p>
    {/if}
    {#if issues.length > 0}
      <div class="mt-4" role="alert">
        <p class="text-sm font-medium text-destructive">{fileName} could not be opened:</p>
        <ul class="mt-2 space-y-2" aria-label="Problems found">
          {#each issues.slice(0, 20) as item, i (i)}
            <li class="rounded-lg border border-border p-3 text-sm">
              <p class="font-medium">{item.message}</p>
              {#if item.path.length > 0}
                <p class="mt-1 font-mono text-xs text-muted-foreground">at {item.path.join('.')}</p>
              {/if}
              <p class="mt-1 text-muted-foreground">{item.fix}</p>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
    <div class="mt-6 flex flex-wrap gap-2">
      <Button variant="outline" onclick={demo}>Open the demo blueprint</Button>
    </div>
  </section>
</main>
