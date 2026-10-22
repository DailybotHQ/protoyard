# Doc examples

Fictional `kind: "doc"` blueprints (ADR-036): reports, one-pagers and data
stories built from a flow of shared blocks, with a table of contents and print
in mind. They live outside the flat `blueprints/*.json` app catalog, so
`protoyard index` and the marketplace never list them as apps. They have no
entities, roles or screens.

| Example | Shows |
| --- | --- |
| [Northwind support quarterly report](./northwind-quarterly-report.json) | A one-page quarterly report: summary callout, headline stats, a bar chart, a channel table, a milestone timeline and a next-steps checklist. |

## Shape

The shared root (`formatVersion`, `name`, `description`, `tags`, `icon`,
`category`, optional `catalog` and `brand`), `"kind": "doc"`, and one `doc`
body:

```json
{
  "formatVersion": 1,
  "kind": "doc",
  "name": "…",
  "doc": {
    "toc": { "depth": 2, "sticky": true },
    "blocks": [{ "type": "heading", "id": "title", "level": 1, "text": "…" }]
  }
}
```

- `blocks[]` is the document flow, using the shared block contract from
  `@protoyard/blocks`.
- There is exactly one level-1 heading (the title). Every heading has a unique
  `id`, so the table of contents gets stable deep links.
- `toc.depth` is the deepest heading level listed, and `toc.sticky` keeps the
  table of contents visible while scrolling.
- Fictional data only: `example.com` or `.example` addresses, no remote media,
  no HTML. Labels such as "fictional" and "example survey" stay in the copy.

## Status

`pnpm vitest run packages/blueprint/tests/page-doc-catalog.test.ts` checks every
example:

- its kind, its root keys, and the absence of app-only keys;
- every block against `@protoyard/blocks`;
- heading ids and TOC settings;
- that the data is fictional;
- that it passes the kind union with a provisional body in the documented shape.

The doc body schema from `@protoyard/pages` is not wired into
`parseAnyBlueprint` yet. `protoyard blueprint validate` still validates every
file as an app blueprint, so today it rejects this example (missing `entities`
and `roles`, unknown key `doc`); that is expected until the kind-aware
validation reaches the CLI. The test's "parses as kind
doc" case turns on by itself once the schema ships.
