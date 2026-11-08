---
'@protoyard/cli': patch
---

Consumer batch 10 (Dailybot). `protoyard showcase` (site target) finds `@protoyard/player` where pnpm installs it with `@protoyard/cli`, not only at the workspace root, so a consumer workspace installed from npm no longer fails after building every demo. When no player is installed, the command now stops before building anything and says how to add it.
