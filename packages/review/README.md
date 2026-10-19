# @protoyard/review

The engine for review comments on published prototypes: reviewers click a
spot on a screen, leave a comment pinned there, and the team reads every
thread in one list. This package has no Svelte; the UI is
[`@protoyard/review-ui`](../review-ui/README.md). The comment schemas live in
`@protoyard/core/review`.

> **Status:** `./anchors` is implemented. The other subpaths exist and are
> empty; each one is filled by its PLAN_003 task, and this README documents
> it when it lands.

| Subpath | What it will hold | Task |
| --- | --- | --- |
| `./anchors` | Pin anchors: route, element locator ladder, offset inside the element, context | T-review-anchoring |
| `./store` | The small `ReviewAdapter` contract and its conformance suite | T-review-adapter-contract |
| `./adapters/local` | IndexedDB adapter (its own database, untouched by scenario loads) with export / import | T-review-adapter-local |
| `./adapters/http` | Adapter for any endpoint with the comments REST shape (also the Cloudflare mode) | T-review-adapter-http |
| `./server` | The comments API handler on plain `Request` / `Response` | T-review-server-handler |
| `./report` | Review reports (`REVIEW.md`, JSON) for `protoyard comments pull` | T-review-cli-comments |

## Boundaries

- **`./server` uses Web APIs only**: no Svelte, no UI packages, no Dexie or
  `@protoyard/database`, no `node:` modules and no DOM globals, so it can be
  bundled into a Cloudflare Pages worker and tested in Node.
- **No Svelte or UI packages anywhere in this engine.**
- Reviewer names are self-declared and a review key only keeps casual
  visitors out: **this is not authentication**.

`packages/review-ui/tests/bundle-hygiene.test.ts` enforces these rules.

```bash
pnpm --filter @protoyard/review typecheck
pnpm vitest run packages/review-ui/tests/bundle-hygiene.test.ts
```

## Anchors (`@protoyard/review/anchors`)

A pin has to land on the same spot after the layout reflows, inside a device
frame, or in another shell. If its element is gone, the pin must say so
instead of sitting somewhere wrong.

```ts
import { captureContext, createAnchor, LOW_CONFIDENCE, resolveAnchor } from '@protoyard/review/anchors';

const anchor = createAnchor(event.target as Element, { x: event.clientX, y: event.clientY }, {
  root: prototypeRoot,
  route: { pattern: '/deals/:id', path: '/deals/7' },
});
const context = captureContext({ scenario, persona, shell, orientation, theme, mode, layout, buildId });

const found = resolveAnchor(anchor, prototypeRoot);
if (found.orphaned) {
  // List the thread as "element not found".
} else {
  // Draw the pin at anchorPoint(anchor, found.element).
  // If found.confidence < LOW_CONFIDENCE, draw it dashed.
}
```

- **Locator ladder:** an anchor stores up to five locators, strongest first.
  `resolveAnchor` tries them in order.

  | Locator | Value | Confidence |
  | --- | --- | --- |
  | `data-py-anchor` | the attribute | 1 |
  | `data-testid` | the attribute | 0.95 |
  | a stable `id` | the id | 0.9 |
  | role path | role and accessible name inside the nearest landmark (main, navigation, a named region…), with an index | 0.8 |
  | CSS path | `nth-of-type` from the root, or from the nearest stable id | 0.6 |

  When a locator matches more than one element, confidence drops by 10%.
- **Generated ids are never used** (`isGeneratedId`): Bits UI `bits-…` ids,
  digits only, UUIDs and long hash-like ids, React `:r1:`, and any id with a
  counter segment such as Svelte `$props.id()` output (`c1` in
  `grid-c1-err`).
- **Fingerprint:** the element's text, its text nodes joined by spaces (at
  most 120 characters), confirms a match.
  - A match with different text keeps looking down the ladder for a match
    whose text agrees.
  - Otherwise it returns the first candidate at half confidence. That is
    below `LOW_CONFIDENCE` (0.7), so the pin is drawn dashed.
  - No match at all is `{ orphaned: true }`.
- **Offset:** 0–1 on each axis, from `getBoundingClientRect`. That box
  includes the ShellHost scale transform, so the stored offset is the same
  at any zoom or frame size. Clicks outside the box clamp to its edge.
  `anchorPoint` turns the offset back into client coordinates.
- **Route:** the anchor stores a route pattern and path. The default is the
  hash route, with the query left out. `anchorMatchesRoute` accepts the exact
  path or the pattern with `:param` segments.
- **Context:** `captureContext` records scenario, persona, shell,
  orientation, theme, mode, layout, viewport and build id, validated by
  `ReviewContextSchema`. The viewport defaults to the window size; missing
  values are left out, and invalid ones throw.

### The `data-py-anchor` convention (optional)

Put `data-py-anchor="deal-card-total"` on elements reviewers are likely to
pin: cards, totals, key buttons, chart areas. The value is a stable,
human-readable id that is unique on its screen. Pins on these elements
survive any markup change.

The attribute is opt-in, and nothing requires it. Components are not
mass-edited to add it: each prototype (and the ui-kit) adopts it in its own
task.

Unit tests (happy-dom) cover the ladder, generated ids, the fingerprint,
offsets and orphans:

```bash
pnpm vitest run packages/review/tests/anchors.test.ts
```

Real layout and the 200-pin budget are covered in E2E (review-e2e).

**Size:** 2.5 KB gzip of its own code. zod and the `@protoyard/core/review`
schemas are external and shared with the rest of the review chunk; bundled
in, the total is 6.1 KB.
