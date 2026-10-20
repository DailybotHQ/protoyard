# Pulse Revenue

Generated with `pnpm protoyard generate pulse-revenue-demo --blueprint <file>` from
[blueprint.json](blueprint.json), on the `crud-app` template.

| Entity | Table | Fields | Route |
| --- | --- | --- | --- |
| `transaction` | `transactions` | 8 | `#/transactions` |

- `blueprint.json` is the source of truth. Files under `src/generated/` carry a hash
  header and are rewritten by regeneration; do not edit them.
- A dashboard declaring `path: "/"` owns the home route; the generated Home screen remains available only when no root dashboard is declared.
- `src/generated/` emits the dashboard, analytics explorer, lifecycle board, transaction list/detail, and settings routes from the blueprint. The CRUD template's member management screen remains available at `/members`.
- `src/scenarios/index.ts` adds empty, quarter-of-history, launch-spike, and read-only viewer scenarios. See [SCREENS.md](docs/SCREENS.md), [FLOWS.md](docs/FLOWS.md), and [BRIEF.md](BRIEF.md) for behavior and scope.
- The brief's simulated revenue data is fictional and local to the browser. Roles model the experience and are not security controls.

```bash
pnpm protoyard dev pulse-revenue-demo
pnpm vitest run prototypes/pulse-revenue-demo
pnpm protoyard validate pulse-revenue-demo --strict-spec --build
pnpm protoyard export pulse-revenue-demo
```
