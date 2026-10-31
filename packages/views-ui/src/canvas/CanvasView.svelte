<script lang="ts">
/**
 * Host adapter over `@texuli/canvas/editor` `CanvasEditor`: a liveQuery of
 * one stored canvas, a service callback that persists every edit, SVG
 * download, and JSON import.
 *
 * The stored canvas is untrusted data: it is validated (`validateCanvas`,
 * untrusted tier) before it paints, and an imported file goes through
 * `loadUntrustedCanvas`. Text paints as SVG text, never markup. Texuli starts
 * a new history when it receives a canvas it did not emit, so an edit that
 * comes back unchanged through the service and the query keeps the canvas
 * the editor emitted (undo and selection survive the round trip).
 */
import { runService } from '@protoyard/renderer-svelte';
import { Button } from '@protoyard/ui';
import { CanvasEditor } from '@texuli/canvas/editor';
import { canvasToSvg } from '@texuli/canvas/export';
import { type CanvasDocument, loadUntrustedCanvas, validateCanvas } from '@texuli/canvas/model';
import { FileUpload } from 'texuli/file-upload';
import QueryState from '../states/QueryState.svelte';

let {
  query,
  onChange,
  onRetry,
  label = 'Canvas',
  readonly = false,
  files = true,
  resolveImage,
  class: className,
}: {
  query: {
    readonly current: unknown | undefined;
    readonly loading: boolean;
    readonly error: unknown;
  };
  /** Persists the edited canvas (a service). Without it the canvas is read-only. */
  onChange?: (canvas: CanvasDocument) => unknown;
  onRetry?: () => unknown;
  label?: string;
  readonly?: boolean;
  /** Offer "Download SVG" (and "Import JSON" when editable). */
  files?: boolean;
  /** Turns an image shape's `ref` into a URL (it still passes Texuli's URL policy). */
  resolveImage?: (ref: string) => string | null | undefined;
  class?: string;
} = $props();

const editable = $derived(!readonly && onChange !== undefined);

/** The last canvas shown, and its JSON, to recognize an edit coming back unchanged. */
let shown = $state.raw<CanvasDocument | null>(null);
let shownJson = '';
let invalid = $state<string | null>(null);
let importing = $state(false);
let importError = $state<string | null>(null);
/** Bumped after each pick: the upload zone starts empty again, so another file can be chosen. */
let attempt = $state(0);

$effect.pre(() => {
  const stored = query.current;
  if (stored === undefined) return;
  const json = JSON.stringify(stored);
  if (json === shownJson) return;
  const checked = validateCanvas(stored);
  if (!checked.ok) {
    invalid = checked.issues[0]?.message ?? 'The canvas is not valid.';
    return;
  }
  invalid = null;
  shown = checked.canvas;
  shownJson = json;
});

async function persist(next: CanvasDocument): Promise<void> {
  if (!onChange) return;
  const previous = shown;
  const previousJson = shownJson;
  shown = next;
  shownJson = JSON.stringify(next);
  const result = await runService(() => onChange(next));
  // A refused save puts the stored canvas back.
  if (!result.ok || result.value === false) {
    shown = previous;
    shownJson = previousJson;
  }
}

function download(): void {
  if (!shown) return;
  const blob = new Blob([canvasToSvg(shown)], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${(shown.meta?.title ?? label).replace(/[^\w.-]+/g, '-')}.svg`;
  link.click();
  URL.revokeObjectURL(url);
}

/** A canvas JSON file replaces this canvas once it passes the untrusted loader. */
async function importJson(picked: File[]): Promise<void> {
  const file = picked[0];
  if (!file) return;
  importError = null;
  const loaded = loadUntrustedCanvas(await file.text());
  if (!loaded.ok) {
    importError = loaded.issues[0]?.message ?? 'The file is not a canvas.';
    return;
  }
  importing = false;
  await persist(loaded.canvas);
}
</script>

<div class="grid gap-2" data-py-canvas={label}>
  <QueryState
    {query}
    label={`Loading ${label.toLowerCase()}`}
    onRetry={onRetry ? () => { void onRetry(); } : undefined}
    isEmpty={() => false}
  >
    {#snippet children()}
      {#if invalid}
        <p role="alert" class="rounded-md border border-destructive p-3 text-sm text-destructive">
          This canvas could not be opened: {invalid}
        </p>
      {:else if shown}
        {#if files}
          <div class="flex flex-wrap items-center gap-2" role="group" aria-label="{label} file actions">
            <Button variant="outline" size="sm" onclick={download}>Download SVG</Button>
            {#if editable}
              <Button
                variant="ghost"
                size="sm"
                aria-expanded={importing}
                onclick={() => {
                  importing = !importing;
                  importError = null;
                }}>Import JSON</Button
              >
            {/if}
          </div>
          {#if editable && importing}
            {#key attempt}
              <FileUpload
                variant="compact"
                accept=".json,application/json"
                maxFiles={1}
                labels={{ label: 'Import JSON', description: 'A canvas file replaces this canvas. It is checked first.' }}
                onFilesAdd={(picked) => {
                  attempt += 1;
                  void importJson(picked);
                }}
              />
            {/key}
            {#if importError}<p role="alert" class="text-sm text-destructive">{importError}</p>{/if}
          {/if}
        {/if}
        <CanvasEditor
          canvas={shown}
          readonly={!editable}
          {resolveImage}
          aria-label={label}
          onchange={(next) => void persist(next)}
          class={className}
        />
      {/if}
    {/snippet}
  </QueryState>
</div>
