# Deck

A level-two Protoyard template for building a presentation with owned Svelte code and a data-only deck document. It renders through the same shared `DeckApp` used by the level-one player.

```bash
pnpm protoyard new my-deck --template deck
cd prototypes/my-deck
pnpm protoyard dev my-deck
```

## Source files

- `src/blueprint.json` is the validated `kind: "deck"` source document. Change its slides, layout props, style and outline to author the presentation.
- `src/App.svelte` passes the deck to `@protoyard/decks-ui/app`. Navigation, fragments, keyboard input and print behavior come from the shared renderer.
- `src/custom-slides.ts` provides a typed registry for prototype-owned Svelte slide hosts. The current shared DeckApp supports the data-only layout catalog; custom component rendering needs a future shared renderer contract.
- `src/main.ts` creates the content-kind runtime with `defineKindRuntime` and mounts the app.

The starter `src/app.css` imports the Tailwind source registrations for the
blocks, chart and views kits used by deck slides.

## Deck Studio

When the build includes DevTools, a **Deck** tab is added. The template creates Studio state only when DevTools are enabled and `?devtools=0` is absent. Changes are in-memory previews; use **Copy patch** or **Download patch** to save them.

Studio's RFC 6902 patch is rooted at the deck document. When applying it to this template's complete `src/blueprint.json`, prefix each operation's JSON Pointer `path` with `/deck`. `prefixDeckPatchForBlueprint` in `src/deck-studio.ts` does this while preserving operation values.

## Simulation boundary

The sample brand, product, figures and poll are fictional. The metric is explicitly illustrative; the poll is simulated and its responses stay in the local browser runtime. The template has no service or real provider integration.

## Validation

```bash
pnpm vitest run templates/deck
pnpm --filter @protoyard-template/deck typecheck
pnpm protoyard validate deck --build
pnpm protoyard budget deck
```
