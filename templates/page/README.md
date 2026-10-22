# Page template

Landing-page **kind** starter (`blueprintKind: "page"`). Renders
`@protoyard/pages-ui` `PageApp` from `blueprint.json` through
`defineKindRuntime`. Includes a waitlist form whose responses persist in
IndexedDB via `@protoyard/pages` form services.

```bash
pnpm protoyard dev page
pnpm vitest run templates/page
pnpm protoyard validate page --build
```
