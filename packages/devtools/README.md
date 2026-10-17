# @protoyard/devtools

The floating control center for a running prototype. It uses only the
framework-agnostic `PrototypeRuntime` API, so it never needs to know the
prototype's domain. The renderer loads it with a dynamic import in dev (and in
builds with `includeDevtools`); `?devtools=0` hides it (presentation mode).

```ts
import { mountDevtools } from '@protoyard/devtools';
const panel = mountDevtools({ runtime, themes });
await panel.destroy();
```

| Tab | What it does |
| --- | --- |
| Scenario | Active scenario (seed, reference time, versions), grouped picker, load with confirm + "snapshot first" + custom seed, reset, copy reproducible link |
| Personas | Acting principal (role, org, capabilities), quick switch (non-destructive), role override, organization switch |
| Time | UI time vs committed vs reference; preview ±1/7/30 days or at an instant; clear preview; advance 1/7 days with applied/skipped counts; reset clock |
| Data | Row counts per table, paginated read-only inspector, reset scenario data |
| Env | Network online/slow/offline, latency, failure mode + rate + scope prefixes, subscription, feature flags |
| Look | Theme swatches, light/dark/system, reduced motion, viewport preset — as a temporary override or saved persona preference |
| Snaps | Save (name + notes), list, restore, download, delete; import a file with preview + warnings, then import or import & restore |
| Share | Reproducible + presentation links, CLI commands (`pnpm protoyard dev/build/export/publish --dry-run`) — the browser never deploys |

Every effective value shows a source badge (`override` / `preference` /
`scenario` / `default`); the header's **Reset N** clears all overrides.
Destructive actions use inline two-step confirmation.

Keyboard: **Ctrl/⌘ + .** toggles from anywhere; **Esc** closes and returns
focus to the launcher; tabs use arrow keys / Home / End. The open state and
tab are remembered per prototype in `localStorage` (`protoyard.<namespace>.devtools`,
guarded). On narrow screens the panel is a bottom sheet with 44px targets.

Styling: Tailwind utilities on the app's `--py-*` tokens (the panel follows
the active theme), mounted in its own `.py-devtools` host outside `#app`; no
global CSS is added. Known limit: while an app modal dialog is open, its focus
trap keeps keyboard focus inside that dialog (the panel stays clickable).
