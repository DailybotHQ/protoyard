---
'@protoyard/renderer-svelte': patch
---

Device and window frames paint theme tokens only (Dailybot G-062). The stage, bezel, edge and shadow read `--py-frame-stage`, `--py-frame-bezel`, `--py-frame-edge` and `--py-frame-shadow`, mapped to the theme in `app.css` and overridable on `:root`. Frame controls use elevated surface tokens, and no frame uses palette utilities, literal colors or opacity modifiers, so a computed-color check against the compiled theme passes inside a phone, tablet or desktop frame.
