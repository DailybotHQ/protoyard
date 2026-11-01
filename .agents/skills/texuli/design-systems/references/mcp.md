# Design systems through the MCP

New in `0.10.0`, on `@texuli/mcp` and on `https://texuli.com/mcp` (every
tool but `ds.save`). The local
server is `npx -y @texuli/mcp` (see [`../../router/hosts.md`](../../router/hosts.md));
the same operations run from a shell as `texuli <group> <verb> --json
<object>`.

## Tools

Every tool but `ds.save` is pure compute and answers the same on the local
and the remote server. A refused document is a normal result with `valid:
false` and `errors` (codes in [`codes.md`](codes.md)), not a tool error.

| Tool | Input | Returns |
| --- | --- | --- |
| `ds.validate` | `document`, `trust`, `variant`, `bases` | `valid`, `codes`, `errors`, `warnings`, `hash` |
| `ds.compile` | `document`, `format` (`json`, `css`, `tailwind`, `dtcg`, `tokens-studio`), `selector`, `dark`, `mode` | `content` (text), `mediaType`, `hash` |
| `ds.contrast` | `document`, `mode` | per mode `total`, `failing`, `pairs`; `adjustments` |
| `ds.suggest` | one of `seed`, `colors` (up to 3), `pixels` (RGBA) | `document`, `palette`, `roles` |
| `ds.import` | `from` (`brand`, `dtcg`, `tokens-studio`, `role-palette`, `theme`), `input` | `document`, `warnings` |
| `ds.diff` | `before`, `after` | `identical`, `summary`, `tokens`, `contrast`, `defaults`, `attrs` |
| `ds.preview` | `document`, `format` (`svg`, `html`) | `content` (escaped, deterministic) |
| `blueprint.theme` | `blueprint` (tree or envelope), `designSystem` (`ref` or `inline`) | `valid`, the themed `blueprint`, `diagnostics` |
| `ds.save` | `path`, `document`, `overwrite`, `dryRun` | `saved`, `path`, `bytes` (local server only; the remote one does not list it) |

`blueprint.validate` also checks an envelope's `designSystem`: an inline
document's codes come back under `$.designSystem`.

## Prompt

`create-design-system` (`brief`, optional `base` theme id and `contrast`
`AA` or `AAA`) returns the authoring loop: read the examples, import or
suggest, write, validate and repair, check contrast and preview, deliver.

## Resources

`texuli://design-system/{id}`: the fictional examples (`acme`, every
section; `minimal`, the smallest; the brands `quillmark`, `ledgerline`,
`tumbletown`) are listed, and every library theme is readable as a
document by its theme id (complete `{id}`; one document per read).
