# Build-ui loop — catalog to render

Offline procedure for **texuli-build-ui**. No network.

## 1. Catalog

**Goal:** a closed list of component ids with `useWhen`, `dontUseWhen`, props
schema, tier, and emit rights.

| Source | How |
| --- | --- |
| Build CLI | `pnpm exec tsx packages/catalog/src/build/cli.ts --json` → writes `catalog-<sha256>.json` under `packages/catalog/dist/` (git-ignored) |
| Programmatic | `discoverManifestGroups()` + `buildCatalog(groups)` from `@texuli/catalog/build` / `build/node` |
| CLI | `npx texuli catalog search --json '{"query":"<text>"}'` (the `texuli` bin of `@texuli/tools`; `texuli help` lists every operation) |
| MCP | `catalog.search { "query": "<text>" }` on the local server (`npx -y @texuli/mcp`, stdio, offline once installed; [`../../router/hosts.md`](../../router/hosts.md#mcp)), then `component.get { "id": "<id>" }` |

Read each candidate entry:

- `id`, `group`, `tier`, `agentEmittable`
- `useWhen[]`, `dontUseWhen[]` (must be disjoint)
- `props[]` (names, kinds, required)

Tier **U** (`untrusted`) may emit only content ids and a small set of content
layouts. Overlays, shells and navigation are **developer** tier.

## 2. Pick

1. Write the brief as bullets (audience, primary action, data density, trusted
   vs untrusted content).
2. For each bullet, find ids whose `useWhen` matches.
3. Drop any id whose `dontUseWhen` matches.
4. Prefer one layout host + a short list of leaf components over many nested
   one-offs.
5. If the brief needs a **new** primitive, stop and use
   [`../../contribute/SKILL.md`](../../contribute/SKILL.md).

## 3. Compose

### Developer app (Svelte 5)

- Runes only; relative imports keep `.ts` when inside packages.
- UI → handlers → services pattern when the host app has services; components
  do not write storage directly.
- Pending UI: `Button` `onclick` returns a Promise or pass `loading`.
- Themes via tokens / site switcher; do not hard-code hex for chrome.

### Catalog tree (agent emit)

```ts
type CatalogTreeInput = {
  id: string;
  props?: Record<string, unknown>;
  children?: CatalogTreeInput[];
};
```

1. `validateCatalogTreeLimits(tree, { catalog })` — depth, nodes, bytes,
   branching (`@texuli/catalog/render/limits`).
2. Optional: `checkCompositionGrammar(roots, …)` after a dry render.
3. `renderCatalogTree(tree, { catalog, tier: 'untrusted' | 'developer' })`.
4. Host maps `component` nodes to real Svelte components; `placeholder` nodes
   get a visible labelled empty state.

Never produce HTML strings from the tree.

## 4. Validate

| Check | Command / API |
| --- | --- |
| Unit | `pnpm vitest run <path>` for touched packages |
| Types | `pnpm --filter <pkg> typecheck` |
| Lint | `npx biome check <paths>` |
| Catalog limits / renderer | `packages/catalog/tests/render-*.test.ts` |
| Hostile corpus | `packages/catalog/tests/render-hostile.test.ts` |
| AA (theme) | themes skill / `packages/tokens/tests/aa-gate.test.ts` |
| Axe (pages) | Playwright with `TEXULI_E2E_PORT=<port>` (a free port per parallel worker; 4870 is the default) |

## 5. Render and iterate

1. Mount the host mapping or app route.
2. Exercise the main path and empty/error states.
3. Fix diagnostics (renderer + limits + grammar) before adding features.
4. Re-run the smallest gate that covers the change.
5. Stop when the brief’s acceptance criteria are observable.

## Anti-patterns

- Using `dontUseWhen` components “just this once”
- Root barrel `@texuli/core` instead of `@texuli/core/<texel>`
- Shipping `{@html}` for rich text — use `@texuli/catalog/render/richtext` nodes
- Fetching catalog or themes from the network
- Editing `texuli.budgets.json` when a bundle is large — report gzip instead
