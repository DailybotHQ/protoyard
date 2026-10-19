# @protoyard/review-ui

Svelte 5 UI for review comments on published prototypes, on `@protoyard/ui`
tokens: comment mode and pins, threads, the comments panel and the floating
review toolbar. The engine is [`@protoyard/review`](../review/README.md).

The package is split into lazy subpaths so a prototype that does not enable
review comments pays no cost for them.

| Subpath | What it contains | Task |
| --- | --- | --- |
| `./overlay` | Comment mode (crosshair, Esc, keyboard placement), accessible pins and clusters inside device frames | T-review-ui-overlay-pins |
| `./thread` | A pin's lazy comment thread in a desktop popover or phone bottom sheet | T-review-ui-thread |
| `./panel` | The list of threads with filters, counts and "go to pin" | T-review-ui-panel-toolbar |
| `./toolbar` | The floating review toolbar for builds without DevTools | T-review-ui-panel-toolbar |
| `./mount` | The renderer's lazy adapter and UI integration | T-review-ui-renderer-wiring |
| `./styles.css` | `@source "./"` for Tailwind; import it only where review is enabled | — |

## Overlay

`createReviewOverlay({ root, comments, onPlace, onOpen })` mounts the comment
mode toggle and resolves comment anchors against the prototype root. It also
detects `[data-py-portal-root]`, which the renderer places inside a device
screen, so pins follow the frame's scale. The caller supplies validated
comments and persists a newly placed anchor through its review service in
`onPlace`; the overlay does not write to an adapter directly.

Press **C** outside an editable control to enter or leave comment mode. In
that mode, clicks place a pin, **Escape** exits, and the keyboard crosshair can
be moved with the arrow keys before **Enter** places a pin. **Shift+C** places
a comment on the focused prototype element. Resolved comments stay hidden by
default; orphaned anchors are left to the comments list. Nearby pins cluster
into a count button that expands to the individual threads.

When the host grants only Claude's composer capability, pass its
`openComposer(element)` action as `onCommentInClaude`. Placement gestures open
the Claude composer on the selected element instead of saving a Protoyard
thread. Render `ClaudeComposerNotice` in the panel to tell viewers that threads
live in Claude's comment panel.

## Pin thread

Import `ReviewThread` from `@protoyard/review-ui/thread` only after a pin opens.
It adapts validated review comments to `@protoyard/views-ui/activity`'s
`CommentThread`, and accepts adapter-backed callbacks for replies, edits,
deletes, reactions and resolve/reopen. On phones pass `mobile` to use a
bottom sheet that stays within the app viewport. The first visit asks for a
display name, explains that it is not a login, and stores the reviewer name and
browser id in local storage for that prototype slug.

## 0 bytes until review is enabled

There is no root entry. The renderer reaches this package through one dynamic
`import('@protoyard/review-ui/mount')`, behind a build flag or link, so a
build without review contains none of it. Overlay, panel and toolbar stay
separate chunks; only `mount` composes them. Nothing here imports
`@protoyard/ui` dynamically (that would put the ui barrel in every initial
chunk; see docs/PERFORMANCE.md, Shells).

The renderer configures the adapter from `manifest.build.review`: local
IndexedDB by default, or the HTTP/Cloudflare endpoint or Claude Artifact shell
when selected. The HTTP adapter's `pendingCount()` and `subscribePending()` are
shown in the toolbar as comments waiting to sync. Local rows are reconciled on
startup, so offline comments are retried after a page reload.

```bash
pnpm --filter @protoyard/review-ui typecheck
pnpm vitest run packages/review-ui/tests/bundle-hygiene.test.ts
```
