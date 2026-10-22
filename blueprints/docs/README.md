# Doc examples

Fictional `kind: "doc"` blueprints (ADR-036): reports, one-pagers and data
stories built from a flow of shared blocks, with a table of contents and print
in mind. They live outside the flat `blueprints/*.json` app catalog, so
they are never listed as apps. They have no entities, roles or screens. Back
to the [catalog index](../README.md#choose-an-example-by-kind).

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

`pnpm protoyard blueprint validate blueprints/docs/northwind-quarterly-report.json` validates
the doc body from `@protoyard/pages` and prints a kind-specific summary.

## Authoring a doc

1. Copy the example above, or start from a brief with
   `blueprintFromBrief(brief, { kind: "doc" })` in `@protoyard/blueprint`.
   It picks a doc outline (report, handbook, one-pager, proposal or generic) and
   returns placeholder sections to replace with real content. The
   `protoyard blueprint new --from-brief` command makes app blueprints only.
2. Validate with `pnpm protoyard blueprint validate <file>`.
3. Run `pnpm vitest run packages/blueprint/tests/page-doc-catalog.test.ts`.

To turn an example into a full prototype (level 2), generate it. The doc template is
picked from the blueprint's kind:

```bash
pnpm protoyard generate my-doc --blueprint blueprints/docs/northwind-quarterly-report.json
pnpm protoyard validate my-doc --build
```

## Listing

`protoyard index` scans this folder, but an example is listed (in the registry,
`protoyard list` and the gallery) only when it has a `catalog` block. These
examples have none yet, so `protoyard index` reports each one as invalid ('catalog
blueprints need a "catalog" block') and none is listed. Adding a `catalog`
block (category, product type, features…) is what lists an example.
