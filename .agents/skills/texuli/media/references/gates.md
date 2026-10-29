# Media gates (offline)

Run from the monorepo root. Replace the test path with the area you touched.

```bash
pnpm vitest run packages/media/tests/<area>.test.ts
pnpm --filter @texuli/media typecheck
npx biome check packages/media/src/<area> packages/media/tests/<area>.test.ts
pnpm size --filter '@texuli/media/<subpath>'
```

Common areas: `image`, `gallery`, `video`, `captions`, `export`, `generator-slot`,
`composition-model`, `composition-canvas`, `composition-svg`, `composition-v2`,
`animation`, `timeline`, `image-editor`, `audio`.

Examples + visuals (your own port; 4870 is the default):

```bash
TEXULI_E2E_PORT=<port> pnpm visual:update -g <example-id>
TEXULI_E2E_PORT=<port> pnpm exec playwright test tests/visual/visual.spec.ts -g <example-id>
```

Skill pack integrity after editing `skills/texuli/**`:

```bash
pnpm exec tsx scripts/check-skill.ts --write-sums
pnpm vitest run scripts/tests/skill.test.ts
./skills/texuli/setup.sh --verify
```

Do **not** edit `texuli.budgets.json` (owner-held) when a subpath is over
budget: report the measured gzip and let the owner set an exact entry.
