---
"@protoyard/decks-ui": patch
---

`DeckApp` runs on `@texuli/slides/stage-core` with a deck already prepared by `prepareDeckV2`, so the stage paints without validating again. The Debug for agents button sits in the stage toolbar's host-tools group, and print preloads its view without Texuli's default renderers.
