---
"@protoyard/player": patch
"@protoyard/cli": patch
---

Each player kind page loads only its own renderer, and a single-file export leaves out what its kind never runs, so a deck file no longer carries the doc editor and forms. Single-file caps are lowered to the measured maximum + 5 % (app 4,065,196 B, deck 2,801,658 B, page 2,464,489 B).
