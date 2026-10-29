# WCAG AA gate (not APCA)

Pass/fail **always** uses WCAG 2.x AA:

| Kind | Ratio |
| --- | ---: |
| Text (default, hover, active on filled roles) | **≥ 4.5:1** |
| Non-text UI boundaries (1.4.11) | **≥ 3:1** |

- Catalog **AAA** themes may report `enhancedIssues` under 7:1 for docs UI;
  those do **not** fail `runAaGateOnTheme` unless the product policy says so.
- **APCA is out of scope** (license). Do not label WCAG output as APCA.
- Forced-colors / high-contrast modes rely on platform system colors; still
  keep logical CSS and token fallbacks (`Canvas`, `CanvasText`, `Highlight`).

```ts
import { runAaGateOnTheme } from '@texuli/tokens/aa-gate';

const report = runAaGateOnTheme(theme);
if (!report.ok) {
  // Fix palette pairs listed in report.issues — do not ship.
}
```
