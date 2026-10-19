# AGENTS.md — Relay Chat (`relay-chat-demo`)

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

- Bots never call a model. `@relay`, `/relay`, `/standup`, `/ops` and
  `/summarize` replies come from `src/domain/bots.ts` and are deterministic
  from the scenario seed and the prompt (`botReply`, `summarizeChannel`).
  Keep the "simulated" wording in replies and the "AI · simulated" badge.
- Bot ids (`bot_relay`, `bot_standup`, `bot_ops`) are written to
  `messages.authorId` with `authorKind: 'bot'`; they are not personas, so do
  not add `messages.authorId` to `integrity.relations`.
- Composite ids are built by the helpers in `src/database/schema.ts`
  (`memberId`, `readMarkerId`, `reactionId`, `presenceId`, `dmKeyFor`). Use
  them, never hand-built strings: reaction toggling and DM de-duplication
  depend on them.
- Huddles are simulated: captions come from the fixed transcripts in
  `createHuddleVoice`; no microphone, speech API or audio is used. Keep it
  that way and say so in the UI.
- `files` rows are metadata only (`name`, `sizeBytes`, `mimeType`); no bytes
  are stored. `shareFile` caps `sizeBytes` at 25,000,000.
- Several services skip parts of the standard pipeline today (see
  [docs/FLOWS.md](docs/FLOWS.md)). New mutations should follow the full
  `session.assert` → zod → `environment.run` → `db.transaction` path.

## Quick commands

<!-- protoyard:generated:commands -->
```bash
pnpm protoyard dev relay-chat-demo                  # run it (DevTools included)
pnpm vitest run prototypes/relay-chat-demo          # unit + integration tests
pnpm protoyard validate relay-chat-demo --build     # contract, schema, build
pnpm protoyard spec relay-chat-demo --check         # generated spec regions are current
pnpm protoyard export relay-chat-demo               # relocatable ZIP
```
<!-- /protoyard:generated:commands -->
