# Performance

All numbers on this page were **measured in this repository**, with the
method stated. Nothing is extrapolated. Machine for every measurement below:
Apple Silicon MacBook Pro (darwin arm64), Node 26.11.1, pnpm 11.23.0,
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

**Possible next steps (not done):** zod's smaller `zod/mini` build for runtime
parsing; route-level code splitting inside large prototypes.

## Metadata index and gallery at 1,000 prototypes

*Pending.* Measured by `pnpm bench:index` (`scripts/bench-index.ts`):
1,000 synthetic manifests in a temporary workspace, with cold and warm
(incremental) indexing, plus list and search timings. Results are copied here
verbatim when the benchmark runs. Do not quote numbers before then.

## Large worlds

*Pending.* The `enterprise-scale` CRM scenario (thousands of deals, over
8,000 activities) is used to measure generate, validate and write times with
chunked writes and progress reporting.

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
