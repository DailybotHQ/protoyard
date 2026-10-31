---
"@protoyard/cli": minor
"@protoyard/player": minor
"@protoyard/blueprint": minor
---

`quick serve` paints a deck, page or doc while its file is still being written: the server finds the valid part of the truncated JSON (`paintStreamedBlueprint`), serves it as a draft, and the player applies it as untrusted input with a "Receiving the deck" notice until the complete file lands. Apps paint only once complete.
