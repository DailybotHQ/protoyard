# Marketplace blueprint catalog

Data-only product blueprints (`*.json`) indexed by `protoyard index` as
`kind: blueprint`. Each file is a full [blueprint](../packages/blueprint/README.md)
with a required **brand** and **catalog** block so the gallery can list it and
`protoyard generate <slug> --blueprint blueprints/<name>.json` can spin up an
on-brand CRUD prototype.

Fictional data only (`.example` domains via generator fakes). Blueprints are
never bundled into a running prototype’s JS — they are source for generate.

```bash
pnpm protoyard list --kind blueprint
pnpm protoyard generate my-crm --blueprint blueprints/crm.json
pnpm vitest run packages/blueprint/tests/catalog.test.ts
```
