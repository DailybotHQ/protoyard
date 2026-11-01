---
"@protoyard/ui": minor
"@protoyard/devtools": minor
"@protoyard/renderer-svelte": minor
---

Move every Texuli dependency to the exact npm version 0.9.0. Every `@protoyard/ui` component export takes Texuli's uniform contract: `bind:ref` gives its root element, rest attributes land on the root or its focusable control, and a caller's handlers run first. Additive API: `ref` and rest props everywhere, `CommandPalette` `bind:open`, `FileDropzone` `id` and `TabItem.badgeLabel`. Overlays, toasts, date fields, tags, Kanban and avatars drop their gap adapters for Texuli's fixes.
