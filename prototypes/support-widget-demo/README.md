# Northwind Help — `support-widget-demo`

A support chat widget for a fictional outdoor-gear store, Northwind
Outfitters, shown in the **widget-host** shell: a made-up storefront with a
chat launcher that opens the app in a panel. The visitor chats with a
scripted assistant, looks up an order, starts a return and asks for a
human, including offline and assistant-outage states. There is **no real
AI, order or payment API**: replies are deterministic canned text, orders
are generated fixtures with `example.com` emails and integer-cent totals,
and the human handoff is one scripted message. Everything persists in the
browser (IndexedDB). Roles are simulated: UX only, not security.

```bash
pnpm protoyard dev support-widget-demo        # run it (DevTools included in dev)
pnpm protoyard validate support-widget-demo --build
pnpm protoyard export support-widget-demo     # portable ZIP
pnpm vitest run prototypes/support-widget-demo
```

Five scenarios (`first-visit`, `returning-customer`, `open-return`,
`agent-offline`, `outage`) are described in
[docs/SPEC.md](docs/SPEC.md#scenarios). Try one with a link such as
`?scenario=outage`.

## Spec

- [AGENTS.md](AGENTS.md): rules for agents working on this prototype
- [docs/SPEC.md](docs/SPEC.md): problem, users, capabilities, scenarios, honest boundaries, rebuild path
- [docs/FLOWS.md](docs/FLOWS.md): each user flow mapped to a service, capability and tables
- [docs/SCREENS.md](docs/SCREENS.md): the widget screen, its states and the widget-host shell
- [docs/DATA_MODEL.md](docs/DATA_MODEL.md): tables, relations, field notes
- [docs/PERMISSIONS.md](docs/PERMISSIONS.md): roles, capabilities, personas

## Tests

`tests/support-widget.test.ts`: generator determinism and integrity for
every scenario, scripted replies and lossless chunking, order lookup and a
return that survives a reload, validation errors, and a streamed reply plus
handoff on the real runtime.
