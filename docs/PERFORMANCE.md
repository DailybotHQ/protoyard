# Performance

All numbers on this page were **measured in this repository**, with the
method stated. Nothing is extrapolated. Machine for every measurement below:
Apple M1 Max MacBook Pro (10 cores, 64 GB, macOS 27.0), Node 26.11.1,
pnpm 11.23.0. Each section states its date (2026-10-17 or 2026-10-18).

## Prototype bundles (production builds)

Method: `pnpm protoyard build --all` (DevTools excluded, the default). Every
build records its sizes in `build-manifest.json` under `bundle`, gzip level 9
per file: **initial JS** is the entry chunk plus everything it imports
statically (what a first page load downloads), **lazy JS** is every chunk
reached only through `import()`. `pnpm protoyard budget --all --skip-build`
reads those numbers and checks them. Measured 2026-10-18, after the merge of the eighth prototype (Vite 8.3.4):

| Prototype | Initial JS (gzip) | CSS (gzip) | Lazy JS (gzip, all chunks) | Largest lazy chunk (Faker) | Whole `dist` (raw / gzip) |
| --- | ---: | ---: | ---: | ---: | --- |
| `crm-demo` | 166 KB | 16 KB | 261 KB (40 chunks) | 150 KB | 1,452 KB / 561 KB |
| `mobile-banking-demo` | 197 KB | 16 KB | 185 KB (14 chunks) | 150 KB | 1,318 KB / 474 KB |
| `ai-chat-demo` | 196 KB | 16 KB | 185 KB (14 chunks) | 150 KB | 1,343 KB / 503 KB |
| `nova-assistant-demo` | 162 KB | 18 KB | 199 KB (20 chunks) | 150 KB | 1,157 KB / 380 KB |
| `support-widget-demo` | 144 KB | 15 KB | 185 KB (14 chunks) | 150 KB | 1,052 KB / 345 KB |
| `lattice-saas-demo` | 198 KB | 16 KB | 235 KB (38 chunks) | 150 KB | 1,361 KB / 450 KB |
| `relay-chat-demo` | 143 KB | 16 KB | 185 KB (14 chunks) | 150 KB | 1,054 KB / 345 KB |
| `ui-kit` | 182 KB | 16 KB | 375 KB (140 chunks) | 150 KB | 1,647 KB / 575 KB |

Every prototype is inside the 250 KB initial-JS and 30 KB CSS budgets
(`lattice-saas-demo` has the least headroom, about 52 KB). The table of
2026-10-17 counted a 14 KB chunk as "shared initial"; the build analysis
shows it is loaded through `import()`, so it is lazy. Earlier on 2026-10-18
`crm-demo` measured 202 KB initial; it is 166 KB after its screens moved to
lazy routes (`src/routes.ts`).

AI-era flagships (Nova, Relay) and refreshed kit builds are recorded under
[AI kits](#ai-kits). The `ai-chat-demo` row above is the 2026-10-17 baseline;
the 2026-10-18 rebuild in that section is the current measured value.

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

These budgets are **enforced**:

| Budget | Gate | Fails with |
| --- | --- | --- |
| `initialJsGzipKb`, `cssGzipKb` | `pnpm protoyard budget <slug\|--all> [--skip-build]` | exit 4 |
| `indexColdMs` | `pnpm bench:index --runs 3 --check [--ci-factor 3]` | exit 1 |
| `generateMs` | `pnpm protoyard scenario bench <slug> --check` | exit 4 |
| `coldStartMs` | `pnpm exec tsx scripts/bench-cold-start.ts <slug…> --check` | report only while `null` |

The `perf` job in [.github/workflows/ci.yml](../.github/workflows/ci.yml)
runs the first three on every pull request and push to `main`, and reports
cold start without gating it (see
[TESTING_GUIDE](TESTING_GUIDE.md#ci-performance-job-githubworkflowsciyml--perf)).
The bundle gate on this repository (2026-10-18, abridged to two of the eight
prototypes):

```text
$ pnpm protoyard budget --all
Prototype            Metric         Value               Budget              Headroom    Result
───────────────────  ─────────────  ──────────────────  ──────────────────  ──────────  ──────
lattice-saas-demo    initialJsGzip  198 KB (197.70 KB)  250 KB (250.00 KB)  +52.30 KB   PASS
lattice-saas-demo    cssGzip        16 KB (15.95 KB)    30 KB (30.00 KB)    +14.05 KB   PASS
crm-demo             initialJsGzip  166 KB (165.64 KB)  250 KB (250.00 KB)  +84.36 KB   PASS
crm-demo             cssGzip        16 KB (15.93 KB)    30 KB (30.00 KB)    +14.07 KB   PASS
```

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
network throttling, production builds without DevTools), after the build of
the bundle table above:

| Prototype | First visit: ready (world ready) | Range | Repeat visit: ready (world ready) | Range |
| --- | --- | --- | --- | --- |
| `crm-demo` | **115 ms** (95 ms) | 110–170 ms | **43 ms** (36 ms) | 41–44 ms |
| `mobile-banking-demo` | **130 ms** (101 ms) | 125–134 ms | **40 ms** (33 ms) | 39–42 ms |
| `ai-chat-demo` | **125 ms** (95 ms) | 122–129 ms | **39 ms** (32 ms) | 37–45 ms |
| `nova-assistant-demo` | **108 ms** (74 ms) | 106–114 ms | **39 ms** (32 ms) | 38–42 ms |
| `support-widget-demo` | **104 ms** (76 ms) | 101–110 ms | **39 ms** (30 ms) | 36–40 ms |
| `ui-kit` | **117 ms** (76 ms) | 115–125 ms | **45 ms** (34 ms) | 41–48 ms |

- Most of a first visit is building the world (generate, validate, write),
  not rendering: `ready` follows `world ready` by about 20 to 41 ms.
- An earlier run the same day measured crm-demo at 141 ms and
  mobile-banking-demo at 132 ms on first visit. Runs vary by a few tens of
  milliseconds on this machine, which is one reason the threshold is not
  set yet.
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

## Themes: library, palette engine and Theme Studio

Budget: the theme work (palette engine, font catalog, 32-theme library,
Theme Studio) may add at most **2 KB gzip** to any prototype's initial JS.
Measured 2026-10-18 on `crm-demo`, with the method of
[Prototype bundles](#prototype-bundles-production-builds) plus a sourcemap
attribution:

1. `vite build --sourcemap` of `prototypes/crm-demo` into a scratch folder,
   with the same renderer config as `protoyard build`. Its initial JS
   (165.9 KB gzip) matches the regular build's 165.6 KB within the
   sourcemap comments.
2. Every byte of the initial chunks is attributed to its source file through
   the sourcemaps.
3. The same build with `packages/themes/src/apply.ts` and `no-flash.ts`
   restored to their state before the theme work (the parent of the
   palette-engine commit `add3536`). They are the only theme files in the
   initial chunks that changed since then; the files were restored afterwards.

| Measure | Before the theme work | Now | Delta |
| --- | ---: | ---: | ---: |
| Initial JS, gzip (all initial chunks) | 169,598 B | 169,926 B | **+328 B** |
| Theme code inside the initial chunks, raw | 10,623 B | 11,429 B | +806 B |

In `crm-demo`, the attribution shows that the theme code in the initial
chunks is only the always-loaded engine: `apply.ts`, `presets.ts`,
`scales.ts`, `contrast.ts` and `no-flash.ts`. No byte comes from
`palette.ts`, `oklch.ts`, `fonts.ts` or `library/`. For all eight prototypes
built on 2026-10-18, a string check found no library theme id, no palette
error text and no Studio label in any initial chunk. That check covers the
library, the palette engine and the Studio, not the font catalog.

Lazy chunks, loaded only when used (gzip):

| Chunk | When it loads | Size |
| --- | --- | ---: |
| Theme Studio section (Studio UI + palette engine) | opening Theme Studio in DevTools (builds with DevTools only; `crm-demo --include-devtools`) | 7.2 KB |
| Library theme builder (`loadLibraryTheme` → `import('./build.ts')`) | applying a library theme (`ui-kit`) | 0.3 KB |
| `ui-kit` Theme Lab page (32 library definitions, palette, UI) | opening that route | 11.3 KB |

Builds without DevTools (the default) do not contain the Studio at all.

## Scenario generation

Method: `pnpm protoyard scenario bench <slug> [--check]` runs the generator
and the integrity validation for each scenario in a child process, three
times, and reports the medians and the row counts. `--check` compares
generate + validate with `generateMs` (50 ms). Measured 2026-10-18; the
heaviest scenario per prototype:

| Prototype | Scenario | Rows | Generate | Validate | Total |
| --- | --- | ---: | ---: | ---: | ---: |
| `crm-demo` | `enterprise-scale` | 16,075 | 24.4 ms | 5.3 ms | **29.6 ms** |
| `mobile-banking-demo` | `active-customer` | 328 | 10.6 ms | 0.2 ms | **10.8 ms** |
| `ai-chat-demo` | `agent-outage` | 175 | 1.9 ms | 0.1 ms | **2.0 ms** |

All 22 scenarios of these three prototypes pass the 50 ms budget. Generation
is only part of a scenario load; writing the rows to IndexedDB dominates (see
[Large worlds](#large-worlds-scenario-loads)).

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

## AI kits

Method and machine: Apple M1 Max (arm64, 64 GB, macOS 27.0), Node 26.11.1,
pnpm 11.23.0, 2026-10-18. Production builds with DevTools excluded:
`pnpm protoyard build <slug>` then `pnpm protoyard budget <slug>`. Whole-`dist`
gzip is the sum of per-file gzip level 9 (Node zlib, no filename header).
Long-thread generation timed with `performance.now()` over 5 runs in Node
(median). Virtual-window cost is a microbench of
`calculateVirtualWindow` from `@protoyard/ai-ui` (same Node process).

**Honest boundary:** these numbers are for **simulated** AI only — response
packs, scripted voice captions, fictional tools. No provider SDK and no
network completion path is included. Product docs:
[AI_KITS.md](AI_KITS.md).

### Flagship and kit bundles

| Target | Initial JS (gzip) | CSS (gzip) | Lazy JS (gzip, sum) | Whole `dist` (raw / gzip) | Budget |
| --- | ---: | ---: | ---: | ---: | --- |
| `nova-assistant-demo` | **165 KB** (165.48) | 18 KB (17.58) | 195 KB | 1,166 KB / 382 KB | PASS (+84.5 KB headroom) |
| `relay-chat-demo` | **146 KB** (146.11) | 13 KB (12.93) | 181 KB | 1,039 KB / 343 KB | PASS (+103.9 KB) |
| `ai-chat-demo` (2026-10-18 rebuild) | **199 KB** (199.23) | 16 KB (15.86) | 181 KB | 1,350 KB / 504 KB | PASS (+50.8 KB) |
| `templates/agent-console` build artifact | **209 KB** | 17 KB | 181 KB | 1,286 KB / 409 KB | under 250 KB initial |

Every row stays under the workspace **250 KB** initial-JS gzip default
(`protoyard.budgets.json`). Nova keeps voice, widget panel and canvas on
lazy chunks; sample gzip sizes from the Nova `dist/assets` build:

| Lazy chunk (Nova) | Gzip |
| --- | ---: |
| `voice-*.js` | 3.2 KB |
| `AssistantWidgetPanel-*.js` | 5.8 KB |
| `WidgetDemo-*.js` | 3.6 KB |
| `CanvasPanel-*.js` | 1.3 KB |

Reproduce:

```bash
pnpm protoyard build nova-assistant-demo
pnpm protoyard budget nova-assistant-demo
pnpm protoyard build relay-chat-demo && pnpm protoyard budget relay-chat-demo
pnpm protoyard build ai-chat-demo && pnpm protoyard budget ai-chat-demo
```

### Long threads

| Workload | Result | Method |
| --- | --- | --- |
| Nova `long-history` world | **5,000** messages, byte-identical on regenerate, 0 integrity violations | `generateAssistantWorld` + `validateWorld` |
| Generate median (5 runs) | **4.3 ms** (range 4.1–6.4 ms) | Node, same machine as above |
| Validate after generate | **4.0 ms** | one pass after the median generate |
| `@protoyard/ai` `powerUser` fragment | **600** messages (8 × 75) | `AI_SCENARIO_FRAGMENTS.powerUser` |
| Virtual window @ 5,000 × est. 120 px | **14** DOM items (overscan 4), total height 600,000 px | `calculateVirtualWindow(5000, 120_000, 600, [], 120, 4)` |
| One window calc median | **22 µs** (p95 27 µs); 1,000 calls **26.2 ms** | Node microbench |

Unit coverage that locks these shapes:

```bash
pnpm vitest run prototypes/nova-assistant-demo   # includes 5,000-message determinism
pnpm vitest run packages/ai-ui                   # virtual window + MessageList
pnpm vitest run packages/ai                      # scenarios (600-message powerUser), packs, voice
```

**Not measured here:** Chromium paint/scroll FPS for the 5,000-row thread,
throttled mobile CPUs, or first-visit cold start for Nova/Relay (use
`scripts/bench-cold-start.ts` when calibrating those slugs). No claim is made
beyond the table.

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
