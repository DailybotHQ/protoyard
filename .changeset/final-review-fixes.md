---
'@protoyard/cli': patch
'@protoyard/views-ui': patch
'@protoyard/saas-ui': patch
'@protoyard/offline': patch
'@protoyard/renderer-svelte': patch
---

Final-review fixes for PLAN_010 to 012. `gallery build --out` and `sweep --out` go through the output guard, so they never empty the workspace or its sources. `FilePreview` no longer stays on "Loading preview…" after leaving a pending load. The phone calendar falls back to the month view when its agenda chunk cannot load. `SsoButtons` ignores engine `scenarios` under `provideSaas({ ports })` (new `hasSaasRuntime`). The offline plugin resets per build in watch mode. A failed full-screen switch no longer leaves the hint pending.
