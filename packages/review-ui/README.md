# @protoyard/review-ui

Svelte 5 UI for review comments on published prototypes, on `@protoyard/ui`
tokens: comment mode and pins, threads, the comments panel and the floating
review toolbar. The engine is [`@protoyard/review`](../review/README.md).

> **Status: scaffold.** The subpaths exist and are empty. Each one is filled
> by its PLAN_003 task, and this README documents it when it lands.

| Subpath | What it will hold | Task |
| --- | --- | --- |
| `./overlay` | Comment mode (crosshair, Esc, keyboard placement) and pins inside device frames | T-review-ui-overlay-pins |
| `./panel` | The list of threads with filters, counts and "go to pin" | T-review-ui-panel-toolbar |
| `./toolbar` | The floating review toolbar for builds without DevTools | T-review-ui-panel-toolbar |
| `./mount` | The entry the renderer imports lazily when review is enabled | T-review-ui-renderer-wiring |
| `./styles.css` | `@source "./"` for Tailwind; import it only where review is enabled | — |

## 0 bytes until review is enabled

There is no root entry. The renderer reaches this package through one dynamic
`import('@protoyard/review-ui/mount')`, behind a build flag or link, so a
build without review contains none of it. Overlay, panel and toolbar stay
separate chunks; only `mount` composes them. Nothing here imports
`@protoyard/ui` dynamically (that would put the ui barrel in every initial
chunk; see docs/PERFORMANCE.md, Shells).

```bash
pnpm --filter @protoyard/review-ui typecheck
pnpm vitest run packages/review-ui/tests/bundle-hygiene.test.ts
```
