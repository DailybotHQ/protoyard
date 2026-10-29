# Themes — exact offline commands

All from the **monorepo root**. No network.

## CLI (`packages/tools/src/cli-init`)

```bash
pnpm exec tsx packages/tools/src/cli-init/cli.ts theme list
pnpm exec tsx packages/tools/src/cli-init/cli.ts theme list --search "slate navy" --json   # → enterprise-neutral
pnpm exec tsx packages/tools/src/cli-init/cli.ts theme preview enterprise-neutral --json
pnpm exec tsx packages/tools/src/cli-init/cli.ts theme preview enterprise-neutral --mode dark --json
pnpm exec tsx packages/tools/src/cli-init/cli.ts theme apply enterprise-neutral --cwd path/to/app --dry-run --json
pnpm exec tsx packages/tools/src/cli-init/cli.ts init --cwd path/to/app --theme enterprise-neutral --dry-run --json
```

## Package tests

```bash
pnpm vitest run packages/tokens/tests/aa-gate.test.ts
pnpm vitest run packages/tokens/tests/generator.test.ts
pnpm vitest run packages/tokens/tests/modes.test.ts
pnpm vitest run packages/tokens/tests/library-expand.test.ts
pnpm vitest run packages/tokens/tests/library-port.test.ts
pnpm vitest run packages/tools/tests/cli-init.test.ts
pnpm --filter @texuli/tokens typecheck
```

## TypeScript entry points

| Need | Import |
| --- | --- |
| Search / load library | `@texuli/tokens/library` |
| Generate | `@texuli/tokens/generator` |
| Modes | `@texuli/tokens/modes` |
| AA gate | `@texuli/tokens/aa-gate` |
| Compile / apply CSS | `@texuli/tokens` (`compileThemeCss`, `applyTheme`) |
| No-flash script | `@texuli/tokens/no-flash` |
| Forced-colors helpers | `@texuli/tokens` / forced-colors docs |

## MCP

Tool **`theme`** on the local tools MCP server: search metadata or load one
theme by `id`. Read-only.
