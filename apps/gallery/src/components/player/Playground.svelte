<script lang="ts">
import { encodeBlueprintShare } from '@protoyard/blueprint';
import { connectPlayer, type PlayerConnection } from '@protoyard/player/embed';
import { onMount } from 'svelte';
import { parsePastedBlueprint } from './blueprint.ts';

let frame: HTMLIFrameElement;
let source = $state('');
let status = $state('Paste a blueprint JSON file or open a share link.');
let busy = $state(false);
let shareAvailable = $state(false);
let playerSource = $state('about:blank');
let connection: PlayerConnection | null = null;

function hasDeflateRaw(): boolean {
  try {
    if (typeof CompressionStream === 'undefined') return false;
    new CompressionStream('deflate-raw');
    return true;
  } catch {
    return false;
  }
}

function playerUrl(): string {
  const target = new URL(`${import.meta.env.BASE_URL}player/`, window.location.href);
  target.searchParams.set('embedder', window.location.origin);
  const share = new URLSearchParams(window.location.hash.slice(1)).get('bp');
  if (share) target.hash = `bp=${share}`;
  return target.href;
}

function connect(): PlayerConnection {
  if (!connection) {
    const origin = new URL(frame.src).origin;
    connection = connectPlayer({ frame, playerOrigin: origin });
  }
  return connection;
}

async function loadPasted(): Promise<void> {
  if (busy) return;
  busy = true;
  status = 'Validating blueprint…';
  try {
    const blueprint = parsePastedBlueprint(source);
    const player = connection ?? connect();
    await player.ready;
    const result = await player.load(blueprint);
    status = `${result.name} is running in this browser.`;
  } catch (error) {
    status = error instanceof Error ? error.message : 'The blueprint could not be loaded.';
  } finally {
    busy = false;
  }
}

async function copyShareLink(): Promise<void> {
  if (!shareAvailable || busy) return;
  busy = true;
  status = 'Preparing share link…';
  try {
    const blueprint = parsePastedBlueprint(source);
    const encoded = await encodeBlueprintShare(blueprint);
    const next = new URL(window.location.href);
    next.hash = `bp=${encoded}`;
    window.history.replaceState(null, '', next);
    try {
      await navigator.clipboard.writeText(next.href);
      status = 'Share link copied. The link contains blueprint data.';
    } catch {
      status = 'Share link ready in the address bar. Copy it to share the blueprint data.';
    }
  } catch (error) {
    status = error instanceof Error ? error.message : 'A share link could not be created.';
  } finally {
    busy = false;
  }
}

onMount(() => {
  shareAvailable = hasDeflateRaw();
  const sourceUrl = playerUrl();
  connection = connectPlayer({ frame, playerOrigin: new URL(sourceUrl).origin });
  void connection.ready.catch((error: unknown) => {
    status = error instanceof Error ? error.message : 'The player frame did not become ready.';
  });
  playerSource = sourceUrl;
  if (!shareAvailable) {
    status =
      'Share links need CompressionStream with deflate-raw. This browser can still load pasted blueprints.';
  }
  return () => connection?.close();
});
</script>

<section class="grid gap-6 xl:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)]">
  <div class="space-y-4">
    <label class="block space-y-2 text-sm font-medium" for="blueprint-source">
      Blueprint JSON
      <textarea
        id="blueprint-source"
        bind:value={source}
        rows="14"
        spellcheck="false"
        autocomplete="off"
        class="w-full rounded-lg border border-line bg-bg p-3 font-mono text-xs text-fg shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        placeholder="Paste a blueprint JSON document"
        aria-describedby="player-status"
      ></textarea>
    </label>
    <div class="flex flex-wrap gap-2">
      <button
        type="button"
        class="rounded-md bg-accent px-4 py-2 text-sm font-medium text-on-accent disabled:cursor-wait disabled:opacity-60"
        disabled={busy || source.trim().length === 0}
        onclick={loadPasted}
      >{busy ? 'Loading…' : 'Load blueprint'}</button>
      <button
        type="button"
        class="rounded-md border border-line px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
        disabled={busy || source.trim().length === 0 || !shareAvailable}
        onclick={copyShareLink}
      >Copy share link</button>
    </div>
    <p id="player-status" class="min-h-10 text-sm text-muted" role="status" aria-live="polite">{status}</p>
  </div>

  <div class="min-h-[34rem] overflow-hidden rounded-xl border border-line bg-surface-1">
    <iframe
      bind:this={frame}
      title="Running Protoyard prototype"
      src={playerSource}
      class="h-[min(75vh,56rem)] min-h-[34rem] w-full border-0 bg-white"
      referrerpolicy="strict-origin-when-cross-origin"
    ></iframe>
  </div>
</section>
