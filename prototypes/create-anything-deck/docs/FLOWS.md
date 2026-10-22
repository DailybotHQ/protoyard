# Protoyard: create anything: flows

Each flow ends in the service layer: UI → service → `session.assert` → zod →
`environment.run` → `db.transaction`. Every mutation in
`src/domain/services.ts` should appear in at least one flow.

## TODO: first flow

1. TODO: where the user starts and what they do.
2. Service: TODO `service.method(args)` in src/domain/services.ts
3. Capability: TODO
4. Writes: TODO tables and fields
5. Failure states: permission denied, simulated offline (nothing written)
