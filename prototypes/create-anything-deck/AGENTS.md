# AGENTS.md — Protoyard: create anything (`create-anything-deck`)

Repository-wide instructions live in the root [AGENTS.md](../../AGENTS.md).

## Template contract

- `src/blueprint.json` is the deck source of truth. Keep it valid as a `kind: "deck"` document.
- `src/App.svelte` renders the shared `@protoyard/decks-ui/app` DeckApp; keep prototype-owned data in the blueprint and Svelte code in owned components.
- `src/custom-slides.ts` is the typed registry for future prototype-owned slide hosts. The shared DeckApp currently renders the shared data-only layout catalog.
- Deck Studio is created only when DevTools are built and not hidden by `?devtools=0`. Studio patch paths are relative to the deck body; prefix them with `/deck` before applying them to the full blueprint file.
- All sample names, metrics and scenarios are fictional. Poll results are simulated in the local browser runtime.

## Checks

```bash
pnpm vitest run templates/deck
pnpm --filter @protoyard-template/deck typecheck
pnpm protoyard validate deck --build
pnpm protoyard budget deck
```
