# AGENTS.md — Pebblestat Analytics (`pebblestat-analytics-demo`)

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

- **Fictional product.** Pebblestat is a made-up analytics company tracking its own two products, **Pebblestat Web** (`proj_web`) and **Pebblestat Mobile** (`proj_mobile`). Every name and number is fictional.
- **Everything is per project.** `users`, `events`, `rollups`, `dashboards`, `segments`, `reports`, `alerts` and `annotations` carry `projectId`. Screens read the current project from `src/lib/project.svelte.ts` and list it in every `liveQuery` `deps`.
- **Tracked data is read-only.** `users`, `events`, `rollups` and `alertChecks` come only from the generator and the timeline; no service writes them.
- **Sampling is explicit.** A project with `sampleRate < 1` stores a user sample (every event of that share of users) plus `rollups`, the full stream's daily counts per type:
  - event totals and the events line read the rollups;
  - user counts are the sample divided by the rate, labelled "(est.)";
  - widgets built from the sample say so.
- **Alerts fire only through the timeline.** `alertCheckEvents` makes one check per alert per day at 09:00 UTC. Its value depends only on the scenario seed, the alert id and the day, and its id is `alert-check:<alertId>:<day>`. `applyEvent` writes the check and updates the alert. Muted alerts are checked but never fire.
- **Ownership:** analysts rename and delete only their own reports, segments, alerts and annotations, checked against the stored row inside the transaction. Owners hold `*`.
- **Determinism:** the generator uses only `ctx.rng` forks, `ctx.ids` and the scenario reference time. Bump `PEBBLESTAT_GENERATOR_VERSION` when the same seed could produce a different world.

## Quick commands

<!-- protoyard:generated:commands -->
```bash
pnpm protoyard dev pebblestat-analytics-demo                  # run it (DevTools included)
pnpm vitest run prototypes/pebblestat-analytics-demo          # unit + integration tests
pnpm protoyard validate pebblestat-analytics-demo --build     # contract, schema, build
pnpm protoyard spec pebblestat-analytics-demo --check         # generated spec regions are current
pnpm protoyard export pebblestat-analytics-demo               # relocatable ZIP
```
<!-- /protoyard:generated:commands -->
