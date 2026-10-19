# AGENTS.md — Course LMS (`course-lms`)

Repository-wide rules live in the root [AGENTS.md](../../AGENTS.md). This
template uses the repo's per-prototype spec harness documented in
[docs/SPECS.md](../../docs/SPECS.md).

## Index

- [README.md](README.md): template capabilities and commands
- [docs/SPEC.md](docs/SPEC.md): users, capabilities, boundaries and manifest facts
- [docs/DATA_MODEL.md](docs/DATA_MODEL.md): tables, relations and persistence
- [docs/FLOWS.md](docs/FLOWS.md): lesson, quiz and cohort workflows
- [docs/SCREENS.md](docs/SCREENS.md): learner and instructor routes
- [docs/PERMISSIONS.md](docs/PERMISSIONS.md): simulated role capabilities

## Template-specific rules

- Keep course content and learner identities fictional; student email addresses
  use `example.com`.
- Mutations go through `src/domain/services.ts`. Completion is idempotent by
  lesson and learner; quiz submissions are separately recorded and graded in
  the service.
- Cohort sessions come from `@protoyard/scenarios` `schedule()` and must stay
  deterministic for each scenario id and seed.
- The instructor chart imports `@protoyard/charts-ui/cartesian` lazily. Do not
  move chart components into the initial app or the `@protoyard/ui` barrel.
- Personas, role policy, grading and persisted records are local simulation;
  they do not provide real authentication, academic records or certification.

## Quick commands

<!-- protoyard:generated:commands -->
```bash
pnpm protoyard dev course-lms                  # run it (DevTools included)
pnpm vitest run prototypes/course-lms          # unit + integration tests
pnpm protoyard validate course-lms --build     # contract, schema, build
pnpm protoyard spec course-lms --check         # generated spec regions are current
pnpm protoyard export course-lms               # relocatable ZIP
```
<!-- /protoyard:generated:commands -->
