# @protoyard/pages

Framework-agnostic **page** and **doc** engine for Protoyard blueprints
(`kind: "page"` and `kind: "doc"`, [ADR-036](../../docs/DECISIONS.md) and
[ADR-039](../../docs/DECISIONS.md)). No Svelte. Document schemas, limits, a TOC
builder and form-response contracts land in later PLAN_005 tasks. Svelte hosts
(`PageApp`, `DocApp`, form UI, print CSS) live in
[`@protoyard/pages-ui`](../pages-ui/README.md).

## Status

Scaffold only. The public surface today is the package identity:

| Export | Contents |
| --- | --- |
| `@protoyard/pages` | `PAGES_PACKAGE`, `PAGES_PACKAGE_VERSION`, `PagesPackageIdentitySchema` |

`sideEffects: false`. The package is in the `engine` build group.

## Install in a workspace prototype

```json
{
  "dependencies": {
    "@protoyard/pages": "workspace:*"
  }
}
```

```ts
import { PAGES_PACKAGE_VERSION } from '@protoyard/pages';
```

## Coming next (PLAN_005)

- Page and doc document zod schemas (body owned here; union in `@protoyard/blueprint`)
- Authoring and untrusted caps
- Pure TOC builder from heading and section ids
- `formResponses` feature-table schema and services (form *block* schema stays in `@protoyard/blocks`)
- Minimal `definePrototypeFromPage` / `definePrototypeFromDoc` runtimes

## Development

```bash
pnpm --filter @protoyard/pages typecheck
pnpm vitest run packages/pages
```
