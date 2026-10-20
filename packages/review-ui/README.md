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

The mounted review session does not use `ReviewThread` yet. It shows a
pin's thread in its own section, with the comments, a **Reply** box and
**Resolve** / **Reopen** for the author's browser. The component is available
to hosts that compose their own UI.

## Toolbar and the comments panel

The floating toolbar never covers the app by default. It starts as one small
launcher button ("Review: N comment threads"). The renderer places it with
the demo badge's rules: the first spot of the window that covers no app control
and not the badge, starting bottom-right. The badge re-places itself when the
launcher moves (`protoyard:floating`). The launcher expands to the actions
(Comment, Comments, the adapter and sync status), growing away from its corner,
and stays open while commenting. Escape collapses it. The overlay's own "Add
comment" button is off inside a session (`toggle: false`), so the launcher is
the only floating review control.

When DevTools is mounted, the renderer mounts review first and passes
`mountReview({ devtools: true })`. The session then returns `devtoolsTab`, a lazy
"Comments" tab for `mountDevtools({ extraTabs })` whose props are the session's
live panel state. The toolbar hides its own "Comments" button.

**Export and Import** (local adapter only) sit in the expanded toolbar. Export
downloads this browser's comments as `<slug>-review-comments.json`; Import
validates a comments file (`protoyard-review-comments`, the same envelope) for
this prototype's namespace and slug, merges it, refreshes the pins and confirms
"Imported N comments." in a status. Shared adapters (HTTP, Cloudflare, Claude
artifact) sync through their endpoint, so neither button renders for them. A
prototype can ship a demo review in `public/` for reviewers to import (see
`prototypes/keel-projects-demo/public/review-demo.json`).

## Keyboard

| Key | What it does |
| --- | --- |
| **C** | Enter or leave comment mode (ignored in text fields) |
| **Arrow keys** / **Shift** + arrows | Move the crosshair 16 / 40 px |
| **Enter** | Place the pin at the crosshair |
| **Shift+C** | Comment on the element that has keyboard focus |
| **Escape** | Leave comment mode, or collapse the toolbar |

The reviewer guide is in [docs/REVIEW_COMMENTS.md](../../docs/REVIEW_COMMENTS.md#reviewer-guide).

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

Measured on 2026-10-19 (gzip, `crm-demo` with `PROTOYARD_REVIEW=1`):
- **Loaded when review mounts:** `mount` 1.5 KB, the session (toolbar, overlay, thread) 8.3 KB, the local adapter 1.3 KB, anchors 2.3 KB and comment schemas 1.3 KB. That totals 14.7 KB, plus 1.4 KB CSS.
- **On first open:** the panel adds 3.5 KB, plus 1.1 KB CSS.
- **Initial JS:** goes from 174.76 KB to 177.13 KB with review on.

```bash
pnpm --filter @protoyard/review-ui typecheck
pnpm vitest run packages/review-ui/tests/bundle-hygiene.test.ts
```
