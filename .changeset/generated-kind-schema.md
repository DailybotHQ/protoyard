---
"@protoyard/cli": patch
---

`generate` records the content-kind runtime's storage schema (`KIND_SCHEMA_VERSION`, now 2) in a deck, page or doc prototype's manifest and generation snapshot. Regenerating one made at version 1 upgrades it, and the drift check reports a content-kind manifest that is behind.
