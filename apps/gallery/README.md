# @protoyard/gallery

The Protoyard gallery: a static Astro 7 site, with Svelte 5 islands and Tailwind 4, that lists
every prototype and template in the workspace. It reads **only** the generated metadata registry
and never imports prototype code.

```bash
pnpm dev                                  # index + local control server + gallery on :4321
pnpm --filter @protoyard/gallery build    # astro check + static build (dist/)
pnpm protoyard showcase --serve           # gallery + every prototype build as ONE site
```

## Architecture

```text
prototypes/*/protoyard.json ─┐
templates/*/protoyard.json  ─┴─ pnpm protoyard index ──▶ .protoyard/registry.json
                                                              │  (data only)
                     src/integrations/registry-plugin.mjs ◀───┘
                       virtual:protoyard-registry  →  { registry, registryError, thumbnails }
                                │
        src/pages/index.astro ──┼── Browser.svelte (search / filters / pagination)
        src/pages/p/[slug].astro┼── LivePreview.svelte (device frame + control server / bundled build)
        src/pages/t/[slug].astro┘── CreateBuilder.svelte (command + agent prompt builder)
```

| Path | Role |
| --- | --- |
| `astro.config.mjs` | Static output, `@/*` alias, Tailwind via `@tailwindcss/vite`, `GALLERY_BASE` / `GALLERY_SITE` for sub-path hosting. |
| `src/integrations/registry-plugin.mjs` | Astro integration plus Vite plugin. It provides the registry as a virtual module, reloads dev on every `protoyard index`, serves thumbnails in dev and copies them into `dist/thumbnails/` after a build. |
| `src/lib/registry.ts`, `types.ts` | The registry contract (a mirror of `packages/cli/src/lib/registry.ts`) and the compact per-card index. |
| `src/lib/search.ts` | Pure filtering and sorting over a pre-normalized index, plus query ⇄ URL sync. |
| `src/lib/library.svelte.ts` | Favorites and recently opened entries, in guarded `localStorage`. |
| `src/lib/control.svelte.ts` | Client for the local control server. |
| `src/lib/theme.ts` | Light / dark / system, applied by an inline head script before first paint (no flash). |
| `src/components/*` | `Browser`, `ProjectCard`, `LivePreview`, `CreateBuilder`, `CommandBlock`, `ThemeToggle`, `FavoriteButton`, `FirstRun`. |

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

Scale: the home page inlines a compact index (about 380 KB raw, 38 KB gzip, for 1,000 entries),
renders 24 cards per page, and filters in a few milliseconds per keystroke. Run
`pnpm bench:index --gallery` for measured numbers on your machine.

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
