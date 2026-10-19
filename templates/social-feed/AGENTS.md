# AGENTS.md — Social Feed (`social-feed`)

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

- **Plain text only.** Post and comment text is rendered as text (`whitespace-pre-wrap`), never with `{@html}`, and validated to 500 and 300 characters. Media are generated gradient placeholders (`MediaPlaceholder`): never fetch or upload files.
- **The feed is windowed.** Render lists of posts through `VirtualFeed` (measured row heights, `feedWindow()` math). Do not map thousands of rows into the DOM.
- **Viewport layout.** The app is bound to the window height (`h-app`); each screen's list is the scroll region. The composer (`[data-py-composer]`) must stay on screen at 390×844 (layout-fit).
- **Counts are denormalized.** `posts.reactionCounts` and `commentCount` change in the same transaction as the reaction or comment rows; keep them in sync in every service and in `applyEvent`.
- **Activity comes from `eventStream()`.** The seeded inbox and the timeline share `activityStream()` and `notificationFor()`; ids depend only on the day. Bump `SOCIAL_GENERATOR_VERSION` when output can change.

## Quick commands

<!-- protoyard:generated:commands -->
```bash
pnpm protoyard dev social-feed                  # run it (DevTools included)
pnpm vitest run prototypes/social-feed          # unit + integration tests
pnpm protoyard validate social-feed --build     # contract, schema, build
pnpm protoyard spec social-feed --check         # generated spec regions are current
pnpm protoyard export social-feed               # relocatable ZIP
```
<!-- /protoyard:generated:commands -->
