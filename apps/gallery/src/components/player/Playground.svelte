<script lang="ts">
import {
  type AnyBlueprint,
  type BlueprintKind,
  decodeDocumentShare,
  detectBlueprintKind,
  encodeBlueprintShare,
  readBlueprintShareFragment,
} from '@protoyard/blueprint';
import { connectPlayer, type PlayerConnection } from '@protoyard/player/embed';
import { onMount } from 'svelte';
import { parsePastedBlueprint } from './blueprint.ts';

let frame: HTMLIFrameElement;
let source = $state('');
let status = $state('Paste a blueprint JSON file or open a share link.');
let busy = $state(false);
let shareAvailable = $state(false);
let playerReady = $state(false);
let playerSource = $state('about:blank');
let playerKind: BlueprintKind | null = null;
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

function playerUrl(kind: BlueprintKind, share?: string): string {
  const page = kind === 'app' ? 'index.html' : `${kind}.html`;
  const target = new URL(`${import.meta.env.BASE_URL}player/${page}`, window.location.href);
  target.searchParams.set('embedder', window.location.origin);
  if (share) target.hash = `bp=${share}`;
  return target.href;
}

async function openPlayer(kind: BlueprintKind, share?: string): Promise<PlayerConnection> {
  if (playerKind !== kind || !connection) {
    playerReady = false;
    connection?.close();
    connection = null;
    playerKind = kind;
    const loaded = new Promise<void>((resolve) => {
      frame.addEventListener('load', () => resolve(), { once: true });
    });
    playerSource = playerUrl(kind, share);
    await loaded;
    connection = connectPlayer({ frame, playerOrigin: new URL(frame.src).origin });
  }
  await connection.ready;
  playerReady = true;
  return connection;
}

function kindOf(blueprint: AnyBlueprint): BlueprintKind {
  const detected = detectBlueprintKind(blueprint);
  return detected.ok ? detected.kind : 'app';
}

async function loadPasted(): Promise<void> {
  if (busy) return;
  busy = true;
  status = 'Validating blueprint…';
  try {
    const blueprint = await parsePastedBlueprint(source);
    const kind = kindOf(blueprint);
    const player = await openPlayer(kind);
    await player.load(blueprint);
    const next = new URL(window.location.href);
    next.hash = '';
    window.history.replaceState(null, '', next);
    status = `${blueprint.name} is running in this browser.`;
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
    const blueprint = await parsePastedBlueprint(source);
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
  const share = readBlueprintShareFragment(window.location.hash);
  const opening = 'Opening the player…';
  status = opening;
  // A load or share link started while the player opens keeps its own status
  // (a player that fails to open still says so).
  const settle = (next: string) => {
    if (status === opening) status = next;
  };
  let active = true;
  void (async () => {
    let kind: BlueprintKind = 'app';
    let openingStatus = 'Paste a blueprint JSON file or open a share link.';
    if (share) {
      const decoded = await decodeDocumentShare(share);
      if (decoded.success) {
        kind = kindOf(decoded.blueprint);
        openingStatus = `${decoded.blueprint.name} is open in the player.`;
      } else {
        openingStatus = decoded.issues.map((issue) => issue.message).join(' ');
      }
    }
    if (!active) return;
    try {
      await openPlayer(kind, share ?? undefined);
    } catch (error) {
      status = error instanceof Error ? error.message : 'The player frame did not become ready.';
      return;
    }
    if (!active) return;
    settle(
      !share && !shareAvailable
        ? 'Share links need CompressionStream with deflate-raw. This browser can still load pasted blueprints.'
        : openingStatus
    );
  })();
  return () => {
    active = false;
    connection?.close();
  };
});
</script>

<section class="grid gap-6 xl:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)]">
  <div class="space-y-4">
    <label class="block space-y-2 text-sm font-medium" for="blueprint-source">
      Blueprint JSON (app, deck, page, or document)
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
        disabled={busy || !playerReady || source.trim().length === 0}
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
      title="Running Protoyard blueprint"
      src={playerSource}
      class="h-[min(75vh,56rem)] min-h-[34rem] w-full border-0 bg-white"
      referrerpolicy="strict-origin-when-cross-origin"
    ></iframe>
  </div>
</section>
