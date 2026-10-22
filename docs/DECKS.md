# Decks

Protoyard decks are bounded, data-only presentations rendered by
`@protoyard/decks-ui/app`. A deck uses stable slide IDs; the renderer keeps the
current slide and step in the URL hash as `#/<slide-id>/<step>`, so a copied
link opens the same place without a server or client-side router.

## Navigation

- **Arrow keys** and **Space** advance or go back through authored steps and
  slides. Home and End jump to the first and last visible slide.
- Press **O** to open the overview and select a slide. **Escape** closes an
  open deck overlay.
- Press **F** to enter or leave fullscreen where the browser permits it; the
  browser's fullscreen controls are also available.
- A click on the slide canvas advances. Links, buttons, embedded controls and
  the deck's progress chrome keep their own click behavior.
- On touch devices, a horizontal swipe moves between slides; vertical movement
  remains available to scroll.

Navigation is keyboard usable and honors the browser's reduced-motion
preference. The catalog deck browser checks cover the desktop and mobile
projects, including deep links, guarded interactions, overview, fullscreen,
swipe and reduced-motion preference handling:

```sh
pnpm exec playwright test tests/e2e/deck-navigation.spec.ts
```

The E2E fixture mounts the real DeckApp with the Lumen Launch catalog deck. It
adds three explicit navigation labels to one fixture slide so the test can
verify stable step links and step-before-slide keyboard behavior.

## Authoring

Deck blueprints live in `blueprints/decks/` and declare `kind: "deck"`, a
bounded `deck` object, slides with stable IDs, and optional outline sections.
The layout catalog provides reusable compositions; `layout: "free"` uses
validated content blocks. Read [the deck package guide](../packages/decks/README.md)
for the schema, navigation model, layout props and authoring limits.
