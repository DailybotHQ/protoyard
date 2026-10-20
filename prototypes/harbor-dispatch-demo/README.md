# Harborlight Dispatch

Harborlight is a fictional freight dispatch prototype. Its blueprint is
synthesized offline from [BRIEF.md](BRIEF.md), reviewed and refined in
[blueprint.json](blueprint.json), and generated with the `crud-app` template.
The generated dashboard, board, shipment map, depot map, timeline and schedule
are driven by the blueprint. Generated files under `src/generated/` are
managed by `protoyard generate`; edit the blueprint and regenerate instead of
changing those files by hand.

## Hand-written files

- `BRIEF.md` records the product idea and requirements reviewed before
  synthesis.
- `blueprint.json` is the reviewed blueprint source of truth. It removes
  unrelated entities inferred from the brief and defines shipment, driver,
  vehicle and depot data, permissions, layouts and screens.
- `protoyard.json` supplies Harborlight's marketplace metadata and supported
  sidebar and mobile tab layouts.
- `src/scenarios/index.ts` names the four generated scenarios and uses the
  Harborlight organization name.
- `src/scenarios/generators.ts` wraps the generated world with deterministic
  harbor names, tracking references, delivery states, assignments and ordered
  schedule windows.
- `tests/generators.test.ts` checks deterministic generation, referential
  integrity and believable dispatch records.
- `../../tests/e2e/harbor-dispatch-demo.spec.ts` covers dispatch persistence,
  map-list access, timeline rescheduling and axe checks for the main screens.
- `../../tests/e2e/layout-fit.spec.ts` exercises the generated prototype's
  default layout at desktop and phone sizes when this slug is selected.
- `docs/SCREENS.md` describes the generated screen routes and offline map
  boundary.

This is a local simulation: records are browser-local, roles are UX permissions,
and the fictional basemap uses no network tile service.

## Idea-to-running measurement

The run started immediately before the first brief review and ended at the
first passing `validate --strict-spec --build` production build. It took
330,326 ms on Darwin 27.0.0 arm64 with Node v26.11.1 for `harbor-dispatch-demo`.
These are one-run milestone times, not a stable performance claim.

| Phase milestone (UTC) | Elapsed |
| --- | ---: |
| Brief review started — 2026-10-20 00:00:29.078 | 0 ms |
| Reviewed blueprint written — 2026-10-20 00:02:56.522 | 147,444 ms |
| Prototype generated — 2026-10-20 00:03:06.899 | 157,821 ms |
| Scenario wrapper completed — 2026-10-20 00:04:57.656 | 268,578 ms |
| Spec refreshed — 2026-10-20 00:05:40.232 | 311,154 ms |
| First strict validation build passed — 2026-10-20 00:05:59.404 | 330,326 ms |

The initial JS gzip budget is 201.53 KB of 250 KB; CSS gzip is 21.87 KB of
30 KB. Export passed its isolation and relocatability checks with a 1.2 MB
ZIP containing 471 files.

```bash
pnpm protoyard dev harbor-dispatch-demo
pnpm vitest run prototypes/harbor-dispatch-demo
pnpm protoyard validate harbor-dispatch-demo --strict-spec --build
pnpm protoyard export harbor-dispatch-demo
```
