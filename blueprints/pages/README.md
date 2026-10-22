# Page examples

Fictional `kind: "page"` blueprints (ADR-036): a single scrolling marketing page
built from shared blocks. They live outside the flat `blueprints/*.json` app
catalog, so `protoyard index` and the marketplace never list them as apps. They
have no entities, roles or screens.

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

The page body schema from `@protoyard/pages` is not wired into
`parseAnyBlueprint` yet. `protoyard blueprint validate` still validates every
file as an app blueprint, so today it rejects this example (missing `entities`
and `roles`, unknown key `page`); that is expected until the kind-aware
validation reaches the CLI. The test's "parses as kind
page" case turns on by itself once the schema ships.
