---
'@protoyard/ui': minor
'@protoyard/pages-ui': patch
---

Adopt Texuli 0.14.3. Every Texuli dependency is pinned exactly at `0.14.3`. Re-exported components gain Texuli's new props directly (Checkbox/Radio/Switch `labelContent`, Field `counter`, NumberField `display="output"`, Button/IconButton `iconSize`, BottomNav `emphasis`, MobileHeader `eyebrow`/`leading`/`onClose`, SplitView `listWidth`/`breakpoint`/`context`, Stat `tone`, Composer `layout="row"`/`sendButton="icon"`, `texuli/list-item`, opt-in Spanish catalogs). `@protoyard/ui` `Avatar` forwards the new `tone` and `shape`. The page host's CSS caps rise with Texuli's CSS (initial 7,562 B measured, cap 7,940 B; all CSS 43,139 B, cap 44,218 B).
