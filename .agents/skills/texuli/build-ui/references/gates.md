# Build-ui gates (offline)

Run from the **monorepo root**. Every Playwright command sets
`TEXULI_E2E_PORT=<port>`: 4870 is the default, and each parallel worker in a
shared checkout picks its own free port so two servers never collide.

## Skill pack

```bash
pnpm exec tsx scripts/check-skill.ts --write-sums
pnpm vitest run scripts/tests/skill.test.ts
./skills/texuli/setup.sh --verify
```

## Catalog and renderer

```bash
pnpm exec tsx packages/catalog/src/build/cli.ts --json
pnpm vitest run packages/catalog/tests/render-renderer.test.ts
pnpm vitest run packages/catalog/tests/render-limits.test.ts
pnpm vitest run packages/catalog/tests/render-grammar.test.ts
pnpm vitest run packages/catalog/tests/render-hostile.test.ts
pnpm vitest run packages/catalog/tests/render-richtext.test.ts
pnpm --filter @texuli/catalog typecheck
npx biome check packages/catalog/src packages/catalog/tests
```

## Styled UI you composed

```bash
pnpm vitest run packages/texuli/tests/<family>.test.ts
pnpm --filter texuli typecheck
npx biome check packages/texuli/src/components/<name> packages/texuli/tests/<family>.test.ts
# Report gzip only; do not edit texuli.budgets.json (owner-held)
pnpm size --filter 'texuli/<subpath>'
```

## Website page (if you touched apps/website)

```bash
pnpm build
pnpm --filter @texuli/website check:csp
TEXULI_E2E_PORT=<port> pnpm exec playwright test tests/e2e/<spec>.spec.ts
```

The repository's `add-website-page` procedure
(`.agents/skills/add-website-page/SKILL.md`) covers SEO, twins and CSP.

## Examples + visuals (only when you register a new example id)

```bash
TEXULI_E2E_PORT=<port> pnpm visual:update -g <example-id>
# Commit only your new PNGs under tests/visual/visual.spec.ts-snapshots/
```

`-g` is a substring match: an id that prefixes other ids rebaselines them
too, so check `git status` and keep only your own PNGs.

## MCP catalog (local stdio)

```bash
pnpm vitest run packages/tools/tests/mcp.test.ts
```

Tool **`catalog`**: query component metadata offline. No network.

## Perf

Wall-clock assertions never run in the default suite. Use `tests/perf` or
`process.env.TEXULI_PERF === '1'`.
