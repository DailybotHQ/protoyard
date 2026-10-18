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

Method: `pnpm protoyard build <slug>` at revision `d17bf47` (2026-10-18, same machine,
Node 26.11.1, pnpm 11.23.0, Vite 8.3.4 / Rolldown 1.2.13). Each file is gzipped at level 9
with Node's zlib (no file name in the header, so a few bytes smaller than `gzip -9`).
"Initial" is the entry script plus everything it imports statically, which is what a page
open downloads. `pnpm protoyard budget crm-demo` reports 202.03 KiB (206,881 B) on the
same build, which agrees. The comparison builds were local edits that were reverted
afterwards: `Root.svelte` without `ShellHost`, then `ShellHost` with an empty frame
registry.

| Prototype (its shell) | No `ShellHost` | `ShellHost`, no frames | Current (7 frames registered) |
| --- | ---: | ---: | ---: |
| `crm-demo` (none) | 164,895 B | 166,684 B (+1,789) | 206,868 B (+41,973) |
| `mobile-banking-demo` (phone) | 197,202 B | 198,655 B (+1,453) | 204,170 B (+6,968) |
| `support-widget-demo` (widget-host) | 143,567 B | 145,148 B (+1,581) | 150,532 B (+6,965) |

- **Every prototype stays under the 250 KB initial-JS budget.**
- **The shell host itself costs 1.5–1.8 KB gzip.** That is just over the 1.5 KB target the
  shells work set for `crm-demo` (1,789 B) and `support-widget-demo` (1,581 B).
- **Registering the frames costs far more than their own chunks**, and it is not met by
  the target. No frame chunk is preloaded, but the bundler places code that the lazy
  frames share with the rest of `@protoyard/ui` (WindowChrome and BrowserChrome are both
  in the initial chunk of all three builds) into chunks the entry loads. On `crm-demo`, which
  also has lazy routes, the shared-chunk shift is about 40 KB. An experiment that marked
  only CSS as side-effectful in `@protoyard/ui` cut `crm-demo` to 175,875 B, but made
  `mobile-banking-demo` slightly larger (205,064 B in 8 files), so the fix needs its own
  task (chunking rules in the Vite config factory, or how ui declares side effects). It is
  not done.

Lazy frame chunks (`crm-demo`; the other two builds are within ±60 B). A frame's cost
when it is first shown is its chunk plus any lazy chunk it imports:

| Shell | Frame chunk | With its lazy imports |
| --- | ---: | ---: |
| `phone` (`PhoneFrame`) | 1,519 B | 3,318 B (+ `StatusBar`) |
| `tablet` (`TabletFrame`) | 1,136 B | 2,935 B (+ `StatusBar`) |
| `desktop-window` (`DesktopWindowFrame`) | 1,468 B | 1,468 B |
| `browser` (`BrowserFrame`) | 762 B | 762 B |
| `widget-host` (`WidgetHostFrame`) | 3,565 B | 3,565 B |
| `extension-popup` (`ExtensionPopupFrame`) | 1,799 B | 1,799 B |
| `side-panel` (`SidePanelFrame`) | 2,426 B | 2,426 B, plus one host chunk: 1,144 B chat workspace, 976 B code editor, 769 B design canvas |

`desktop-window`, `browser` and `extension-popup` look small only because their chrome
components already sit in the initial chunk (see above).

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
