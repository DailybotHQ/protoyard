# Texuli in Protoyard

Protoyard is adopting [Texuli](../../texuli), the standalone MIT Svelte 5
component library extracted from `@protoyard/ui`. This is the first step:
Texuli is **linked**, not copied or installed from a registry, and Protoyard
stays green.

**Status:** this is the local `texuli-adoption` branch. It is not on `main`
and has not been pushed. Themes come from `@texuli/tokens`, and seven
`@protoyard/ui` controls run on `@texuli/primitives` (both below). Later
adoption tasks move packages over one at a time.

## How it is linked

The root `package.json` declares ten `link:` dev dependencies. Each path is
relative to the Protoyard root, so the Texuli checkout must sit next to
Protoyard (`../texuli`):

| Package | Link |
| --- | --- |
| `@texuli/core` | `link:../texuli/packages/core` |
| `@texuli/primitives` | `link:../texuli/packages/primitives` |
| `@texuli/tokens` | `link:../texuli/packages/tokens` |
| `texuli` | `link:../texuli/packages/texuli` |
| `@texuli/blocks` | `link:../texuli/packages/blocks` |
| `@texuli/catalog` | `link:../texuli/packages/catalog` |
| `@texuli/charts` | `link:../texuli/packages/charts` |
| `@texuli/chat` | `link:../texuli/packages/chat` |
| `@texuli/data` | `link:../texuli/packages/data` |
| `@texuli/media` | `link:../texuli/packages/media` |

- `pnpm install` links `node_modules/@texuli/*` and `node_modules/texuli` to
  those folders. The lockfile records only the `link:` specifiers, and
  nothing is fetched.
- **Texuli installs its own dependencies.** Run `pnpm install` in `../texuli`
  first. Its packages ship TypeScript and Svelte sources, which Protoyard's
  Vite and Vitest compile like workspace code. Svelte comes from Protoyard:
  the prototype config dedupes `svelte`.
- **Packed packages never carry the links.** They are root dev dependencies
  only, and `pnpm check:packages` refuses `link:` in any packed manifest.
- **A worktree** (for example `tmp/lanes/<lane>`) needs `../texuli` to
  resolve from its own root. Point `tmp/lanes/texuli` at the Texuli checkout
  with a git-ignored symlink.

## Themes come from `@texuli/tokens`

`@protoyard/themes` wraps `@texuli/tokens`; details in
[THEMES.md](THEMES.md#the-theme-library-loaded-on-demand).

- **Tokens.** Every library theme's tokens are built by Texuli and converted
  with `fromTexuliTheme`, through dynamic imports only.
  - **The catalog** is 64 themes, synchronous. Its definitions are kept in
    Protoyard and tested identical to Texuli's port.
  - **The full library** is 204 themes, opt-in with `enableFullThemeLibrary()`
    (`@protoyard/themes/library-full`).
- **Variables.** On a page that calls `enableTexuliAppearance()`
  (`@protoyard/themes/texuli`), `applyAppearance()` also writes Texuli's
  `--tx-*` variables, and every `--py-*` name stays an alias with the same
  value. `toTexuliTheme` completes a Protoyard palette with the 16 roles
  Texuli adds.
- **Prototypes are unchanged:** they keep `--py-*`, the built-ins, the
  `protoyard.<namespace>.appearance` cache and the Violet default.
- **Why opt-in and dynamic imports.** `@texuli/tokens` declares no
  `sideEffects` and exposes no `css` or `contract` subpath. Its root barrel
  re-exports the whole library, so any static import of it would ship the
  library in every prototype's initial chunk.

## Simple controls run on `@texuli/primitives`

These `@protoyard/ui` components keep their props, classes and behavior, and
render Texuli's headless primitives, imported by subpath
(`@texuli/primitives/<name>`):

| Component | Texuli primitive |
| --- | --- |
| `Separator` | `separator` (`SeparatorRoot`) |
| `Progress` | `progress` |
| `Checkbox` | `checkbox` (`CheckboxRoot`) |
| `Switch` | `switch` (`Root`, `Thumb`) |
| `RadioGroup`, `RadioGroupItem` | `radio-group` |
| `Tabs` | `tabs` |
| `Accordion` | `accordion` |

- **Bindable `ref`.** Texuli's checkbox, switch, radio group and tabs roots
  do not expose their element. The wrappers fill `ref` through an attachment
  (`refAttachment`, `packages/ui/src/lib/ref.ts`) that the primitive spreads
  on its element.
- **Protoyard's defaults are kept:**
  - separators are decorative (`role="none"`) unless `decorative={false}`;
  - arrow keys wrap around the tabs (`loop`);
  - inactive tab panels are not mounted (`forceMount={false}`).
- **Accordion animation.** The collapse keyframes read Texuli's
  `--tx-accordion-content-height`.
- **Resolution.** `@protoyard/ui` imports `@texuli/primitives` through the
  root `link:` dev dependency. Its own manifest declares no link, so
  `pnpm check:packages` stays clean.
- **Tests:** `pnpm vitest run packages/ui` (`simple-primitives.test.ts`
  covers the seams above, and requires the selected radio or tab to be the
  only tab stop, per the WAI-ARIA APG).

## The dev server

`devFsAllow` (`@protoyard/renderer-svelte`) is the list of folders a
prototype's dev server may serve through `/@fs`.
- It now also includes the real folder of each `link:` dependency the root
  declares (`linkedPackageRoots`).
- It allows each linked package folder and nothing around it. The rest of
  the Texuli checkout (its root files, `.dwp/`, other packages) is still
  refused with 403.
- A link that doesn't resolve adds nothing.

## Using a Texuli package

Import Texuli packages by name. For texels, use the subpath, never the
`@texuli/core` root barrel:

```svelte
<script lang="ts">
import { safeHref } from '@texuli/core/url-policy';
import { Button } from 'texuli/button';
</script>
```

## Verified

| Command | What it proves |
| --- | --- |
| `pnpm vitest run packages/renderer-svelte/tests/texuli-link.test.ts` | **Test.** Every linked package resolves into the Texuli checkout, not a copy. A Protoyard screen mounts Texuli's `Button`, which works on click, and blocks a `javascript:` link through `@texuli/core/url-policy`. A Texuli library theme applies to the document |
| `pnpm vitest run packages/renderer-svelte/tests/texuli-link-build.test.ts` | **Dev and build**, through the real `defineProtoyardConfig`. A dev server on port 4962 serves the linked `Button.svelte` over `/@fs` and refuses the Texuli root `package.json` (403). A production build bundles the Texuli Button into the prototype. Without the linked roots in `devFsAllow`, the dev check fails |
| `pnpm vitest run packages/renderer-svelte/tests/vite.test.ts` | `linkedPackageRoots`: links resolve to real folders; duplicates, missing links, non-link specifiers and an unreadable manifest add nothing. This workspace allows exactly the Texuli package folders |
| `pnpm vitest run packages/ui/tests/simple-primitives.test.ts` | The Texuli-backed controls: bindable refs, states, tab stops, wrapping tabs and unmounted inactive panels, the accordion's size variable, separator and progress semantics |
| `pnpm check` | Lint, typecheck and the full unit suite stay green |

## Limits

- **Local only.** The links need a Texuli checkout at `../texuli`. A fresh
  clone of Protoyard alone cannot install this branch until Texuli is
  published or vendored, a later adoption decision.
- **Typecheck reach.** Protoyard's typecheck covers the fixture that imports
  Texuli. The Texuli sources themselves are type-checked by Texuli's own
  gates.
