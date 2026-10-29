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

| Export | Purpose |
| --- | --- |
| `mountDevtools({ runtime, themes?, target? })` | Mounts the panel in its own `.py-devtools` host (default: appended to `<body>`); returns `{ destroy }` |
| `mountDevtools({ extraTabs })` | Adds lazy tabs shaped as `{ id, label, icon, load, props? }`; `load` resolves a Svelte view receiving `{ dt, ...props }`. Built-in tab ids take precedence. |
| `isolateFromAppLayers(host)` | Keeps app focus traps / outside-dismiss listeners from reacting to the panel; returns a release function (used by `mountDevtools`) |
| `reproducibleLink(runtime, { presentation?, href? })` | Current URL + `scenario`/`actor`/`seed` (+ `shell` and `layout` when overridden, + `devtools=0`), dropping stale params |
| `DevtoolsPanel` | The Svelte component, for custom hosts |
| `createTourController(def, { onClockAdvance?, resolveTarget? })` | Deterministic guided-tour session: step progression, dismiss, missing-target safety; clock moves only via the host hook (use `createScenarioClockHandler(runtime.scenarios.advance)`) |
| `TourPlayer` | Dismissible Svelte card + optional spotlight for a running controller (player or custom host) |
| `parseTourDefinition` / `clockRequestForAdvance` / `resolveTourTarget` | Pure tour helpers (no DOM mutation, no clock writes) |

| Tab | What it does |
| --- | --- |
| Scenario | Active scenario (seed, reference time, SDK + prototype generator versions), live load progress (indeterminate while generating/validating, determinate while writing rows), grouped picker, load with confirm + "snapshot first" + custom seed, reset, copy reproducible link |
| Personas | Acting principal (role, org, capabilities), quick switch (non-destructive), role override, organization switch. Each persona shows its avatar photo when `mountDevtools` gets an `avatarImage` resolver (`mountPrototype` passes the renderer's), else initials; a broken image falls back to initials |
| Time | UI time vs committed vs reference; preview ±1/7/30 days or at an instant; clear preview; advance 1/7 days with applied/skipped counts; reset clock |
| Data | Row counts per table, paginated read-only inspector, storage (world/sandbox, database name, backend, eviction protection, usage/quota, request persistence), sandboxes (discard the current one, or clear all others from the default world), reset scenario data |
| Env | Network online/slow/offline, latency, failure mode + rate + scope prefixes, subscription, feature flags, and the mock API request log (`@protoyard/http`: method · url · status chip · duration, expandable route/request/response previews, Clear) |
| Look | Theme swatches (built-in, prototype and custom), **Theme Studio** (lazy chunk: start from built-in or library themes; OKLCH harmony suggestions and neutral family; seed + secondary color, font pairing, radius, elevation, surface, motion, focus ring, density; scoped live preview in light/dark; live WCAG contrast warnings; save / save and preview; export JSON + download; import pasted JSON or a file, validated), light/dark/system, reduced motion, density slider (0.75–1.25, override only), viewport preset, **app layout** (manifest-supported layouts only, temporary override), **shell** (platform-first + More), **device** (core catalog), **orientation**, **device frame** on/off — shell/device/orientation always temporary overrides |
| Snaps | Save (name + notes), list, restore, download, delete; import a file with preview + warnings, then import or import & restore |
| Share | Reproducible, presentation and fresh-sandbox (`?sandbox=try`) links (includes `?shell=` and `?layout=` when overridden), CLI commands (`pnpm protoyard dev/build/export/publish --dry-run`) — the browser never deploys |

In a sandboxed world (`?sandbox=<name>`) the header shows a **Sandbox: name** badge.
Every effective value shows a source badge (`override` / `preference` /
`scenario` / `default`); the header's **Reset N** clears all overrides.
Destructive actions use inline two-step confirmation.

**Pending feedback.** Every control reacts in the frame it is clicked. The
clicked persona row, theme swatch, segmented option or button shows a spinner
and `aria-busy`. The header shows a progress strip (`[data-dt-working]`,
header `aria-busy`) while any panel action, runtime operation
(`runtime.pending`) or scenario load is in flight. The control's group
(persona list and role selectors, scenario picker and reset, theme swatches
and appearance segments, environment controls, advance buttons) is disabled
until the change settles, so nothing can be triggered twice. A failure shows
inline in its section (`role="alert"`) as well as in the footer status.
Internally, `dt.run('group:item', fn)`, `dt.isBusy('group')` and
`dt.errorFor('group')` drive this, in `state.svelte.ts`.

**Clicks reach their controls.** The panel mounts into a child of the
isolated `.py-devtools` host. Svelte delegates events to its mount point,
and the isolation listeners stop propagation, so on the same element they
would cut Svelte's walk short and drop clicks on a button's inner text or
icon.

Keyboard: **Ctrl/⌘ + .** toggles from anywhere; **Esc** closes and returns
focus to the launcher; tabs use arrow keys / Home / End. The open state and
tab are remembered per prototype in `localStorage` (`protoyard.<namespace>.devtools`,
guarded). On narrow screens the panel is a bottom sheet with 44px targets.

Integrations can pass `extraTabs` to `mountDevtools`. Each tab's `load` runs
only when selected, so optional panels remain outside the initial DevTools
module graph. Registered tabs participate in the same keyboard navigation and
remembered selection as built-in tabs.

Styling: the panel consumes Texuli's `--tx-*` tokens and mounts in its own
`.py-devtools` host outside `#app`; no global CSS is added. The renderer's
visible-right-edge layout value is copied to a DevTools-local CSS variable so
the launcher and panel keep their existing viewport positioning.

**Built on Texuli 0.5.0.** The panel uses `Button` from `texuli/button`,
`Input` and `Textarea` from `texuli/input`, `Select` from `texuli/select`,
`Checkbox`, `Radio` and `Switch` from `texuli/choice`, `Slider` from
`texuli/slider`, `Spinner` from `texuli/feedback`, `Card` from `texuli/card`,
`Badge` from `texuli/badge`, and `Alert` from `texuli/alert`. The `Glyph`
adapter sends Texuli's ten built-in names through `Icon` from `texuli/icons`
and other Lucide components through `LucideIcon` from
`texuli/icons/lucide`. `mountDevtools` calls
`enableTexuliAppearance()` (`@protoyard/themes/texuli`) to keep Texuli's
`--tx-*` tokens aligned with the active appearance
([docs/TEXULI.md](../../docs/TEXULI.md#themes-come-from-texulitokens)).

`Initials` is a presentation wrapper around Texuli's `Avatar`; it passes the
resolver's validated `src` and `srcset` and applies the panel's persona color.
Texuli 0.5.0 accepts responsive sources under the same URL trust policy.

## Working on top of app modals

App dialogs and sheets trap focus with a capture-phase `focusin`
listener on `document` and close on outside pointer/focus events. The panel
host is isolated from both (`isolateFromAppLayers`): `focusin` originating in
the panel is stopped at `window` (which runs before `document` capture), and
pointer/focus events are stopped from bubbling out of the host. So
**Ctrl/⌘ + .** opens the panel above an open app dialog, keyboard focus moves
into it, and clicking it doesn't dismiss the dialog. While a modal is open the
launcher docks to the right edge so it never covers dialog actions; it also
lifts above a fixed `BottomNav` (`data-py-bottom-nav`) or by
`--py-devtools-offset` on `:root`.

Caveat: focus traps from libraries that listen on `window` in the capture
phase would still win; Tab from the app dialog does not cycle
into the panel by design — use the shortcut.

## Package output

The repository keeps source exports for workspace development. `pnpm build:packages --filter svelte` creates the compiled ESM, declarations and Svelte components under `dist/` that the packed manifest exposes.
