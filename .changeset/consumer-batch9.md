---
'@protoyard/cli': patch
'@protoyard/ui': patch
---

Consumer batch 9 (Dailybot). The `component-scoped-class` adoption rule now splits selector lists only at top-level commas and removes nested `:global(...)` groups, so a fully global rule such as `:global(:is(.a, .b).tx-button)` no longer counts `.b` as a scoped class. `EmojiPicker` inside a Texuli `Field` is now named by the Field label plus its visible value (the placeholder or the chosen emoji), even when the Field passes no `aria-labelledby`.
