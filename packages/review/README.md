# @protoyard/review

The engine for review comments on published prototypes: reviewers click a
spot on a screen, leave a comment pinned there, and the team reads every
thread in one list. This package has no Svelte; the UI is
[`@protoyard/review-ui`](../review-ui/README.md). The comment schemas live in
`@protoyard/core/review`.

> **Status: scaffold.** The subpaths exist and are empty. Each one is filled
> by its PLAN_003 task, and this README documents it when it lands.

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
