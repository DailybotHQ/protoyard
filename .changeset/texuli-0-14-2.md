---
'@protoyard/ui': minor
'@protoyard/views-ui': minor
'@protoyard/renderer-svelte': patch
---

Adopt Texuli 0.14.2 (every Texuli dependency pinned exactly). `Select` forwards Texuli's `block` (through `fullWidth` or `block`) and the trigger `variant` (`'ghost'` per instance), and drops its full-width wrapper. `ChipGroup` takes `required`: in single mode the selected chip stays selected (Texuli's `deselectable={false}`). `TimelineView` forwards `initialDate` and `formatTick`; without `initialDate` the axis opens at the simulated today when it falls inside the plan. Texuli fixes come along: dialogs mounted open show their backdrop, controlled toggles render their prop, side sheets and drawers fill their height. The layout host initial cap is re-measured at 4,175 B gzip (cap 4,280 B).
