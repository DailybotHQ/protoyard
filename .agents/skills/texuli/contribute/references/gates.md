# Contribute — gate matrix

All commands are offline and scoped. Replace `<name>`, `<area>`,
`<example-id>` and `<port>`. Every Playwright command sets
`TEXULI_E2E_PORT=<port>`: 4870 is the default, and each parallel worker in a
shared checkout uses its own free port.

| Stage | Unit | Typecheck | Lint | E2E / visual / size |
| --- | --- | --- | --- | --- |
| A texel | `pnpm vitest run packages/core/tests/<area>.test.ts` | `pnpm --filter @texuli/core typecheck` | `npx biome check packages/core/src/<area> packages/core/tests/<area>.test.ts` | `pnpm size --filter core/<area>`; then `pnpm check`, the behavior suite and `pnpm build` (core is shared) |
| B primitive | `pnpm vitest run packages/primitives/tests/<family>.test.ts` | `pnpm --filter @texuli/primitives typecheck` | `npx biome check packages/primitives/src/<name> …` | `TEXULI_E2E_PORT=<port> pnpm exec playwright test tests/behavior/scenarios/<name>.spec.ts` |
| C styled | `pnpm vitest run packages/texuli/tests/<family>.test.ts` | `pnpm --filter texuli typecheck` | `npx biome check packages/texuli/src/components/<name> …` | `pnpm size --filter texuli/<name>` (report only; no budget file edits) |
| D catalog | `pnpm vitest run packages/catalog/tests/manifests-<family>.test.ts` · `pnpm vitest run packages/spec` | `pnpm --filter @texuli/catalog typecheck` | biome on touched manifests | the coupled artifacts in [`layers.md`](layers.md#coupled-artifacts) |
| E examples | — | `pnpm --filter @texuli/examples typecheck` | biome on example folder | `TEXULI_E2E_PORT=<port> pnpm visual:update -g <example-id>` then the visual test |
| F website | `pnpm vitest run apps/website` | `pnpm --filter @texuli/website typecheck` | `npx biome check apps/website` | `pnpm build` · `pnpm --filter @texuli/website check:csp` · the area's `tests/e2e/site-*.spec.ts` |
| Skill pack | `pnpm vitest run scripts/tests/skill.test.ts` | — | — | `pnpm check:skill` · `./skills/texuli/setup.sh --verify` |

## Full monorepo gate

When the developer asks, when `packages/core` changed, or when shared root
config changed (owner-held files):

```bash
pnpm check
```

## Perf timings

Wall-clock assertions never run in the default suite. Put them under
`tests/perf` or guard with `process.env.TEXULI_PERF === '1'`.
