---
name: texuli-themes
description: Pick, generate, apply and AA-check Texuli themes offline — library search, seed/mood/image generation, light dark high-contrast and system modes, CLI and MCP. No network; WCAG 2.x AA only (not APCA).
version: "0.3.7"
documentation_url: https://texuli.com/guides/
user-invocable: true
allowed-tools: Bash, Read, Grep, Glob, Edit, Write
metadata: {"openclaw":{"emoji":"▣","homepage":"https://texuli.com/guides/","requires":{"anyBins":["bash","git"]}}}
---

# Themes and color

Use this sub-skill **inside a Texuli monorepo checkout** when the developer
wants themes: browse the library (200+ themes), generate from a seed color,
mood words or image pixels, apply light / dark / high-contrast / system, run
the **WCAG 2.x AA** gate, or wire CLI / MCP theme tools.

**APCA is out of scope** (license). Never describe WCAG ratios as APCA scores.
Everything below is **offline** (no network for library load, generation, CLI
or MCP theme tools).

Package docs (monorepo):

| Topic | Doc |
| --- | --- |
| Theme contract | `packages/tokens/docs/tokens-contract.md` |
| Palette / contrast math | `packages/tokens/docs/tokens-palette.md` |
| CSS compile / apply | `packages/tokens/docs/tokens-css.md` |
| Modes | `packages/tokens/docs/tokens-modes.md` |
| No-flash bootstrap | `packages/tokens/docs/tokens-no-flash.md` |
| Forced colors | `packages/tokens/docs/tokens-forced-colors.md` |
| Generator | `packages/tokens/docs/tokens-generator.md` |
| Library | `packages/tokens/docs/tokens-library-port.md` |
| AA gate | `packages/tokens/docs/tokens-aa-gate.md` |
| CLI init / theme | `packages/tools/docs/cli-init.md` |

References: [`references/`](references/).

## When to use

| Intent | Stage |
| --- | --- |
| List / search the theme library | **A** |
| Preview tokens + AA for one id | **A** |
| Generate from seed, mood or image | **B** |
| Apply mode (light / dark / high-contrast / system) | **C** |
| Run AA gate on a theme or the library | **D** |
| Wire CSS + no-flash in an app (`init` / `theme apply`) | **E** |
| MCP theme tools | **F** |

## Rules

1. Import by **subpath**: `@texuli/tokens/library`, `@texuli/tokens/generator`,
   `@texuli/tokens/aa-gate`, `@texuli/tokens/modes`, `@texuli/tokens` for
   `defineTheme` / `compileThemeCss` — not deep `src/` paths.
2. **AA only** for pass/fail. AAA catalog flags may list enhanced issues; they
   do not change the AA floor.
3. High contrast uses **system colors** (`Canvas`, `CanvasText`, …), not a
   mechanical invert of light/dark.
4. Class helpers in apps: `texuli/cx`. Never `clsx` / `tailwind-merge`.
5. **No network** for these workflows. Image generation uses pixels you already
   have in memory (`readImagePixels`), not a fetch.

## Offline gates (tokens)

```bash
pnpm vitest run packages/tokens/tests/
pnpm --filter @texuli/tokens typecheck
npx biome check packages/tokens/src packages/tokens/tests

# CLI (from monorepo root; no network)
pnpm exec tsx packages/tools/src/cli-init/cli.ts theme list --search teal --json
pnpm exec tsx packages/tools/src/cli-init/cli.ts theme preview enterprise-neutral --mode dark --json

# Skill pack after editing this folder
pnpm exec tsx scripts/check-skill.ts --write-sums
pnpm vitest run scripts/tests/skill.test.ts
./skills/texuli/setup.sh --verify
```

---

## Stage A — Pick from the library

**~210 full library themes** (browse metadata is smaller; full definitions load
on demand).

### TypeScript

```ts
import {
  listThemeLibrary,
  loadLibraryTheme,
  searchThemeLibrary,
} from '@texuli/tokens/library';

const hits = searchThemeLibrary('logistics teal');
const theme = await loadLibraryTheme(hits[0]!.id);
// theme.light / theme.dark are full semantic palettes
```

### CLI (exact)

```bash
# List / search (all words must match)
pnpm exec tsx packages/tools/src/cli-init/cli.ts theme list
pnpm exec tsx packages/tools/src/cli-init/cli.ts theme list --search "teal amber" --json   # → harbor-teal

# Key tokens + WCAG AA report for one mode
pnpm exec tsx packages/tools/src/cli-init/cli.ts theme preview enterprise-neutral
pnpm exec tsx packages/tools/src/cli-init/cli.ts theme preview enterprise-neutral --mode dark --json
```

Default site/demo theme id often used in the monorepo: **`enterprise-neutral`**.

---

## Stage B — Generate a theme

**Import:** `@texuli/tokens/generator`

```ts
import {
  generateThemeFromImage,
  generateThemeFromMood,
  generateThemeFromSeed,
  readImagePixels,
} from '@texuli/tokens/generator';
import { defineTheme, deriveChartTokens } from '@texuli/tokens';

// From one brand color (deterministic)
const brand = generateThemeFromSeed({
  seed: '#2b6ce0',
  neutral: 'slate',
  contrast: 'AA',
  deriveCharts: deriveChartTokens,
});

// From mood words
const calm = generateThemeFromMood('calm ocean');

// From image pixels already in a document (no network)
// const fromLogo = generateThemeFromImage(readImagePixels(logoImg, document));

// Optional: lock typography/shape via style presets
const locked = defineTheme({ ...brand, /* style overrides */ });
```

Generation **throws** rather than return a theme that fails
`THEME_CONTRAST_PAIRS`. Prefer `contrast: 'AA'` unless the developer explicitly
wants AAA search (still not APCA).

**Gate:** `pnpm vitest run packages/tokens/tests/generator.test.ts` (or the
generator test path present in the package).

---

## Stage C — Light, dark, high contrast, system

**Import:** `@texuli/tokens/modes`

```ts
import {
  applyColorMode,
  colorModeBootstrapScript,
  colorModeStorageKey,
  resolveColorMode,
  resolveSemanticPalette,
} from '@texuli/tokens/modes';

const resolved = resolveColorMode('system'); // light | dark | high-contrast
const palette = resolveSemanticPalette(theme, resolved);

// On a root element (browser):
// applyColorMode(document.documentElement, 'dark');

// First paint (inline in <head>, no wrapper):
const bootstrap = colorModeBootstrapScript('my-app', 'system');
// Persist picks under colorModeStorageKey('my-app')
```

| Requested | Behavior |
| --- | --- |
| `light` / `dark` | Theme's authored palettes |
| `high-contrast` | System colors for semantic roles |
| `system` | `prefers-contrast: more` → high-contrast, else `prefers-color-scheme` |

Pair with no-flash / appearance bootstrap from `@texuli/tokens/no-flash` when
the host already uses `texuli.<namespace>.appearance` (see website foundation).

**CSS application:**

```ts
import { applyTheme, clearTheme, compileThemeCss } from '@texuli/tokens';

styleEl.textContent = compileThemeCss(theme);
applyTheme(rootEl, { theme, mode: 'dark' });
```

---

## Stage D — AA gate

**Import:** `@texuli/tokens/aa-gate`

```ts
import {
  aaGateReportForWebsite,
  runAaGateOnTheme,
  runLibraryAaGate,
} from '@texuli/tokens/aa-gate';

const one = runAaGateOnTheme(theme);
// one.ok === true means every AA pair passed in light and dark

// Optional full-library sweep (heavier; for CI / offline galleries)
// const lib = await runLibraryAaGate();
```

| Pair kind | AA floor |
| --- | ---: |
| Text (incl. hover/active on fills) | **4.5:1** |
| Non-text UI (1.4.11) | **3:1** |

**Gate:** `pnpm vitest run packages/tokens/tests/aa-gate.test.ts`

---

## Stage E — CLI apply / init

**Docs:** `packages/tools/docs/cli-init.md`

```bash
# Scaffold theme wiring into an app (writes local files only)
pnpm exec tsx packages/tools/src/cli-init/cli.ts init --cwd path/to/app --theme enterprise-neutral --dry-run --json

# Apply another library theme into an already-init'd app
pnpm exec tsx packages/tools/src/cli-init/cli.ts theme apply ocean --cwd path/to/app --dry-run --json
pnpm exec tsx packages/tools/src/cli-init/cli.ts theme apply ocean --cwd path/to/app --json
```

`init` / `theme apply` update the CSS theme block, `data-tx-theme` and no-flash
bootstrap, and `texuli.config.json`. Always **`--dry-run` first** unless the
developer already approved writes. Never invent deploy URLs.

**Gate:** `pnpm vitest run packages/tools/tests/cli-init.test.ts`

---

## Stage F — MCP theme tools

**Server:** `npx -y @texuli/mcp` (stdio, every operation; new in `0.9.0`),
or the remote server for the edge operations
([`../router/hosts.md`](../router/hosts.md#mcp)). Read-only.

| Tool | Arguments | Returns |
| --- | --- | --- |
| `theme.search` | `query`, `category`, `collection`, `mood`, `tag`, `limit` | Theme metadata |
| `theme.preview` | `id` (required), `mode` | Key tokens and the AA report for both modes |
| `theme.get` | `id` (required) | The full light and dark definition |

The 0.8 name `theme` was a deprecated alias in `0.9.0` and is removed in
`0.10.0`: call `theme.search` or `theme.get`.

Example agent flow:

1. Call `theme.search { "query": "teal" }`.
2. Pick an `id` from the result.
3. Call `theme.preview { "id": "violet" }` and keep a theme whose AA report passes.
4. Call `theme.get { "id": "violet" }` for the full tokens, or run
   `texuli theme preview <id>` from a shell.

---

## Commit and handoff

- Scope commits `tokens`, `tools`, `docs` as appropriate.
- Stage **exact paths**. Never push.
- Report AA results honestly; never claim APCA.

## Offline validation of this sub-skill

```bash
pnpm check:skill
pnpm exec tsx scripts/check-skill.ts --write-sums
./skills/texuli/setup.sh --verify
pnpm vitest run scripts/tests/skill.test.ts
```

## Related

- [`references/commands.md`](references/commands.md) — copy-paste CLI / TS
- [`references/modes.md`](references/modes.md) — mode resolution cheat sheet
- [`references/aa.md`](references/aa.md) — AA floors and APCA boundary
- Router: [`../SKILL.md`](../SKILL.md) · Trust: [`../TRUST.md`](../TRUST.md)
