# @protoyard/review

The engine for review comments on published prototypes: reviewers click a
spot on a screen, leave a comment pinned there, and the team reads every
thread in one list. This package has no Svelte; the UI is
[`@protoyard/review-ui`](../review-ui/README.md). The comment schemas live in
`@protoyard/core/review`.

> **Status:** `./anchors`, `./store`, `./adapters/local` and `./adapters/artifact` are implemented.
> The remaining subpaths are filled by their PLAN_003 tasks and documented here when they land.

| Subpath | What it will hold | Task |
| --- | --- | --- |
| `./anchors` | Pin anchors: route, element locator ladder, offset inside the element, context | T-review-anchoring |
| `./store` | The small `ReviewAdapter` contract and its conformance suite | T-review-adapter-contract |
| `./adapters/local` | Namespaced IndexedDB adapter (its own database, untouched by scenario loads) with validated export / import | T-review-adapter-local |
| `./adapters/http` | Adapter for any endpoint with the comments REST shape (also the Cloudflare mode) | T-review-adapter-http |
| `./adapters/artifact` | Adapter on a Claude Artifact's shared database (`db` + `user` capabilities), falling back to a local adapter | T-art-review-artifact-adapter |
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

## Local adapter (`@protoyard/review/adapters/local`)

`createLocalReviewAdapter({ namespace, slug, clientId })` stores comments in
`protoyard.<namespace>.review`, separate from the prototype data and control
databases. The optional `slug` defaults to `namespace` and scopes exported
files. `exportComments()` returns a JSON `Blob`; `importComments(file)` validates
the whole file, its namespace and slug, and every comment before writing. Files
larger than 5 MB are rejected. Imports merge by comment id and only replace an
existing comment when the incoming `updatedAt` is newer. The adapter allows edits
and deletes only when the stored author `clientId` matches its configured
`clientId`; this is a browser UX rule, not authentication or a security boundary.

Call `close()` when the adapter is no longer needed. A host can supply
`indexedDB` and `IDBKeyRange` to isolate the adapter storage factory.

## Store (`@protoyard/review/store`)

One small interface for every place comments can live: local IndexedDB, the
Cloudflare Function, any http endpoint and the artifact database. The UI
never branches on the backend.

```ts
interface ReviewAdapter {
  list(slug: string, options?: { since?: string }): Promise<ReviewComment[]>; // oldest first
  put(comment: ReviewCommentInput): Promise<ReviewComment>; // upsert by id, stamps updatedAt
  remove(id: string): Promise<void>; // a missing id resolves too
  info(): { kind: 'local' | 'cloudflare' | 'http' | 'artifact'; shared: boolean; live: boolean };
  subscribe?(slug: string, onChange: () => void): () => void; // when live
}
```

- **Documents keyed by a client-generated id, last write wins.** The
  adapter (or its server) stamps `updatedAt` and ignores the client's copy.
  An edit, a resolve (`resolvedAt` and `resolvedBy`) and a reopen (the
  document without them) are each a `put` of the whole comment. That means a
  key-value or document store needs no special verbs.
- **Ordering and polling:** `list` returns a slug's comments by `createdAt`,
  then id. `since` keeps only comments whose `updatedAt` is later, for
  polling.
- **Validation** uses the core zod schema on both sides:
  `parseReviewComment` before writing, and `acceptStoredComments` to drop
  invalid rows read back from storage or the network.
- **Permissions are not here.** Rules such as "edit only your own comment"
  live in the UI and the server. Reviewer names are self-declared, so this
  is not authentication.
- **Helpers for adapters:**
  - `createStamper` makes strictly increasing stamps, even for several
    writes in one millisecond.
  - `sortReviewComments` and `changedSince` cover ordering and the `since`
    filter.
  - `watchReviewComments(adapter, slug, onChange)` uses `subscribe` when
    the adapter is live. Otherwise it polls `list` and compares ids and
    stamps, so removals are noticed too.
- **Reference adapter:** `createMemoryReviewAdapter()` keeps comments in
  memory, for tests and demos. It defines the contract's behavior.

### Conformance suite

Every backend must pass `tests/conformance.ts`. It checks:
- a round trip with the adapter's own stamp
- idempotent upserts for edit, resolve and reopen
- remove
- ordering and slug isolation
- the `since` filter
- schema rejection, with nothing stored
- change notification through `subscribe` or the polling fallback

```ts
import { runAdapterConformance } from '../../review/tests/conformance.ts';

runAdapterConformance('artifact adapter', () => createArtifactReviewAdapter(db), {
  cleanup: (adapter) => clearTables(),
});
```

Each case gets a fresh adapter and its own slug. The memory adapter runs the
suite twice: live, and as a polling-only backend.

```bash
pnpm vitest run packages/review/tests/adapter-contract.test.ts
```

**Size:** the contract helpers are 0.55 KB gzip, and 0.8 KB with the memory
adapter. zod and the `@protoyard/core/review` schemas are external.

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

## Artifact adapter (`@protoyard/review/adapters/artifact`)

When a prototype is shared as a Claude Artifact, comments can live in the
artifact's shared database, so every viewer sees the same threads.

```ts
import { createArtifactReviewAdapter } from '@protoyard/review/adapters/artifact';

const adapter = await createArtifactReviewAdapter(localAdapter);
```

- **Fallback:** it asks for the `db` and `user` capabilities. If either is
  missing or refused, it returns the local adapter you pass in, and
  `LOCAL_REVIEW_FALLBACK_NOTICE` tells the viewer that comments are saved
  only in their browser.
- **Authors:** it stores author ids only and resolves profile names on read.
  It serializes writes per document and keeps live subscriptions to at most
  64 collections per view.
- **Conformance:** it passes `tests/conformance.ts`, tested against a fake
  Claude capability surface (`tests/fixtures/fake-claude.ts`).
- **Not live-verified:** no real Artifact runtime has exercised it yet; that
  happens in T-art-real-private-publish.
