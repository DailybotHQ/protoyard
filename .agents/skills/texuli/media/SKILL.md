---
name: texuli-media
description: Build media with Texuli offline — responsive images, galleries, video with captions, layered compositions, exports, and a host-wired generator slot. No network; URL policy on every src.
version: "0.3.9"
documentation_url: https://texuli.com/guides/
user-invocable: true
allowed-tools: Bash, Read, Grep, Glob, Edit, Write
metadata: {"openclaw":{"emoji":"▣","homepage":"https://texuli.com/guides/","requires":{"anyBins":["bash","git"]}}}
---

# Images, video and compositions

Use this sub-skill **inside a Texuli monorepo checkout** when the developer
wants media surfaces: safe images, galleries, video + captions, compositions,
PNG/SVG/WebM export, or a **host** generator behind the generator slot.

Texuli **ships no model and opens no network** for generation or export (except
loading image layers that already pass the URL policy). Every command below is
local.

Package docs (read these for props and limits):

| Area | Doc in the monorepo |
| --- | --- |
| Image | `packages/media/docs/image.md` |
| Gallery / lightbox | `packages/media/docs/gallery.md` |
| Video | `packages/media/docs/video.md` |
| Captions | `packages/media/docs/captions.md` |
| Composition v2 (groups, layer timing) | `packages/media/docs/composition-v2.md` |
| Canvas / SVG render | `packages/media/docs/media-composition-canvas.md`, `composition-svg.md` |
| Animation / timeline editor | `packages/media/docs/animation.md`, `timeline.md` |
| Image editor | `packages/media/docs/image-editor.md` |
| Export | `packages/media/docs/media-export.md` |
| Generator slot | `packages/media/docs/generator-slot.md` |
| Audio | `packages/media/docs/audio.md` |

Procedure detail lives in [`references/`](references/).

## When to use

| Intent | Use this skill |
| --- | --- |
| Responsive `Image` with srcset / focal point / placeholder | Yes — **Stage A** |
| Photo grid + lightbox | Yes — **Stage B** |
| Video player + WebVTT captions / chapters / transcript | Yes — **Stage C** |
| Layered composition (model + canvas or SVG) | Yes — **Stage D** |
| Export composition to PNG / SVG / WebM | Yes — **Stage E** |
| Wire a host `generate` into `GeneratorSlot` | Yes — **Stage F** |
| Contribute a new media primitive to the monorepo | Prefer [`../contribute/SKILL.md`](../contribute/SKILL.md) |

## Rules (always)

1. **Import subpaths only:** `@texuli/media/image`, `@texuli/media/video`, … — not deep `src/` paths.
2. **URL policy:** every `src` / `href` / poster / track URL goes through
   `safeImageSrc` / `safeMediaSrc` / `safeHref` (`@texuli/core/url-policy`).
   Untrusted defaults to HTTPS (and allowlisted origins where the API takes them).
3. **No HTML sinks:** caption cue text is plain text; never `{@html}` on media data.
4. **No network** for skill routing or monorepo gates. A host generator may use
   the network only when the **developer** owns that callback — Texuli does not.
5. Fictional demo assets: prefer local `?url&no-inline` SVGs in examples (Vite
   must not inline `data:` URLs that the untrusted policy rejects).
6. Class helpers from other packages: `texuli/cx` — never `clsx` / `tailwind-merge`.

## Offline gates (media package)

From the monorepo root (Playwright commands set `TEXULI_E2E_PORT=<port>`, a
free port per parallel worker; 4870 is the default):

```bash
# Unit tests (pick the area you touched)
pnpm vitest run packages/media/tests/image.test.ts
pnpm vitest run packages/media/tests/gallery.test.ts
pnpm vitest run packages/media/tests/video.test.ts
pnpm vitest run packages/media/tests/captions.test.ts
pnpm vitest run packages/media/tests/generator-slot.test.ts
pnpm vitest run packages/media/tests/export.test.ts

pnpm --filter @texuli/media typecheck
npx biome check packages/media/src packages/media/tests

# Bundle (report gzip; do not edit texuli.budgets.json)
pnpm size --filter '@texuli/media/image'
pnpm size --filter '@texuli/media/video'
pnpm size --filter '@texuli/media/generator-slot'
```

Example + visual baselines (when you register a new example id):

```bash
TEXULI_E2E_PORT=<port> pnpm visual:update -g <example-id>
# Inspect light/dark PNGs under tests/visual/visual.spec.ts-snapshots/
```

Validate **this** skill pack after editing it:

```bash
pnpm exec tsx scripts/check-skill.ts --write-sums
pnpm vitest run scripts/tests/skill.test.ts
./skills/texuli/setup.sh --verify
```

---

## Stage A — Responsive image

**Import:** `@texuli/media/image`

```svelte
<script lang="ts">
  import { Image } from '@texuli/media/image';
  // Local fictional asset in monorepo examples:
  import harbor from './harbor.svg?url&no-inline';
</script>

<Image
  src={harbor}
  trust="developer"
  widths={[480, 960]}
  sizes="(min-width: 48rem) 40rem, 100vw"
  alt="Fishing boats in a harbor at sunset"
  width={960}
  height={540}
  focalPoint={{ x: 0.3, y: 0.55 }}
  placeholder={{ kind: 'color', color: '#1e3a5f' }}
/>
```

**Checklist:** required `alt` (use `""` only when decorative); blocked sources
show a labelled fallback; no raw `style=` for layout — use props / CSS modules
as the package documents.

**Gate:** `pnpm vitest run packages/media/tests/image.test.ts`

---

## Stage B — Gallery and lightbox

**Import:** `@texuli/media/gallery`

```svelte
<script lang="ts">
  import { Gallery, type GalleryItem } from '@texuli/media/gallery';
  import harbor from './harbor.svg?url&no-inline';

  const items: GalleryItem[] = [
    {
      src: harbor,
      alt: 'Harbor at dusk',
      width: 960,
      height: 540,
      caption: 'Harbor Notes trip (fictional)',
    },
  ];
</script>

<Gallery {items} layout="grid" aria-label="Trip photos" trust="developer" />
```

Lightbox opens from a tile; keyboard and focus return are package-owned.

**Gate:** `pnpm vitest run packages/media/tests/gallery.test.ts`

---

## Stage C — Video + captions

**Imports:** `@texuli/media/video`, `@texuli/media/captions`

```svelte
<script lang="ts">
  import { VideoPlayer } from '@texuli/media/video';
  import harborPoster from './harbor.svg?url&no-inline';

  const vtt = `WEBVTT

00:00:00.000 --> 00:00:02.000
Welcome aboard the Harbor ferry.
`;
</script>

<VideoPlayer
  src="https://media.example.test/harbor.webm"
  poster={harborPoster}
  allowedOrigins={['https://media.example.test']}
  title="Boats moving through a harbor"
  tracks={[{ id: 'en', label: 'English', kind: 'captions', vtt, default: true }]}
  showTranscript
  playsInline
/>
```

Cue text is **plain text** only. Use `parseWebVtt` / `CaptionsPanel` from
`@texuli/media/captions` when you need a standalone transcript.

**Gate:**

```bash
pnpm vitest run packages/media/tests/video.test.ts
pnpm vitest run packages/media/tests/captions.test.ts
```

---

## Stage D — Layered compositions

**Imports:** `@texuli/media/composition-model`, `@texuli/media/composition-canvas`,
`@texuli/media/composition-svg`

1. Build or validate a composition document (model package — pure data).
2. Render with **canvas** (dense bitmaps, blend modes) or **SVG** (selectable text).
3. Always pass a visible `label` / accessible name on the host component.

```svelte
<script lang="ts">
  import { CompositionCanvas } from '@texuli/media/composition-canvas';
  let { scene } = $props(); // validated composition document
</script>

<CompositionCanvas composition={scene} label="Spring campaign poster" />
```

**Gate:** `pnpm vitest run packages/media/tests/composition-model.test.ts`
(and `composition-canvas`, `composition-svg` or `composition-v2` for the
renderer you touched). Groups and layer timing live in
`@texuli/media/composition-v2`, which resolves any instant to a flat frame
for every renderer and the WebM export.

---

## Stage E — Export PNG / SVG / WebM

**Imports:** `@texuli/media/export`, `@texuli/media/export/ui`

```ts
import { downloadBlob, exportPng, exportSvg } from '@texuli/media/export';

const png = await exportPng(composition, { pixelRatio: 2, filename: 'poster' });
if (png.ok) downloadBlob(png.blob, png.filename);
// Failures are { ok: false, reason } — never throw for policy/validation.
```

```svelte
<script lang="ts">
  import { CompositionExport } from '@texuli/media/export/ui';
</script>

<CompositionExport {composition} {animation} filename="harbor-poster" background="#0f172a" />
```

Export runs **in the browser**. WebM recording is real-time; do not assert wall
clock in the default suite.

**Gate:** `pnpm vitest run packages/media/tests/export.test.ts`

---

## Stage F — Host generator slot

**Import:** `@texuli/media/generator-slot`

Texuli provides the **slot** only. The host supplies `generate(request, signal)`.

```svelte
<script lang="ts">
  import {
    GeneratorSlot,
    type MediaGenerator,
  } from '@texuli/media/generator-slot';

  const generate: MediaGenerator = async (request, signal) => {
    // Host-owned work. Honor AbortSignal. Return image or video result.
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    // Demo / offline: return a local developer asset, not a live model.
    return {
      kind: 'image',
      src: '/local-demo.svg',
      alt: `Demo still for “${request.prompt}”`,
    };
  };
</script>

<GeneratorSlot
  {generate}
  trust="developer"
  labels={{ idle: 'No model runs inside Texuli.' }}
/>
```

For untrusted result URLs use `trust="untrusted"` and `allowedOrigins`.
Unsafe results never render (`blocked` status). A result may carry
`provenance` (source, time, provider and model ids, SHA-256 hashes; never a
prompt or credential), shown as escaped text.

**Inert generation requests.** `parseMediaGenerationRequest` validates a
`media.generate-request` data node, and `GenerationRequestPlaceholder` paints
it as pending host resolution: no generator, no action, no network. The
catalog does not register it as agent-emittable.

**Gate:** `pnpm vitest run packages/media/tests/generator-slot.test.ts`

---

## Commit and handoff

- Conventional Commits with scope `media` (or `docs` / `examples` as needed).
- **Stage exact paths**, never `git add -A`. Never push.
- Report measured gzip for new lazy subpaths; do not edit `texuli.budgets.json`.

## Offline validation of this sub-skill

```bash
pnpm check:skill
# or
pnpm exec tsx scripts/check-skill.ts --write-sums
./skills/texuli/setup.sh --verify
pnpm vitest run scripts/tests/skill.test.ts
```

## Related references

- [`references/imports.md`](references/imports.md) — package entry points
- [`references/gates.md`](references/gates.md) — copy-paste gate matrix
- [`references/url-policy.md`](references/url-policy.md) — trust tiers and blocked schemes
- Router: [`../SKILL.md`](../SKILL.md) · Trust: [`../TRUST.md`](../TRUST.md)
