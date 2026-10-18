# Performance

All numbers on this page were **measured in this repository**, with the
method stated. Nothing is extrapolated. Machine for every measurement below:
Apple M1 Max MacBook Pro (64 GB, macOS 27.0), Node 26.11.1, pnpm 11.23.0,
2026-10-17.

## Prototype bundles (production builds)

Method: `pnpm protoyard build <slug>`, then raw and gzip (level 9) sizes of
every file in `artifacts/<slug>/dist`. DevTools excluded (the default).

| Prototype | Initial JS (gzip) | CSS (gzip) | Lazy Faker chunk (gzip) | Whole `dist` (raw / gzip) |
| --- | --- | --- | --- | --- |
| `crm-demo` | 194 KB (+14 KB shared chunk) | 12 KB | 150 KB | 1,185 KB / 371 KB |
| `mobile-banking-demo` | 181 KB (+14 KB) | 12 KB | 150 KB | 1,123 KB / 358 KB |
| `ai-chat-demo` | 182 KB (+14 KB) | 12 KB | 150 KB | 1,121 KB / 358 KB |

- **Faker loads only when a world is generated** (first seed, scenario load,
  reset or time advance) through a dynamic `import()`. Ordinary page opens
  never download it. Making it lazy cut the CRM's main chunk from 1,080 KB to
  666 KB raw.
- The biggest remaining contributors to the initial chunk (sourcemap
  analysis of the CRM build) are Svelte, zod, Bits UI, tailwind-variants and
  tailwind-merge, and Dexie, in that order.
- Each artifact contains only its own prototype's code. `protoyard export`
  checks this.

## Shells

Method: `pnpm protoyard build <slug>` at revision `459054c` plus the chunking fix
(2026-10-18, same machine, Node 26.11.1, pnpm 11.23.0, Vite 8.3.4 / Rolldown 1.2.13).
Each file is gzipped at level 9 with Node's zlib (no file name in the header). "Initial" is
the entry script plus everything it imports statically, which is what a page open
downloads. The before/after columns are `pnpm protoyard budget <slug>` (`initialJsGzip`,
KiB).

**Fix (2026-10-18).** The extension-popup frame loaded BrowserChrome with a dynamic
`import()` of the whole `@protoyard/ui` barrel. The entry already loads that barrel
(`<Toaster />`), so the bundler turned it into a shared chunk and put every member read
from it, including WindowChrome and BrowserChrome, in every prototype's initial JS. The
frame now imports BrowserChrome statically (it is already lazy), and a test
(`packages/renderer-svelte/tests/bundle-hygiene.test.ts`) fails on any dynamic import of
`@protoyard/ui`. Two runes-less side-panel host mocks now opt into runes mode, so they no
longer pull in Svelte's legacy helpers.

| Prototype (its shell) | Before | After | Change |
| --- | ---: | ---: | ---: |
| `crm-demo` (none) | 202.04 KiB | 165.44 KiB | −36.60 KiB |
| `mobile-banking-demo` (phone) | 199.38 KiB | 196.45 KiB | −2.93 KiB |
| `support-widget-demo` (widget-host) | 147.01 KiB | 144.00 KiB | −3.01 KiB |
| `nova-assistant-demo` (browser) | 165.49 KiB | 162.15 KiB | −3.33 KiB |

What the shell layer still costs, after the fix. The comparison builds were local edits
that were reverted afterwards: `Root.svelte` without `ShellHost`, and `ShellHost` with an
empty frame registry.

| Prototype | No `ShellHost` | `ShellHost`, empty registry | Current (7 frames registered) |
| --- | ---: | ---: | ---: |
| `crm-demo` | 164,902 B | 166,688 B (+1,786) | 169,414 B (+4,512) |
| `mobile-banking-demo` | 197,203 B | 198,656 B (+1,453) | 201,168 B (+3,965) |
| `support-widget-demo` | 143,567 B | 145,148 B (+1,581) | 147,455 B (+3,888) |
| `nova-assistant-demo` | 162,792 B | 164,537 B (+1,745) | 166,044 B (+3,252) |

- **Every prototype stays well under the 250 KB initial-JS budget.**
- **The shells target of at most 1.5 KB is still not met.** The host itself costs
  1.5–1.8 KB. The seven registered frames add 1.5–2.7 KB more: Vite's preload map (one
  entry per lazy chunk, about 150 B gzip) and the Svelte runtime helpers that the frames
  use. Those helpers live in the Svelte runtime chunk the entry already loads, so moving
  them would add a request without saving bytes. No frame component, chrome component or
  frame CSS is in the initial JS any more. A page opened without a shell downloads no
  frame code (checked in Chromium on `crm-demo`: `?shell=desktop-window` loads only
  `DesktopWindowFrame`, and `?shell=browser` loads `BrowserFrame` and `BrowserChrome`).

Lazy frame chunks (`crm-demo`; the other builds are within ±60 B). A frame's cost when it
is first shown is its chunk plus the lazy chunks it imports:

| Shell | Frame chunk | With its lazy imports |
| --- | ---: | ---: |
| `phone` (`PhoneFrame`) | 1,519 B | 3,322 B (+ `StatusBar`) |
| `tablet` (`TabletFrame`) | 1,134 B | 2,937 B (+ `StatusBar`) |
| `desktop-window` (`DesktopWindowFrame`, includes WindowChrome) | 3,362 B | 3,596 B (+ an icon) |
| `browser` (`BrowserFrame`) | 764 B | 3,342 B (+ `BrowserChrome`, shared with the popup) |
| `widget-host` (`WidgetHostFrame`) | 3,563 B | 3,563 B |
| `extension-popup` (`ExtensionPopupFrame`) | 1,501 B | 4,079 B (+ `BrowserChrome`) |
| `side-panel` (`SidePanelFrame`) | 2,449 B | 2,449 B, plus one host chunk: 1,116 B chat workspace, 976 B code editor, 749 B design canvas |

## Versioned budgets

Workspace targets live in the root `protoyard.budgets.json`, separate from
prototype manifests. The file uses format `protoyard.budgets`, version `1`,
and supports partial per-slug overrides. When the file is absent, the CLI
loader uses the defaults below.

| Field | Default | Meaning |
| --- | ---: | --- |
| `initialJsGzipKb` | 250 KB | Initial JavaScript transfer size after gzip |
| `cssGzipKb` | 30 KB | CSS transfer size after gzip |
| `coldStartMs` | `null` | No calibrated threshold yet; report-only until set (see [Cold start](#cold-start-built-prototypes)) |
| `generateMs` | 50 ms | Scenario generation target |
| `indexColdMs` | 100 ms | Cold metadata-index target |

These are configured targets, not new measurements. The measured results
above remain the source for observed performance. Loading and validating the
budget file does not itself enforce these targets in builds or CI.

For one prototype, set only the values that differ:

```json
{
  "format": "protoyard.budgets",
  "version": 1,
  "defaults": {
    "initialJsGzipKb": 250,
    "cssGzipKb": 30,
    "coldStartMs": null,
    "generateMs": 50,
    "indexColdMs": 100
  },
  "overrides": {
    "crm-demo": { "initialJsGzipKb": 280 }
  }
}
```

The root file contains these defaults with an empty `overrides` object.
Budgets stay out of `protoyard.json` so performance targets can evolve
without changing the strict prototype manifest contract.

**Route-level code splitting (available):** `@protoyard/renderer-svelte`
`createRouter` accepts `load: () => import('./Screen.svelte')` per route.
`<Router>` shows `LoadingState` while the chunk loads and `ErrorState` with
retry on failure; eager `component` routes are unchanged. Use `load` for
secondary screens in multi-entity apps so they leave the initial chunk.
Flagship prototypes still ship mostly eager routes today — adopt `load` when
adding screens that would push initial JS over the 250 KB gzip budget. No
before/after gzip delta is recorded here until a flagship switches a real
screen to `load` (crm-demo validate --build still passes with eager routes).

**Possible next steps (not done):** zod's smaller `zod/mini` build for runtime
parsing; moving secondary crm-demo / generated-app screens onto `load`.

## Cold start (built prototypes)

Method: `pnpm exec tsx scripts/bench-cold-start.ts <slug…> --runs <n>`
serves `artifacts/<slug>/dist` (build first with
`pnpm protoyard build <slug>`) with the CLI's static server on an
OS-assigned port, then opens a **fresh** headless Chromium context per run
(1280×800) and reads two performance marks that `mountPrototype` sets, both
measured from navigation start:

- `protoyard:world-ready`: the runtime is open and the world exists.
- `protoyard:ready`: the first screen has rendered (`html[data-protoyard-ready="1"]`).

**First visit** starts with an empty IndexedDB, so the default scenario is
generated (Faker is downloaded lazily) and written before the app renders.
**Repeat visit** reloads the same context: the stored world is reused and
the HTTP cache is warm. Results go to `tmp/bench-cold-start-<timestamp>.json`
with every sample and the machine.

Medians of 5 runs on 2026-10-18 (Apple M1 Max, 10 cores, 64 GB, macOS 27.0,
Node 26.11.1, headless Chromium 156.0.8078.4, a local static server, no
network throttling, production builds without DevTools):

| Prototype | First visit: ready (world ready) | Range | Repeat visit: ready (world ready) | Range |
| --- | --- | --- | --- | --- |
| `crm-demo` | **141 ms** (105 ms) | 139–148 ms | **44 ms** (34 ms) | 41–45 ms |
| `mobile-banking-demo` | **132 ms** (106 ms) | 130–137 ms | **38 ms** (31 ms) | 37–43 ms |

- Most of a first visit is building the world (generate, validate, write),
  not rendering: `ready` follows `world ready` by about 26 to 36 ms.
- **Not measured:** real phones, throttled CPU or network, a remote host, or
  a cold HTTP cache on repeat visits. No claim is made beyond this table.

`--check` compares both medians with `coldStartMs` (per-prototype overrides
apply) and exits `1` when one is over. While `coldStartMs` is `null` it
prints "not calibrated … reported only, not gated" and passes, as ADR-019
says. Setting the threshold is a separate decision: CI runners are slower
than this machine.

```bash
pnpm protoyard build crm-demo
pnpm exec tsx scripts/bench-cold-start.ts crm-demo --runs 5 --check
```

## Metadata index and gallery at 1,000 prototypes

Method: `pnpm bench:index --runs 5 --gallery` (`scripts/bench-index.ts`)
generates 1,000 synthetic `protoyard.json` manifests in a temporary
workspace, which is never committed. It then times indexing (cold, warm, and
incremental after touching 10 manifests), in-memory search and sort,
`protoyard list --json` end to end, and a full static gallery build over the
synthetic registry. These are medians of 5 runs on 2026-10-17.

Three independent runs were made the same day: by the lead, by Lane C, and
by the plan's gate. The table shows the lead's 5-run medians, with the range
of medians across all three runs in brackets.

| Operation | Median | Notes |
| --- | --- | --- |
| Cold index, 1,000 manifests | **40.6 ms** [40.6–48.9] | Reads and validates JSON only. No prototype code runs. |
| Warm index (cache hit) | **13.7 ms** [13.7–16.8] | 1,001 of 1,001 entries served from the path + mtime + size cache |
| Incremental index (10 changed) | **13.5 ms** [13.5–15.5] | Only the 10 touched manifests are re-parsed |
| Search + sort in memory | **0.65 ms** [0.65–0.68] | Over all 1,001 registry entries |
| `pnpm protoyard list --json` end to end | 434 ms [434–477] | Mostly Node + tsx startup, then an incremental re-index |
| Gallery static build | 2.4 s [2.4–2.8] | 1,003 pages (home + one detail page per entry) |

Lane C measured the gallery home page with 1,000 entries at 377 KB HTML
(38 KB gzip), with the search box interactive about 97 ms after load and a
search update in about 17 ms (headless Chromium).

Nothing is compiled for listing: the gallery imports only the registry.
Scaling past 1,000 prototypes was not measured.

**Gate:** `pnpm bench:index --runs 3 --check` compares the cold and
incremental index medians with `indexColdMs` from `protoyard.budgets.json`
(100 ms), multiplied by `--ci-factor` (default 3, so 300 ms, because CI
runners are slower than the M1 Max), and exits `1` when either is over. It
requires the default 1,000 manifests. A check run on 2026-10-18 on the same
M1 Max measured cold 65.8 ms and incremental 21.5 ms (3 runs). That is slower than
the 40.6 ms in the table above; machine load was not controlled for.
`--ci-factor 0.01` forces a 1 ms
threshold and fails, which is how the gate itself was verified.

## Large worlds (scenario loads)

Measured with the `crm-demo` **`enterprise-scale`** scenario: **16,075 rows**
(300 companies, about 900 contacts, about 3,000 deals, more than 8,000
activities, plus identities), with zero integrity violations. Machine:
Apple M1 Max (64 GB, macOS 27.0), Node 26.11.1, Dexie 4.4.6. Medians of
3 runs, with ranges.

**Strategy.** The world is written in a **single read-write transaction**, so
a load is atomic: a failure in a later chunk leaves the previous world
byte-identical, and this is tested. Inside it, rows go in through
**chunked `bulkAdd`** (default 1,000 rows per chunk). Phases
(generate → validate → write) yield to the event loop between them, and
progress is reported per chunk (`onProgress`, `scenarios.subscribeProgress()`).
DevTools and the app shell show a progress bar.

| Environment | Generate | Validate | Write | Total `load()` | Long tasks |
| --- | --- | --- | --- | --- | --- |
| Headless Chromium 156, production build, chunk 1,000 | 26 ms | 10 ms | 477 ms (470–478) | **628 ms** (626–628) | **0** |
| Headless Chromium, single `bulkAdd` per table | 26 ms | 10 ms | 478 ms | 633 ms | 1 (85 ms) |
| Node + fake-indexeddb, chunk 1,000 | 21 ms | 9 ms | 417 ms (414–433) | — | — |

- Chunking doesn't change throughput (about 34 rows/ms in Chromium). It does
  remove main-thread stalls: zero long tasks at every chunk size from 250 to
  2,000, compared with an 85 ms long task and 67–83 ms frame gaps for a single
  `bulkAdd`.
- Generation and validation are cheap. Writing dominates.
- **Not measured:** real mobile devices, and worlds larger than about 16k rows.
  No scaling claim is made beyond what is in this table.

Reproduce:

```bash
PROTOYARD_BENCH=1 PROTOYARD_BENCH_RUNS=3 pnpm vitest run prototypes/crm-demo/tests/enterprise-scale.test.ts --silent=false
```

## Runtime behavior worth knowing

- **Reads are reactive and scoped.** `liveQuery` re-runs only when the tables
  a query touched change.
- **Writes are transactional.** Scenario loads write the whole world in one
  transaction (clear, then insert). The UI shows the result when it commits.
- **Per-origin storage quota.** Every prototype opened from the same origin
  shares the browser's quota. `runtime.storage()` reports usage and quota
  when the browser exposes them.
- **The dev server is per prototype.** `protoyard dev <slug>` starts Vite for
  one app only, so HMR cost doesn't grow with the number of prototypes.
