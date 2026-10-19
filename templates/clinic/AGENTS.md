# AGENTS.md — Clinic (`clinic`)

The entry point for agents working on this prototype. Repository-wide rules
live in the root [AGENTS.md](../../AGENTS.md); the spec standard is
[docs/SPECS.md](../../docs/SPECS.md).

## Index

- [docs/SPEC.md](docs/SPEC.md): problem, users, capabilities, honest boundaries, rebuild path
- [docs/DATA_MODEL.md](docs/DATA_MODEL.md): tables, indexes, relations, schema versions
- [docs/FLOWS.md](docs/FLOWS.md): user flows mapped to services, capabilities and tables
- [docs/SCREENS.md](docs/SCREENS.md): routes, screens and their states
- [docs/PERMISSIONS.md](docs/PERMISSIONS.md): roles × capabilities, rules, personas

## Rules for this prototype

- **Fictional patients only.** This is a simulation, not a medical record
  system, and makes no HIPAA or other compliance claim. The banner in
  `SimulationBanner.svelte` says so on every screen; keep it. Contacts must
  stay obviously fictional (`@example.com`, `+1 555-01xx`, `SIM-123456`):
  the zod schemas in `src/domain/validation.ts` refuse anything else.
- **Sensitive fields** are listed once, in `SENSITIVE_PATIENT_FIELDS`
  (`src/database/schema.ts`). Screens mask them until
  `services.patients.reveal()` (which writes a `patient.revealed` audit entry),
  and every audit change stores them as `[redacted]` (`patientChanges()`).
  A new sensitive field goes in that list, nowhere else.
- **Every mutation writes its audit entry in the same transaction.** Note
  bodies are sensitive too: the audit records that a note changed, never its
  text.
- **Visit notes are plain text.** Render them with `whitespace-pre-wrap`,
  never `{@html}`. Only the treating clinician (the provider's `personaId`)
  writes and signs; a signed note never changes.
- **Times are UTC.** Appointments are half-open `[start, end)` on a 15-minute
  grid inside the provider's hours; the service re-checks provider and
  patient overlaps inside the write transaction.

## Quick commands

<!-- protoyard:generated:commands -->
```bash
pnpm protoyard dev clinic                  # run it (DevTools included)
pnpm vitest run prototypes/clinic          # unit + integration tests
pnpm protoyard validate clinic --build     # contract, schema, build
pnpm protoyard spec clinic --check         # generated spec regions are current
pnpm protoyard export clinic               # relocatable ZIP
```
<!-- /protoyard:generated:commands -->
