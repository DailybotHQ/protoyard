---
"@protoyard/cli": minor
"@protoyard/core": patch
---

Consumer feedback on locked design systems. `check ds` treats text flow the
same in CSS and utilities: `text-align`, `text-align-last`, `text-overflow`
and `text-wrap` pass in a stylesheet, as `text-center` and `truncate` already
did. `protoyard new --dry-run` runs every check (slug, source, destination,
`--ds` design system and template gate) and writes nothing. Every npm package
now ships its `CHANGELOG.md`, and `check:packages` requires it.
