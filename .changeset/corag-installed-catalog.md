---
'@protoyard/gallery': patch
---

Corag consumer gap (1.5.0). In a consumer workspace the gallery reads the catalog blueprints indexed from the installed `@protoyard/templates` package (hoisted or under pnpm's `.pnpm` store) instead of omitting each one as an invalid entry, so the showcase home no longer reports "52 folders have an invalid protoyard.json" and the build no longer warns "Omitted registry record". The same no-symlink, inside-the-workspace and size checks apply; other `node_modules` paths are still refused.
