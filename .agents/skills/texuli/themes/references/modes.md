# Color modes cheat sheet

`resolveColorMode(request, { matchMedia? })` → `light` | `dark` | `high-contrast`

| Input | Result |
| --- | --- |
| `light` | Forced light palette |
| `dark` | Forced dark palette |
| `high-contrast` | System semantic colors |
| `system` | `prefers-contrast: more` first, else `prefers-color-scheme` |

`resolveSemanticPalette(theme, mode)` picks `theme.light`, `theme.dark`, or the
high-contrast system map.

`applyColorMode(el, mode)` sets `data-tx-mode`, compatibility classes, and
`color-scheme`.

Storage key helper: `colorModeStorageKey(namespace)` →
`texuli.<namespace>.mode`.

Bootstrap (inline before CSS): `colorModeBootstrapScript(namespace, fallback)`.

Website pages often use appearance namespace `texuli-site` with theme id
`enterprise-neutral` (`apps/website` foundation).
