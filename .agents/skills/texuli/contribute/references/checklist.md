# Contribute — stage checklist

Copy this into the task report. Mark only stages you touched.

## A — Texel

- [ ] Source under `packages/core/src/<area>/`
- [ ] Subpath export in `packages/core/package.json`
- [ ] Hostile-input tests if sink-related
- [ ] `packages/core/docs/core-<area>.md`; README texel row through its owner
- [ ] `pnpm vitest run packages/core/tests/<area>.test.ts` green
- [ ] `pnpm size --filter core/<area>` reported (4 KiB default per subpath)
- [ ] `pnpm check`, the behavior suite and `pnpm build` green (core is shared)

## B — Primitive + behavior scenario

- [ ] `packages/primitives/src/<name>/` + package export
- [ ] Unit tests
- [ ] `tests/behavior/scenarios/<name>.spec.ts` + `scenario.svelte`
- [ ] Docs `packages/primitives/docs/prim-<name>.md`
- [ ] Behavior rows green on all three projects (`TEXULI_E2E_PORT=<port>`)

## C — Styled

- [ ] `packages/texuli/src/components/<name>/` + CSS `@layer tx.components`
- [ ] `cx` / `variants` only (no clsx / tailwind-merge)
- [ ] One alphabetical barrel export block
- [ ] Package `exports` key sorted
- [ ] Measured `pnpm size --filter texuli/<name>` reported
- [ ] Docs `packages/texuli/docs/ui-<name>.md`

## D — Manifest

- [ ] Family manifest updated; `agentEmittable` intentional
- [ ] Catalog tests green
- [ ] Spec vocabulary refreshed and regenerated; `pnpm vitest run packages/spec` green
- [ ] Website catalog and llms snapshots regenerated

## E — Examples

- [ ] Example registered in `packages/examples`
- [ ] Visual baselines light + dark committed (dark looks dark)
- [ ] `visual:update` ran on your own port; only your PNGs are staged

## F — Website

- [ ] Component page generated from the manifest, or the primitive added to
      `PRIMITIVES`; a hand-written page follows `add-website-page`
- [ ] `pnpm build` and `pnpm --filter @texuli/website check:csp` green

## Ship

- [ ] Conventional Commit, exact paths
- [ ] No push / no remote
- [ ] `pnpm check:skill` still green after skill pack edits
