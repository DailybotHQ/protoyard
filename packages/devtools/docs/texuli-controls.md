# DevTools panel controls on Texuli

**Package:** `@protoyard/devtools` · **Task:** T-adopt-devtools

The in-browser DevTools panel keeps its Protoyard runtime wiring (scenarios,
personas, appearance, Theme Studio, snapshots). Its **control chrome** is
built on Texuli styled components:

| Panel adapter | Texuli surface |
| --- | --- |
| `Btn` | `texuli/button` `Button` (size `sm`; `primary`→`default`, `danger`→`destructive`) |
| `Toggle` | `texuli/choice` `Switch` |
| `Segmented` | `@texuli/primitives/radio-group` (`RadioGroup.Root` / `Item`), horizontal; panel chrome classes |
| `SourceBadge` | `texuli/badge` `Badge` |
| `InlineError` | `texuli/alert` `Alert` (error tone) |
| `Confirm` | composition of `Btn` |

Layout-only helpers (`Section`, `Spinner`, `Initials`) stay local.

## Theme Studio and gallery

- **Theme Studio / Theme Browser** already use `@protoyard/themes` and
  `@protoyard/themes/library`, which are backed by `@texuli/tokens` (see
  `docs/TEXULI.md` and `docs/THEMES.md`).
- **Gallery marketplace** theme facets use `THEME_LIBRARY_META` from the same
  path — no second catalog.

## Mount

`mountDevtools()` calls `enableTexuliAppearance()` so `--tx-*` tokens stay
aligned with Protoyard `--py-*` while the panel is open.

## Dependency

```json
"texuli": "link:../../../../texuli/packages/texuli"
```

(from a worktree; main checkout uses `link:../../../texuli/packages/texuli`).
Adjust if the lane symlink layout differs — relative to the Protoyard root
the canonical form is `link:../texuli/packages/texuli` in the main checkout
`packages/devtools/package.json` after the lead merges; worktrees under
`tmp/lanes/*` need one more `../`.
