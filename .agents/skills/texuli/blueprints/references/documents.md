# Documents as data (spec 0.7.0)

Agents write documents (briefs, reports, notes, pages) as data and edit
them with bounded patches. Everything here is offline. `@texuli/document`
and `@texuli/pages` are on npm from `0.7.0`, their first release (with
spec `0.7.0` in `@texuli/spec@0.7.0`); `0.6.0` predates them.

## The node

```json
{
  "format": "texuli-blueprint",
  "version": 1,
  "id": "launch-brief",
  "status": "draft",
  "spec": "0.7.0",
  "tree": {
    "key": "brief",
    "id": "document",
    "props": {
      "doc": {
        "format": "texuli-document",
        "formatVersion": 1,
        "meta": { "title": "Launch brief", "locale": "en" },
        "blocks": [
          {
            "id": "intro",
            "type": "paragraph",
            "content": [{ "type": "text", "text": "The example.com beta opens next week.", "marks": [] }]
          },
          {
            "id": "numbers",
            "type": "block",
            "family": "data",
            "block": "stat",
            "props": { "items": [{ "label": "Pilot teams", "value": "40" }] }
          },
          {
            "id": "trend",
            "type": "embed",
            "kind": "component",
            "title": "Sign-ups per week",
            "inline": { "id": "charts-sparkline", "props": { "label": "Sign-ups", "values": [12, 18, 25] } }
          }
        ]
      }
    }
  }
}
```

- Block types: `paragraph`, `heading`, `code`, `list`, `quote`, `divider`,
  `media`, `callout`, `toggle`, `columns`, `page-link`, `block` and
  `embed`. Text runs carry marks (`strong`, `em`, `code`, `link`…); text is
  never HTML, and an HTML-looking string is refused by the sink scan.
- Links and media pass the URL policy at the **host's** tier: at
  `untrusted`, relative and plain `http:` links are refused.
- The spec checks the document's envelope (`$defs.document`); the full
  document schema is `packages/spec/schemas/document.schema.json`, pinned
  from `@texuli/document`.

## Validate and paint

```ts
import { validateDraft } from '@texuli/catalog/validate';
import { checkDocumentDraft } from '@texuli/pages/host';

const result = validateDraft(agentOutput, { catalog, checkDocument: checkDocumentDraft });
```

```svelte
<script lang="ts">
  import { createDocumentPlayerHost } from '@texuli/pages/host';
  import { Player } from '@texuli/player';
  let { draft } = $props();
  const documentHost = createDocumentPlayerHost();
</script>

<Player blueprint={draft} label="Agent document" {documentHost} />
```

## Patch

```json
{
  "op": "patchDocument",
  "key": "brief",
  "patch": [
    { "op": "test", "path": "/meta/title", "value": "Launch brief" },
    { "op": "replace", "path": "/meta/title", "value": "Launch brief, revised" }
  ]
}
```

`applyEditOps(tree, ops, { patchDocument })` needs the host's patcher
(`applyDocumentPatch` from `@texuli/document/ops`); the patch applies all
or none, its result is validated, and the inverse restores the input.

## Commands

The `document` command of the `texuli` bin of `@texuli/tools` (and the
read-only `document.run` and `document.export` MCP tools, same commands)
prints JSON; `--out` writes a new file and never overwrites one:

```bash
npx texuli document capabilities
npx texuli document from-markdown --file <notes.md>
npx texuli document validate --file <doc.json>
npx texuli document patch --file <doc.json> --patch <patch.json>
npx texuli document to-blueprint --file <doc.json> --key brief
npx texuli document to-pdf --file <doc.json> --out <brief.pdf>
```
