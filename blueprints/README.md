# Marketplace blueprint catalog

Data-only product blueprints (`*.json`) indexed by `protoyard index` as
`kind: blueprint`. Each file is a full [blueprint](../packages/blueprint/README.md)
with a required **brand** and **catalog** block so the gallery can list it and
`protoyard generate <slug> --blueprint blueprints/<name>.json` can create an
on-brand prototype. The catalog spans four or more related entities per
blueprint, scenario distribution hints (enum weights, date windows and numeric
trends), a dashboard, and at least one domain-specific board, calendar,
timeline, map or analytics screen. The catalog test checks that every supported
screen kind is represented in at least three blueprints and dry-runs generation
for every file.

Fictional data only (`.example` domains via generator fakes). Blueprints are
never bundled into a running prototype’s JS — they are source for generate.

Blueprint notification rules currently apply to all matching writes. They do
not yet support per-persona notification preferences that mute selected rules;
there are no per-rule preference switches in generated Settings screens.

```bash
pnpm protoyard list --kind blueprint
pnpm protoyard generate my-crm --blueprint blueprints/crm.json
pnpm vitest run packages/blueprint/tests/catalog.test.ts
```
