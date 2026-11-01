---
name: texuli-contribute
description: Contribute a Texuli texel, primitive (with its behavior scenario), styled component, catalog manifest, examples and website page using the repository gates offline.
version: "0.3.12"
documentation_url: https://texuli.com/guides/
user-invocable: true
allowed-tools: Bash, Read, Grep, Glob, Edit, Write
metadata: {"openclaw":{"emoji":"▣","homepage":"https://texuli.com/guides/","requires":{"anyBins":["bash","git"]}}}
---

# Contribute a primitive or component

Use this sub-skill **inside a Texuli monorepo checkout** when the developer
wants to add or extend the design system itself — not when they only want to
*use* an existing component in an app (route that to the build/install
sub-skills).

This file is the procedure. Layer map and gate commands live in
[`references/`](references/). Every command below is local; **no network**.

## When to use

| Intent | Use this skill |
| --- | --- |
| New L0 behavior (ids, focus, URL policy helper) | Yes — start at **Stage A (texel)** |
| New L1 headless control (`@texuli/primitives`) | Yes — **Stage B** |
| New L3 styled control (`texuli/…`) | Yes — **Stage C** (needs L1 if interactive) |
| Catalog entry + examples + docs page | Yes — **Stages D–F** |
| One-line consumer app fix | No — stay on the router / edit the app only |

## Layer order (down only)

```text
@texuli/core, @texuli/spec, @texuli/deck (L0: texels; the blueprint contract; the deck engine)
  → @texuli/primitives (L1 headless)
    → @texuli/tokens (L2)
      → texuli (L3 styled)
        → charts / data / media / chat / editor (L4)
          → @texuli/blocks (L5)
            → @texuli/catalog manifests (L6)
              → @texuli/player (L7)
                → @texuli/slides, @texuli/tools, @texuli/astro (L8)
                  → apps/website, apps/agent
```

The full map is [`references/layers.md`](references/layers.md).

Never import a higher layer from a lower one. Import texels by **subpath**
(`@texuli/core/roving`), never the `@texuli/core` root barrel from other
packages. Styled packages import `cx` / `variants` from `texuli/cx`.

## End-to-end path

```text
texel → primitive + behavior scenario → styled component → catalog manifest → examples → website page
```

Skip stages that already exist. Primitives are written from the WAI-ARIA APG
patterns on the texels; never add another component library.

---

## Stage A — Texel (`@texuli/core`)

**Goal:** framework-free TypeScript behavior or policy with tests.

1. Read a model texel, e.g. `packages/core/src/roving/` (`index.ts` plus
   its source files) with `packages/core/tests/roving.test.ts`, or the URL
   policy (`packages/core/src/url/safe-href.ts`, `packages/core/src/url-policy/`)
   with `packages/core/tests/url-policy.test.ts`.
2. Add `packages/core/src/<area>/` (kebab-case, one concern) with an
   `index.ts` that re-exports the texel's public names.
3. Export a **subpath** `./<area>` from `packages/core/package.json`
   `exports`, and add the names to the `packages/core/src/index.ts` barrel
   unless they are heavy (the editor texels stay subpath-only because the
   barrel is near its budget). Consumers import the subpath.
4. Tests: `packages/core/tests/<area>.test.ts` — normal, edge, and **hostile
   inputs** when the texel guards a sink (URL, HTML, focus escape).
5. Docs: `packages/core/docs/core-<area>.md`, plus its row in the texel table
   of `packages/core/README.md` (in a shared checkout, through the README's
   owner).
6. Size: every core subpath is budgeted at 4 KiB gzip by default
   (`@texuli/core/*` in `texuli.budgets.json`, owner-held); measure it.

**Gate (scoped):**

```bash
pnpm vitest run packages/core/tests/<area>.test.ts
pnpm --filter @texuli/core typecheck
npx biome check packages/core/src/<area> packages/core/tests/<area>.test.ts
pnpm size --filter core/<area>
```

Core is shared by every layer, so a core change also runs `pnpm check`, the
primitives behavior suite and `pnpm build` before it is done.

---

## Stage B — Primitive (`@texuli/primitives`) + behavior scenario

**Goal:** headless Svelte 5 control bound to L0 texels, held to its WAI-ARIA
APG pattern.

1. Scaffold under `packages/primitives/src/<name>/` (Root, parts, context,
   `index.ts`). Svelte 5 runes only.
2. Export `./<name>` from `packages/primitives/package.json` (sorted).
3. Unit tests in the family file `packages/primitives/tests/<family>.test.ts`
   (`models`, `forms`, `overlays`, `composites`; one `describe` per primitive),
   only for logic the behavior suite cannot reach.
4. **Behavior scenario** (required for interactive primitives):
   - `tests/behavior/scenarios/<name>/scenario.svelte` — the scenario page
   - `tests/behavior/scenarios/<name>.spec.ts` — `scenario(...)` rows
5. Docs: `packages/primitives/docs/prim-<name>.md`.

**Gate:**

```bash
pnpm vitest run packages/primitives/tests/<family>.test.ts
pnpm --filter @texuli/primitives typecheck
npx biome check packages/primitives/src/<name> packages/primitives/tests/<family>.test.ts
# Behavior suite (a free port per parallel worker; 4870 is the default)
TEXULI_E2E_PORT=<port> pnpm exec playwright test tests/behavior/scenarios/<name>.spec.ts
```

---

## Stage C — Styled component (`texuli`)

**Goal:** themed Svelte control using tokens + primitive; consumer classes win
via `@layer tx.base, tx.components`.

1. `packages/texuli/src/components/<name>/` — component, CSS in
   `@layer tx.components`, variants via `texuli` internal `cx` / `variants`
   (or `texuli/cx` from other packages).
2. Export `./<name>` from `packages/texuli/package.json` (sorted).
3. One barrel block in `packages/texuli/src/index.ts` for the folder only
   (alphabetical; change nothing else when other agents share the checkout).
4. Tests: add a `describe` to the family file
   `packages/texuli/tests/<family>.test.ts` (`forms`, `overlays`, `display`,
   `navigation`, `layouts`; static CSS guards go in `contracts`).
5. Docs: `packages/texuli/docs/ui-<name>.md`; the package README's
   component table changes through its owner in a shared checkout.

**Gate:**

```bash
pnpm vitest run packages/texuli/tests/<family>.test.ts
pnpm --filter texuli typecheck
npx biome check packages/texuli/src/components/<name> packages/texuli/tests/<family>.test.ts
pnpm size --filter texuli/<name>   # report gzip; do not edit texuli.budgets.json
```

---

## Stage D — Catalog manifest (`@texuli/catalog`)

**Goal:** agent-facing closed entry so the sink-free renderer can emit the id.

1. Add or extend a manifest under `packages/catalog/src/manifests/<family>/`
   via `defineCatalogManifest` (see existing family modules).
2. Set `agentEmittable` deliberately (default false for chrome).
3. Include `useWhen` / `dontUseWhen`, `a11y`, props schema, and **at least one
   example** when emittable.
4. Tests: extend the matching `packages/catalog/tests/manifests-*.test.ts` or
   add a focused test file.
5. Refresh the coupled artifacts in the same change: the spec vocabulary
   and the website catalog and llms snapshots
   ([`references/layers.md`](references/layers.md#coupled-artifacts)).

**Gate:**

```bash
pnpm vitest run packages/catalog/tests/manifests-<family>.test.ts
pnpm --filter @texuli/catalog typecheck
pnpm vitest run packages/spec
```

---

## Stage E — Examples (`@texuli/examples`)

**Goal:** fixture-app demo with light/dark visual baselines.

1. `packages/examples/src/<example-id>/` — a `Demo.svelte` plus `entry.ts`
   (or `entries.ts` for several ids) calling `defineExample`.
2. Register the side-effect import and the named export in
   `packages/examples/src/index.ts` (alphabetical).
3. **Visual baselines** (your own port):

```bash
TEXULI_E2E_PORT=<port> pnpm visual:update -g <example-id>
# Inspect light and dark PNGs (dark must look dark), then commit only yours:
# tests/visual/visual.spec.ts-snapshots/<example-id>--*.png
```

`-g` matches by substring, so an id that prefixes others rebaselines them
too: keep only your own PNGs.

**Gate:**

```bash
TEXULI_E2E_PORT=<port> pnpm exec playwright test tests/visual/visual.spec.ts -g <example-id>
```

---

## Stage F — Website page (`apps/website`)

**Goal:** a page on texuli.com (deployed from `main` to Cloudflare Pages)
that documents the piece and links the live example.

1. Component pages are generated at build time from the catalog manifests
   (`/component-pages/<id>/`), so a new manifest entry needs no page file.
   Primitive pages (`/primitives-page/<id>/`) come from the `PRIMITIVES`
   list in `apps/website/src/components/primitives-page/primitives.ts`: add
   the new primitive there. A hand-written page goes under `apps/website/src/pages/` (Astro)
   and follows the repository procedure in
   `.agents/skills/add-website-page/SKILL.md`: `BaseLayout`, the nav source,
   breadcrumbs, the Markdown twin, `llms.txt` and the build-time CSP.
2. English only; logical CSS; no `{@html}` or `set:html` on content.
3. Prefer linking the catalog example id over duplicating markup.

**Gate:**

```bash
pnpm build
pnpm --filter @texuli/website check:csp
TEXULI_E2E_PORT=<port> pnpm exec playwright test tests/e2e/site-component-pages.spec.ts
```

---

## Commit and handoff

- Conventional Commits with scopes: `core`, `primitives`, `texuli`, `catalog`,
  `examples`, `website`, `docs`, …
- **Stage exact paths**, never `git add -A`.
- Never push; never add a remote from this skill.
- Report: files changed, commands + results, measured bundle size for new
  lazy subpaths, known gaps.

## Offline validation of this sub-skill

From the monorepo root:

```bash
pnpm check:skill
# or
pnpm exec tsx scripts/check-skill.ts
./skills/texuli/setup.sh --verify
```

## Related references

- [`references/layers.md`](references/layers.md) — package map and import rules
- [`references/gates.md`](references/gates.md) — copy-paste gate matrix
- [`references/checklist.md`](references/checklist.md) — stage checklist
- Router: [`../SKILL.md`](../SKILL.md) · Trust: [`../TRUST.md`](../TRUST.md)
