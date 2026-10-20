# @protoyard/gallery

The Protoyard gallery: a static Astro 7 site, with Svelte 5 islands and Tailwind 4, that lists
every prototype and template in the workspace. It reads the generated metadata registry and optional
pulled review comment files at build time; it never imports prototype code.

```bash
pnpm dev                                  # index + local control server + gallery on :4321
pnpm --filter @protoyard/gallery build    # astro check + static build (dist/)
pnpm protoyard showcase --serve           # gallery + every prototype and template demo as ONE site
```

## Architecture

```text
prototypes/*/protoyard.json ─┐
templates/*/protoyard.json  ─┴─ pnpm protoyard index ──▶ .protoyard/registry.json
                                                              │  (data only)
                     src/integrations/registry-plugin.mjs ◀───┘
                       virtual:protoyard-registry  →  { registry, registryError, thumbnails }
                       + artifacts/review-comments/comments/<slug>.json → static counts
                                │
        src/pages/index.astro ──┼── Browser.svelte (search / filters / pagination)
        src/pages/p/[slug].astro┼── LivePreview.svelte (device frame + control server / bundled build)
        src/pages/t/[slug].astro┘── CreateBuilder.svelte (command + agent prompt builder)
```

| Path | Role |
| --- | --- |
| `astro.config.mjs` | Static output, `@/*` alias, Tailwind via `@tailwindcss/vite`, `GALLERY_BASE` / `GALLERY_SITE` for sub-path hosting. |
| `src/integrations/registry-plugin.mjs` | Astro integration plus Vite plugin. It provides the registry as a virtual module, decorates prototype entries with validated review counts from local pulled files, reloads watched data in dev, serves thumbnails and copies them into `dist/thumbnails/` after a build. |
| `src/lib/registry.ts`, `types.ts` | The CLI registry contract plus its build-time review-count enrichment, and the compact per-card index. |
| `src/lib/search.ts` | Pure filtering and sorting over a pre-normalized index, plus query ⇄ URL sync. |
| `src/lib/library.svelte.ts` | Favorites and recently opened entries, in guarded `localStorage`. |
| `src/lib/control.svelte.ts` | Client for the local control server. |
| `src/lib/theme.ts` | Light / dark / system, applied by an inline head script before first paint (no flash). |
| `src/components/*` | `Browser`, `ProjectCard`, `LivePreview`, `CreateBuilder`, `CommandBlock`, `ThemeToggle`, `FavoriteButton`, `FirstRun`. |

## Pages

| Route | Page |
| --- | --- |
| `/` | Browse every prototype and template: search, filters, favorites, recently opened |
| `/p/<slug>/` | A prototype's detail page with the live preview |
| `/p/<slug>/compare/` | Two scenarios side by side ([below](#compare-scenarios)) |
| `/t/<slug>/` | A template's detail page with **Use this template** and the prototypes made from it |
| `/new/` | The create builder: the `protoyard new` command and an agent prompt |
| `/themes/` | The theme browser: built-in and library themes with live swatches, opening any prototype in a chosen theme |
| `/marketplace/`, `/marketplace/<kind>/<slug>/` | The marketplace shelf and one page per prototype, template or blueprint ([below](#marketplace)) |

## Registry contract

The gallery consumes `protoyard.registry` v1 (`format`, `version`, `generatedAt`, `entries[]`,
`invalid[]`, `stats`), as written by `pnpm protoyard index`:

- **Missing file:** a first-run page with the exact commands. The build never fails because of it.
- **Malformed file:** an explanatory error state.
- **`invalid[]` non-empty:** a notice that some folders are hidden, pointing at `pnpm protoyard index`.
- **`PROTOYARD_REGISTRY=<file>`** builds from another registry: benchmarks use a synthetic 1,000-entry
  one, and showcases use `.protoyard/showcase-registry.json`. Entry paths resolve against the folder
  that holds that file's `.protoyard/`.
- **`thumbnail`** (from `protoyard.json`, relative to the prototype folder): published only if it
  stays inside that folder, is a raster image (`png`, `jpg`, `webp`, `avif`, `gif`; no SVG, which could run script on
  the gallery origin) and is at most 2 MB. Neither the folder nor the file may be a symlink, and its
  real path must stay inside the real prototype folder. Otherwise the card falls back to the icon.
  Untrusted registries are filtered: entries with a slug that fails `SLUG_PATTERN`, an unknown kind
  or a `..` path are dropped.
- **`embedded: { url }`** (added only by `protoyard showcase`): the prototype's static build ships
  inside the site at `<base><url>`.
- **`reviewCounts: { open, resolved, pulledAt }`** (optional): derived at build time from a validated
  `artifacts/review-comments/comments/<slug>.json` pulled file. Missing or invalid files add no count, and
  the gallery does not fetch comment summaries in the browser.

Scale: the home page inlines a compact index (about 380 KB raw, 38 KB gzip, for 1,000 entries),
renders 24 cards per page, and filters in a few milliseconds per keystroke. Run
`pnpm bench:index --gallery` for measured numbers on your machine.

## As an installed package

The gallery is also the npm package `@protoyard/gallery`. It ships its Astro
sources (`src`, `public`, `astro.config.mjs`, `tsconfig.json`), because Astro
builds the site from them on the consumer's machine. The CLI finds it in this
order (`resolveGalleryDir` in `packages/cli/src/commands/serve.ts`):

1. `node_modules/@protoyard/gallery`, walking up from the workspace root (a
   consumer workspace that added it, for example `pnpm add -D @protoyard/gallery`);
2. the same, walking up from the CLI's own folder (installed next to the CLI);
3. `apps/gallery` in this repository.

A folder counts only when its `package.json` is named `@protoyard/gallery` and
it has `astro.config.mjs`; package-manager symlinks resolve to the real folder.
NODE_PATH is ignored, so a consumer workspace never picks up an unrelated copy.
`protoyard gallery` and `protoyard showcase` pass the workspace's registry as
`PROTOYARD_REGISTRY`, and for an installed package `protoyard gallery` keeps the
Astro and Vite caches in `.protoyard/gallery-cache/`. Run outside the CLI,
the config reads `PROTOYARD_REGISTRY`, then `PROTOYARD_ROOT/.protoyard/registry.json`,
then this repository's `.protoyard/registry.json`. The published path runs
`astro build` only; `astro check` stays a development gate in the `build` script.

## Marketplace

`/marketplace/` lists every prototype, template and blueprint from the
registry's `catalog` blocks: category rails, search, filters (kind, category,
platform, shell, features, theme collection) kept in the URL, and a detail page per entry. Try it,
Use this template and Remix use the local control server (`POST /api/dev/<slug>`,
`POST /api/new`) and fall back to the exact CLI commands when the site is
read-only (a published showcase). Creating from the gallery writes files and
runs code, so it is off unless the gallery runs with
`pnpm protoyard gallery --allow-create`; the client sends the per-run token
from `GET /api/status`.

**Themes on the shelf.** Each card shows its default theme: a swatch and the
name, mapped at build time from the registry's `defaultTheme` to library
metadata (`src/components/marketplace/theme-facet.ts`, never loaded by the
browse island, and no request per card). Library themes show their seed and
secondary colors, built-ins their light and dark primary, and a prototype's
own theme its id (collection `custom`). The **Theme** filter narrows the
shelf by that theme's collection (`?collection=high-contrast`). Prototype and
template cards have a **Try in theme** list with one library theme per
collection and a link to all themes. It renders only once opened, so a large
shelf ships no extra links. Each entry opens the detail page with
`?theme=<id>`, and the live preview then frames the demo with the same
`?theme=` link parameter (the runtime loads library themes on demand) and
says which theme it shows, with a link back to the default.

## Live preview modes

| Where the gallery runs | Detail page behavior |
| --- | --- |
| `pnpm dev` (control server on `127.0.0.1:4300`) | **Start** spawns that prototype's own Vite dev server through `POST /api/dev/:slug`, then frames it. **Open**, **Reload** and **Stop** are available. |
| Static hosting, no control server | Read-only. Shows the terminal command and lets you paste a URL (e.g. `http://localhost:5173/`) to frame. The URL is reachability-checked first. |
| A `protoyard showcase` site | **Live demo**: frames the bundled build at `<base>p/<slug>/app/`. A scenario picker and scenario chips open `?scenario=<id>` links. No server needed. |

Detection is a fetch to `/api/status` with an 800 ms timeout, and only when the page itself is
served from `localhost` or `127.0.0.1`. The control server checks `Host` and `Origin`; see
`packages/cli/README.md`.

Storage note: every prototype keeps its data in IndexedDB **per origin**. The dev server, a local
preview and a published URL each have their own data, and the gallery's preview iframe shares
storage with that origin opened directly. The detail page says this in plain words.

## Compare scenarios

`/p/<slug>/compare/` (linked from the detail page as *Compare scenarios side by side*) shows the
same prototype in 2 or 3 frames. Each frame has its own scenario picker and its own isolated
data: its URL is `<app>?sandbox=compare-<a|b|c>[-<n>]&scenario=<id>&devtools=0`, and the runtime
then uses a separate database pair (`protoyard.<namespace>~<sandbox>.*`). Records created in one
frame never appear in another, and the prototype's normal (non-sandboxed) data is never touched.

- **Controls:** *Swap A and B*, *Add a third frame* / *Remove frame C*, one shared device preset
  for all frames, and *Reset sandboxes*. Reset bumps a generation number, which gives every frame
  a fresh sandbox name, so each world re-seeds from its scenario. A plain reload keeps the edits
  made in a sandbox.
- **Deep links:** `?a=<scenario>&b=<scenario>[&c=…][&device=iphone][&gen=<n>]`. Unknown values
  fall back to the default scenario, the next scenario and Desktop.
- **Where frames come from:** a bundled build in a showcase site; a running dev server when the
  local control server is available (*Start* runs it); otherwise the page explains what to run and
  accepts a pasted prototype URL, which is framed with an iframe `sandbox` (it may be any origin).
  A read-only hosted gallery never runs code on its own.
- **Tested:** `tests/e2e/showcase.spec.ts` creates a record in frame A, then checks that frame B
  (same scenario) and the app's default world do not have it, and that *Reset sandboxes* starts
  frame A fresh. The page is also covered by the axe checks.

## Accessibility

- A skip link, landmark regions, one `h1` per page, and labelled sections.
- Every control has a visible or `sr-only` label. Toggle groups use `aria-pressed`, and the result
  count and copy feedback are `aria-live`.
- Cards use one stretched link (one tab stop) plus a separate favorite button.
- Keyboard: `/` focuses search, and every control is reachable and visible on `:focus-visible`.
- Light and dark tokens meet WCAG AA for body text. Status is never shown by color alone (text or
  icon too). `prefers-reduced-motion` is honored.
- No horizontal overflow at phone widths (covered by E2E on a Pixel 7 viewport).

## Tests

- Unit: `apps/gallery/tests/*.test.ts` (search, URL sync, commands, device helpers), run by the
  root `pnpm test`.
- E2E: `tests/e2e/gallery.spec.ts` and `tests/e2e/showcase.spec.ts` (`PROTOYARD_E2E_SHOWCASE=1`)
  run against real static builds, in Chromium desktop and mobile projects.
