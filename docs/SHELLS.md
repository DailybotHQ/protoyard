# Shells

A shell presents a prototype as the product it simulates: a phone, a tablet, a desktop
window, a website in a browser, a chat widget on a customer's site, a browser-extension
popup or a plugin panel inside another app. The app itself does not change. The renderer
draws the frame around it, in the same document (ADR-016 in [DECISIONS.md](DECISIONS.md)).

**Frames simulate a device; they do not emulate one.** The user agent, touch input,
pixel density and the browser window stay those of the real browser. Every frame is
brand-neutral: generic form factors and window styles, with no real device, operating
system, browser or product marks.

## The shells

| Shell | What it draws | Controls that work | Default device |
| --- | --- | --- | --- |
| `none` | Nothing: the app is full-bleed | — | — |
| `phone` | A bezel with side buttons, a pill or punch-hole cutout, a status bar (the simulated clock, plus an offline glyph or a degraded-signal glyph for a slow network or ≥ 1 s latency) and a home indicator | Home indicator goes to `#/`; rotate button | `phone-pill` (`phone-punch-hole` when the viewport preset is `android`) |
| `tablet` | A tablet bezel with a status bar | Rotate button | `tablet` |
| `desktop-window` | The app in a mac-like or windows-like window (`@protoyard/ui` WindowChrome) on a theme-colored wallpaper, with a dock or taskbar. The title bar shows `document.title`. | Minimize to the dock, restore or reopen from the dock, maximize to fill the stage, close and reopen. The app stays mounted while the window is minimized or closed. | `laptop-window` |
| `browser` | A tab and an address bar (`@protoyard/ui` BrowserChrome) showing `preview.chrome.origin`, by default `https://<slug>.example`, with `document.title` as the tab label | Back, forward and reload follow the hash router; the address bar navigates inside the app only | `laptop-window` |
| `widget-host` | A fictional customer website (`preview.chrome.hostName`, by default "Northwind Outfitters (fictional)") with a chat launcher that opens the prototype in an anchored panel | Launcher opens and closes, Escape closes, unread badge. Fullscreen under 480 px. | `laptop-window` |
| `extension-popup` | A browser toolbar with an extensions menu and the prototype's icon; the app opens in a 360×600 popup under it | Open and close from the icon, outside click or Escape; pin it open | `laptop-window` |
| `side-panel` | A mock host app (`preview.chrome.hostVariant`: `chat-workspace` by default, `design-canvas` or `code-editor`) with the prototype in a right-hand plugin panel | Resize with the splitter (arrow keys, Home, End; Enter or Space collapses); the width is saved in `localStorage` | `laptop-window` |

`auto` (the default) resolves to `phone` for `platform: "mobile"` prototypes and to `none`
for everything else.

## Choosing a shell

In `protoyard.json`, every field is optional:

```json
"preview": {
  "viewport": "desktop",
  "shell": "widget-host",
  "device": "laptop-window",
  "orientation": "portrait",
  "chrome": { "hostName": "Northwind Outfitters (fictional)" }
}
```

| Field | Values |
| --- | --- |
| `shell` | `auto`, `none`, `phone`, `tablet`, `desktop-window`, `browser`, `widget-host`, `extension-popup`, `side-panel` |
| `device` | A catalog id from `@protoyard/core` `DEVICES` (below). A device that does not fit the shell falls back to the shell's default. |
| `orientation` | `portrait` or `landscape` (phones and tablets; windows keep their own) |
| `chrome.os` | `mac` or `windows` for `desktop-window` (absent: the visitor's OS decides) |
| `chrome.origin` | Address for `browser`. Only fictional origins validate: `https://<name>.example` or `https://example.com` and its subdomains. |
| `chrome.hostName` | Brand of the `widget-host` page |
| `chrome.hostVariant` | `chat-workspace`, `design-canvas` or `code-editor` for `side-panel` |

The effective shell resolves like the other appearance values: a temporary override,
then the loaded scenario (its `shell`, `device` and `orientation`), then the manifest.
DevTools shows the source of each value.

- **Links:** `?shell=<shell>` sets the shell as a visible, clearable override, for example
  `http://localhost:5173/?shell=browser`. DevTools → Share includes `?shell=` when one is
  set. Device and orientation are not link parameters.
- **DevTools → Appearance:** the **Shell** section has a "Device frame" on/off toggle, the
  shell picker (with "More shells") and its source badge. The **Device** section picks a
  catalog device that fits the shell and its orientation. These are always temporary
  overrides and never write domain data.

Templates that start in a shell: `chat-widget` (`widget-host`), `plugin-panel`
(`side-panel`), `desktop-app` (`desktop-window`), and `crud-app`, `ai-assistant` and
`team-chat` (`browser`). `mobile-app` prototypes get `phone` through `auto`.

## When the app goes full-bleed

The renderer shows the bare app, with no frame, when:

- the effective shell is `none`;
- the prototype runs inside an iframe (the gallery preview draws its own device frame);
- the window is too narrow. Phones and tablets need the device width plus the frame and a
  gutter, so a real phone is always full-bleed. `desktop-window` and `browser` need 768 px
  and scale down on smaller desktops;
- the prototype's stylesheet does not import `@protoyard/renderer-svelte/app.css`, which
  holds the shell layout rules. The console then explains what to add. Every prototype's
  `src/app.css` should start with that import.

The device box scales down to fit the window on both axes. It never scales up.

## Laying out an app inside a shell

Media queries and `dvh` still follow the real window, not the device (ADR-016). Inside a
frame:

- **Height:** use `h-app`, `min-h-app` and `max-h-app` (`--py-app-height`). The shell sets
  it to the device screen, the area under a window's title bar or browser toolbar, or the
  panel height. `MobileAppShell` and the other `@protoyard/ui` layouts already use it.
- **Safe areas:** `pt-safe`, `pb-safe`, `pl-safe`, `pr-safe` and `px-safe` combine the real
  `env(safe-area-inset-*)` with the frame's simulated insets (`--py-safe-*`), so content
  clears the status bar and home indicator. `--py-safe-top` is never shorter than the
  status bar the frame paints, in landscape too.
- **Landscape phones:** the screen is letterboxed between the side insets (the cutout
  side), as a mobile browser does for a page without `viewport-fit=cover`. The app, its
  fixed elements and its overlays fill the width between them, so `--py-safe-left` and
  `--py-safe-right` are `0`; the gutters show the app's background color.
- **Width caps:** a mobile app that caps its width for wide windows (`max-w-md`) should
  lift the cap inside a phone or tablet frame with the renderer's `device-frame:` variant
  (`max-w-md device-frame:max-w-none`), or the app stays a narrow column on a landscape
  phone or a tablet.
- **Rounded glass:** the screen and the frame's status bar and home indicator are clipped
  to the device's corner radius.
- **Breakpoints:** the device screen is a size container, so container-query variants
  (`@md:`, `@max-2xl:` and so on) follow the device width.
- **Fixed elements:** `position: fixed` (a bottom nav, toasts, the demo badge) is pinned to
  the device screen. The app scrolls inside the renderer's scroll root, not the page.
- **Overlays:** Bits UI dialogs and sheets portal into the device screen, so they stay
  inside the frame.
- **Widget badge:** in `widget-host`, call `getWidgetHost().setUnread(n)` (exported by
  `@protoyard/renderer-svelte`) to drive the launcher's unread badge.

## Device catalog

`DEVICES` in `@protoyard/core` is the one source of device sizes for the frames, DevTools
and the gallery preview. Sizes are CSS pixels, portrait first for rotatable devices.

| Id | Label | Size | Rotates |
| --- | --- | --- | --- |
| `phone-pill` | Phone (pill cutout) | 393 × 852 | yes |
| `phone-punch-hole` | Phone (punch-hole) | 412 × 915 | yes |
| `tablet` | Tablet | 820 × 1180 | yes |
| `laptop-window` | Laptop window | 1280 × 800 | no |
| `desktop-window` | Desktop window | 1440 × 900 | no |

## Performance

`ShellHost` is in every prototype's initial bundle, and each frame is a separate lazy
chunk, loaded only when a prototype is shown in that shell. Inside a frame, import ui
components statically: a dynamic import of `@protoyard/ui` would pull them into every
prototype's initial JS, and a test blocks it. Measured sizes are in
[PERFORMANCE.md → Shells](PERFORMANCE.md#shells).

## Adding a frame

Register it in `packages/renderer-svelte/src/shell/frames/registry.ts`:

```ts
'my-shell': {
  load: () => import('./MyShellFrame.svelte'),
  margin: 24,              // space the decoration needs outside the device box (fit scaling)
  screenInset: { top: 40 }, // chrome inside the device box; the app's screen starts below it
  minWindowWidth: 768,      // narrowest window that still shows the frame
},
```

A frame is a sibling overlay of the app's screen, not a wrapper, so switching shells never
remounts the app. It receives `FrameProps`: `spec` (the device in its orientation), `shell`,
`chrome`, and, for window-like frames, `app`, `maximized`, `setMaximized()` and
`setScreenHidden()`. Give the overlay `pointer-events: none`, except on controls that really
work. **Never paint over the screen:** reserve chrome space with `screenInset` and keep the
overlay out of it (the browser frame is exactly toolbar-tall), and draw bezels with a border
ring, not a background fill. The shell E2E matrix checks that the app is actually painted,
not just laid out. Shells that position the screen themselves (panel shells such as `widget-host`) must
also be added to `PANEL_SHELLS` in `ShellHost.svelte`.

## Tests

```bash
pnpm vitest run packages/renderer-svelte                     # ShellHost and every frame
pnpm vitest run packages/renderer-svelte/tests/frames.test.ts -t "desktop window"
PROTOYARD_E2E_PROTOTYPES=mobile-banking-demo pnpm test:e2e tests/e2e/shell-layout.spec.ts
PROTOYARD_E2E_PROTOTYPES=support-widget-demo pnpm test:e2e tests/e2e/support-widget-demo.spec.ts
```

The E2E specs need `pnpm test:e2e:install` once, and one E2E session per machine (fixed
ports, see [TESTING_GUIDE.md](TESTING_GUIDE.md)).
