# AGENTS.md — Northwind Help (`support-widget-demo`)

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

- Services live in `src/domain/chat.ts` (`createChatServices`), not
  `src/domain/services.ts`. Screens call them through `chat` from
  `provideChat()`; never write tables from `src/App.svelte`.
- The assistant is scripted, never a real model. `scriptedReply` and
  `chunkReply` in `src/domain/assistant.ts` must stay a pure function of the
  prompt; the generator reuses `scriptedReply` for history. Never add a real
  AI or order API call, or describe the assistant or the human handoff as
  real.
- Assistant replies run through `environment.run('assistant.reply')`, which
  is what the `outage` scenario (failure scope `assistant.`) makes fail.
  Keep the empty `streaming` row written before the call.
- One thread: `conv_support` (`SUPPORT_THREAD_ID`). Stamp messages with
  `nextAt(conversationId)`, not `clock.now()` alone.
- Money is integer cents (`orders.totalCents`, `returns.amountCents`); a
  refund never exceeds the order total. Orders and emails stay fictional
  (`NW-…` numbers, `example.com`).
- The app runs in the `widget-host` shell: it must fit the 380 × 560 px
  panel and full-screen phone layout, and drives the launcher badge only
  through `tryGetWidgetHost()`. There are no routes; update
  [docs/SCREENS.md](docs/SCREENS.md) by hand when the screen changes.

## Quick commands

<!-- protoyard:generated:commands -->
```bash
pnpm protoyard dev support-widget-demo                  # run it (DevTools included)
pnpm vitest run prototypes/support-widget-demo          # unit + integration tests
pnpm protoyard validate support-widget-demo --build     # contract, schema, build
pnpm protoyard spec support-widget-demo --check         # generated spec regions are current
pnpm protoyard export support-widget-demo               # relocatable ZIP
```
<!-- /protoyard:generated:commands -->
