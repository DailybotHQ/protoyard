# Page examples

Fictional `kind: "page"` blueprints (ADR-036): a single scrolling marketing page
built from shared blocks. They live outside the flat `blueprints/*.json` app
catalog, so they are never listed as apps. They have no entities, roles or
screens. Back to the [catalog index](../README.md#choose-an-example-by-kind).

| Example | Shows |
| --- | --- |
| [Tidewater Roasters landing page](./tidewater-roasters-landing.json) | Hero heading and call to action, proof stats, plan cards, steps, a comparison and a quote, a simulated waitlist form, a closing callout. |

## Shape

The shared root (`formatVersion`, `name`, `description`, `tags`, `icon`,
`category`, optional `catalog` and `brand`), `"kind": "page"`, and one `page`
body:

```json
{
  "formatVersion": 1,
  "kind": "page",
  "name": "…",
  "page": {
    "sections": [
      { "id": "hero", "anchor": "top", "blocks": [{ "type": "heading", "text": "…" }] }
    ]
  }
}
```

- `sections[]` are `{ id, anchor?, blocks[] }`, in reading order. Section ids and
  anchors are unique, and every `#anchor` link in a block points to a section.
- Blocks are the shared block contract from `@protoyard/blocks` (`heading`,
  `cta`, `stat`, `cards`, `steps`, `comparison`, `quote`, `form`, `callout`…).
  Block ids are unique across the page.
- A `form` block is a simulation: responses stay in the browser. The example
  says so in its own copy.
- Fictional data only: `example.com` or `.example` addresses, no remote media,
  no HTML.

## Status

`pnpm vitest run packages/blueprint/tests/page-doc-catalog.test.ts` checks every
example:

- its kind, its root keys, and the absence of app-only keys;
- every block against `@protoyard/blocks`;
- section ids, anchors and in-page links;
- that the data is fictional;
- that it passes the kind union with a provisional body in the documented shape.

`pnpm protoyard blueprint validate blueprints/pages/tidewater-roasters-landing.json` validates
the page body from `@protoyard/pages` and prints a kind-specific summary.

## Authoring a page

1. Copy the example above, or start from a brief with
   `blueprintFromBrief(brief, { kind: "page" })` in `@protoyard/blueprint`.
   It picks a page outline (landing, pricing, waitlist or generic) and
   returns placeholder sections to replace with real content. The
   `protoyard blueprint new --from-brief` command makes app blueprints only.
2. Validate with `pnpm protoyard blueprint validate <file>`.
3. Run `pnpm vitest run packages/blueprint/tests/page-doc-catalog.test.ts`.

To turn an example into a full prototype (level 2), generate it. The page template is
picked from the blueprint's kind:

```bash
pnpm protoyard generate my-page --blueprint blueprints/pages/tidewater-roasters-landing.json
pnpm protoyard validate my-page --build
```

## Listing

`protoyard index` scans this folder, and an example is listed (in the registry,
`protoyard list` and the gallery) when it has a `catalog` block (category,
product type, features…). The landing page example has one, so it is listed and
the marketplace offers it with player and generate actions.
