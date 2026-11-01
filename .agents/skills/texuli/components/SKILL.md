---
name: texuli-components
description: Install Texuli packages or copy styled component source with texuli add, customize with tokens and component hooks, keep provenance, and update copies with texuli update. Offline; every command and snippet here is checked.
version: "0.3.9"
documentation_url: https://texuli.com/guides/
user-invocable: true
allowed-tools: Bash, Read, Grep, Glob, Edit, Write
metadata: {"openclaw":{"emoji":"▣","homepage":"https://texuli.com/guides/","requires":{"anyBins":["bash","git"]}}}
---

# Install, copy and customize components

Use this sub-skill when a developer wants Texuli components **in an app**:
consume the packages, or copy a styled component's source into the app and
own it, then theme it, adjust it and keep it updatable.

The copy path is **local**: its commands run from a Texuli monorepo checkout
against folders on disk. All 26 published packages are on npm in
the 0.11 line (see docs/RELEASE.md), a pre-1.0 line (`latest` and `next` point to the newest; 1.0.0 will
be the first stable release). Install them plainly (`pnpm add texuli`), pin
the exact version or `^0.11.0` (for 0.x it accepts only 0.11.x, since a new
minor may break), and never suggest a download URL. `@texuli/drag`,
`@texuli/workflows`, `@texuli/deck`, `@texuli/editor` (first published
in `0.5.0`), `@texuli/document` and `@texuli/pages` (both first published
in `0.7.0`), `@texuli/forms`, `@texuli/canvas` and `@texuli/sheets` (all
three first published in `0.8.0`) and `@texuli/mcp` (first published in
`0.9.0`) are in development and on npm as `0.11.3`. Features such as
`@texuli/primitives/sortable` and spec 0.3.0 and 0.4.0 need `0.4.0` or
later (they are not in `0.3.0`); the `0.11.0`, `0.10.0`, `0.9.0`, `0.8.0`, `0.7.0`, `0.6.0` and `0.5.0` breaking changes
are in [`../upgrade/SKILL.md`](../upgrade/SKILL.md).

## Choose a path

| The developer wants… | Path | Guide |
| --- | --- | --- |
| Components that update with Texuli, no source in the app | **A. Packages** | [`references/install.md`](references/install.md) |
| To own and edit a component's source | **B. Copy** with `texuli add` | [`references/install.md`](references/install.md) |
| Their brand: theme, tokens, a variant's look | **C. Customize** | [`references/customize.md`](references/customize.md) |
| A newer Texuli in a copied component, keeping their edits | **D. Update** with `texuli diff` / `texuli update` | [`references/update.md`](references/update.md) |

Paths A and B mix: an app can import most components from packages and copy
the one it needs to change. Primitives (`@texuli/primitives`) are never
copied; copies keep importing them.

## Rules (always)

1. **Dry run first.** Every writing command takes `--dry-run`; show the plan
   before writing into the developer's app.
2. **Keep the provenance header** at the top of every copied file. `texuli
   update` needs it to tell the developer's edits from Texuli's.
3. **Customize from outside first:** tokens, `class`, `data-*` hooks and
   unlayered CSS beat editing a copy. Copy only when the markup or behavior
   must change.
4. **Public imports only:** `texuli/button`, `@texuli/tokens/base.css`,
   `texuli/cx`. Never `src/internal` paths, never `clsx` or
   `tailwind-merge`.
5. **Contrast:** WCAG 2.x AA in light, dark and forced colors. Check a theme
   with `texuli theme preview` before applying it. APCA is out of scope.
6. **No network.** Nothing here downloads; installing dependencies is the
   developer's call (and the lockfile owner's, in this monorepo).

## The commands, in order

Run from the monorepo root. `../my-app` is the developer's app and `.` the
Texuli checkout; `../texuli-0.1.0` is a checkout of the version first copied.

```bash
# Path B: what can be copied, then copy (plan first)
pnpm exec tsx packages/tools/src/cli-add/cli.ts --list
pnpm exec tsx packages/tools/src/cli-add/cli.ts button --cwd ../my-app --source-root . --version 0.1.0 --dry-run --json
pnpm exec tsx packages/tools/src/cli-add/cli.ts button --cwd ../my-app --source-root . --version 0.1.0

# Wire tokens and CSS (Vite, Astro or SvelteKit), then pick a theme
pnpm exec tsx packages/tools/src/cli-init/cli.ts init --cwd ../my-app --dry-run
pnpm exec tsx packages/tools/src/cli-init/cli.ts init --cwd ../my-app
pnpm exec tsx packages/tools/src/cli-init/cli.ts theme list --search ocean
pnpm exec tsx packages/tools/src/cli-init/cli.ts theme preview ocean --mode dark
pnpm exec tsx packages/tools/src/cli-init/cli.ts theme apply ocean --cwd ../my-app

# Path D: see and apply a newer Texuli, keeping local edits
pnpm exec tsx packages/tools/src/cli-update/cli.ts diff button --cwd ../my-app --source-root . --base-root ../texuli-0.1.0
pnpm exec tsx packages/tools/src/cli-update/cli.ts update button --cwd ../my-app --source-root . --base-root ../texuli-0.1.0 --version 0.8.0 --dry-run
```

Each command prints `--help`. Add `--json` for machine-readable results.

## Check this skill

```bash
pnpm vitest run scripts/tests/skill.test.ts
pnpm exec tsx scripts/check-skill.ts
```

The skill test runs every command above against a temporary Vite app,
compiles every Svelte snippet, parses every TypeScript and JSON snippet, and
checks every token, hook and import named in this sub-skill.
