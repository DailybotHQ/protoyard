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

**Budget (guideline, not enforced in CI):** keep initial JS under 250 KB
gzip per prototype, and keep generation-only dependencies lazy.

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
