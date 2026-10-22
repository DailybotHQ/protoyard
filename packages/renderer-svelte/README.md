# @protoyard/renderer-svelte

Mounts a Protoyard prototype (Svelte 5 + Vite): Vite config factory, boot
sequence, reactive runtime bindings, Dexie live queries, a hash router and
consistent service feedback.

## Vite

```ts
// vite.config.ts
import { defineProtoyardConfig } from '@protoyard/renderer-svelte/vite';
export default defineProtoyardConfig({ root: import.meta.dirname });
```

Reads `<root>/protoyard.json`, adds the Svelte + Tailwind plugins and injects
the no-flash appearance script. The CLI drives it through env vars:

| Env | Effect | Default |
| --- | --- | --- |
| `PROTOYARD_BASE` | Vite `base` | manifest `build.base` (`./`, relocatable) |
| `PROTOYARD_OUT_DIR` | `build.outDir` (`emptyOutDir: true`) | `<root>/dist` |
| `PROTOYARD_INCLUDE_DEVTOOLS` | `__PROTOYARD_DEVTOOLS__` in builds (`1/0`) | manifest `build.includeDevtools`; always on in dev |
| `PROTOYARD_DEMO_BADGE` | `__PROTOYARD_DEMO_BADGE__` in builds | manifest `build.demoBadge`; off in dev |
| `PROTOYARD_REVIEW` | `__PROTOYARD_REVIEW__` and `build-manifest.json.review.enabled` (`1/0`) | manifest `build.review.enabled` (false) |
| `PROTOYARD_REVIEW_ADAPTER` (+ `PROTOYARD_REVIEW_ENDPOINT`) | `__PROTOYARD_REVIEW_ADAPTER__`: the comments backend for this build (`local`, `http`, `cloudflare`, `artifact`), checked by the manifest's `build.review` schema; the review E2E points a build at a local comments server | manifest `build.review.adapter` / `endpoint` |
| `PROTOYARD_PORT` | dev/preview port (`strictPort: false`) | Vite default |
| `PROTOYARD_BUILT_AT` | `__PROTOYARD_BUILD__.builtAt` | build time |
| `PROTOYARD_OFFLINE` | ship the `@protoyard/offline` service worker (`1/0`; builds only) | manifest `build.offline` (false) |
| `PROTOYARD_AVATARS` | ship the avatar images (`1/0`) | the `avatars` option (true) |
| `PROTOYARD_AVATAR_BASE` | serve avatars from this shared folder and emit none (the showcase sets `<base>avatars/`) | `<base>avatars/` with a copy in the build |
| `PROTOYARD_AVATAR_SIZES` | ship only these sizes (`64`, `128`; the artifact target sets `128`) | `64,128` |

The dev server's `/@fs` access (`server.fs.allow`) is limited to the prototype folder, the
workspace `packages/` and `node_modules` (`devFsAllow(root)`), so `protoyard dev --host` never
exposes other prototypes or workspace files to the LAN; Vite's default `fs.deny` still applies.

The config module only imports erasable TypeScript (`@protoyard/core/manifest`,
`@protoyard/themes/no-flash`), so plain `vite` loads it under Node type
stripping. With DevTools disabled the panel is tree-shaken out of the bundle.
Review UI is loaded only for `build.review.enabled` / `PROTOYARD_REVIEW=1`, or
from an enabled DevTools build when `?comments=1` is present. `build-manifest.json`
records the effective `{ enabled, adapter }`; it never records the endpoint.
When DevTools is present, review mounts first, and DevTools shows its
"Comments" tab (`mountReview({ devtools: true }).devtoolsTab` passed as
`mountDevtools({ extraTabs })`). The floating review toolbar is placed by
`placeFloating` (`src/shell/floating.ts`), which uses the demo badge's rules:
no app control, never on the badge. The badge re-places itself on
`protoyard:floating`.
`mountPrototype` also keeps `--py-fixed-right-edge` on `<html>` current
(`trackFixedRightEdge`). It is the number of layout-viewport pixels hidden past
the visible right edge, which is `0px` unless phone emulation or pinch zoom makes
the visual viewport narrower. Fixed chrome adds it to its `right` offset: the
unplaced review toolbar, the DevTools launcher and the `Toaster` do.

`mountPrototype` also accepts `devtoolsTabs?: readonly DevtoolsTab[]` for
prototype-owned panels such as Deck Studio. These lazy tabs are combined with
the optional review tab and passed to `mountDevtools`; with no contributed or
review tabs, the existing app DevTools setup is unchanged. The tab's `load`
function runs only after the visitor selects it, keeping optional UI out of
the initial app bundle.
Globals are typed in `@protoyard/renderer-svelte/env`.

## In-app scenario switcher

For demos that should change world or persona without opening DevTools, use
`ScenarioSwitcher` from `@protoyard/ui` with the glue in this package:

```svelte
<script lang="ts">
  import { scenarioSwitcherProps, usePrincipal, useScenario } from '@protoyard/renderer-svelte';
  import { ScenarioSwitcher } from '@protoyard/ui';
  import { getRuntime } from '@protoyard/renderer-svelte';

  const runtime = getRuntime();
  // Re-read when scenario or principal changes:
  const scenario = useScenario(runtime);
  const principal = usePrincipal(runtime);
  const props = $derived.by(() => {
    void scenario.active;
    void principal.current;
    return scenarioSwitcherProps(runtime);
  });
</script>

<ScenarioSwitcher {...props} />
```

`createScenarioSwitcherActions(runtime)` exposes `loadScenario` and `viewAs`
(`session.switchActor`). Loads default to a safety snapshot first. The control
is always labelled **Simulated** — not multiplayer or authentication.

## Avatars

Every build ships the `@protoyard/avatars` library (175 fictional people,
64 and 128 px WebP, 350 files, 513,196 B) under `avatars/<size>/<id>.webp`.
The names are fixed (no content hash), so rebuilds never churn, and the images
are plain files: 0 KB of JavaScript, fetched only when an `<img>` asks. The dev
server serves the same paths. Turn it off with
`defineProtoyardConfig({ root, avatars: false })` (or `PROTOYARD_AVATARS=0`);
avatar ids then resolve to `undefined`, so the UI shows initials.

Show a persona's face with `@protoyard/ui`'s `Avatar` (initials when there is
no usable image or it fails to load):

```svelte
<script lang="ts">
  import { avatarImage } from '@protoyard/renderer-svelte';
  import { Avatar } from '@protoyard/ui';
  let { persona } = $props();
</script>

<Avatar name={persona.name} {...avatarImage(persona.avatar)} decorative />
```

Or build the `<img>` yourself:

```svelte
<script lang="ts">
  import { avatarSrcset, avatarUrl } from '@protoyard/renderer-svelte';
  let { person } = $props();
</script>

{#if avatarUrl(person.avatar, 64)}
  <img src={avatarUrl(person.avatar, 64)} srcset={avatarSrcset(person.avatar)}
       width="32" height="32" loading="lazy" alt="" />
{/if}
```

- `avatarUrl(avatar, size = 128)`: `av-NNN` → `<avatar base><size>/<id>.webp`
  (`./avatars/` for the relocatable base, `<base>avatars/` for an absolute
  one, the shared `PROTOYARD_AVATAR_BASE` in the showcase); an `https://` or
  root-relative `/…` URL passes through unchanged; anything else (unknown id,
  `data:`, `javascript:`, `//host`, relative paths) gives `undefined`. A size
  the build does not ship resolves to the next shipped one.
- `avatarSrcset(avatar)`: `<64> 1x, <128> 2x` for an id; `undefined` for URL
  avatars and single-size builds (artifact packs ship 128 px only).
- `avatarImage(avatar)`: `{ src, srcset }` for `Avatar` (64 px, 128 px at
  2x). It re-checks the value with `isPersonaAvatar` from `@protoyard/core`
  first (snapshot imports do not re-validate personas) and returns `{}` for
  anything missing, unsafe or unknown. Only screens that import it pay for
  it; `mountPrototype` hands it to DevTools inside the lazy DevTools chunk.
- `isAvatarId`, `isAvatarUrl`, `AVATAR_BASE`. The id rules mirror
  `@protoyard/avatars` (a test keeps them equal), so the renderer has no
  dependency on it and never bundles its manifest.
- `@protoyard/renderer-svelte/avatars-plugin` exposes the Vite plugin and
  `listAvatarFiles` (the CLI's showcase copies the library with it).

## CSS

```css
/* src/app.css */
@import '@protoyard/renderer-svelte/app.css';
@source './';
```

**Viewport presets** (`tablet`, `iphone`, `android`, from the manifest's
`preview.viewport`, a scenario or a DevTools override) set
`<html data-py-viewport>`. `#app` then becomes a narrow, viewport-tall column that never
scrolls, and is the containing block for `position: fixed` descendants, so a bottom
nav, toasts and the demo badge stay pinned inside the visible column. The app scrolls
inside `[data-py-scroll-root]`, the wrapper the renderer puts around `<App />`, and the
router resets it to the top on navigation. With the desktop preset that wrapper is
`display: contents` and the document scrolls as usual. Media queries still follow the
real window.

**Shells** (ADR-016; the user guide is [docs/SHELLS.md](../../docs/SHELLS.md)). `ShellHost` wraps the app, toasts and the demo badge, and reads
the runtime's effective `shell`, `device` and `orientation`
(`runtime.theme.appearance()`). When a frame is shown it sets `<html data-py-shell>`.
The page then becomes a stage that centers a device box scaled to fit the window on
both axes (never upscaled). The device screen has the catalog size, is the containing
block for fixed descendants, is a size container (container queries see the device
width), and sets `--py-app-height` and `--py-safe-*` from `@protoyard/core` `DEVICES`.
Viewport-preset rules step aside while a frame is shown.

The frame decoration is a lazily loaded chunk registered in
`src/shell/frames/registry.ts`.

- **`phone`** uses `PhoneFrame`: a bezel, side buttons, a pill or punch-hole cutout, a
  simulated clock and network status bar in `--py-safe-top`, and a home indicator that
  navigates to `#/`.
- **`widget-host`** draws a fictional customer site (`HostSite`, with the brand from
  `preview.chrome.hostName`) and a launcher that opens the prototype in an anchored panel
  (`--py-app-height` = panel height; fullscreen under 480px). Apps drive the unread badge
  through `getWidgetHost().setUnread(n)` or `window.__protoyardWidget`.
- **`browser`** draws `@protoyard/ui` `BrowserChrome` (a tab and an address bar, 88 px,
  reserved through `screenInset`) using `preview.chrome.origin` (default
  `https://<slug>.example`), with `document.title` as the tab label. Back and forward
  follow the hash router.
- **`desktop-window`** draws the app in `@protoyard/ui` WindowChrome on a theme-token
  wallpaper, with a dock (mac-like) or a taskbar (windows-like). `preview.chrome.os` picks
  the style; without it the visitor's OS decides. The title bar follows `document.title`,
  and every control works: minimize to the dock, restore or reopen from the dock, maximize
  to fill the stage, close and reopen. The app stays mounted while the window is minimized
  or closed.
- **`side-panel`** embeds the prototype in a resizable right-hand plugin panel beside a
  mock host app (`preview.chrome.hostVariant`: `chat-workspace`, `design-canvas` or
  `code-editor`). The panel width persists in `localStorage`.
- **`extension-popup`** reuses `BrowserChrome` for a fictional browser toolbar and shows
  the app in a 360×600 popup (`--py-app-height: 600px`) anchored under the extension
  icon. It opens for review, closes on an outside click or Escape, and can be pinned open.
- **`tablet`** uses a brand-neutral tablet frame with a working orientation control.
  Phone and tablet orientation overrides update the device dimensions and the safe-area
  tokens. Shells without a registered frame render full-bleed.

A registry entry can reserve `screenInset` space inside the device box for its own chrome
(the desktop window's 40 px title bar, the browser's 88 px toolbar), and can set
`minWindowWidth`. Window-like shells (desktop window, browser) use 768 px and scale down on smaller desktops, while phones need the device plus its frame. While
framed, Bits UI dialogs and sheets portal into the device screen
(`setOverlayPortalTarget`), so overlays stay inside the frame. The app goes full-bleed
when the shell is `none`, inside an iframe (the gallery preview draws its own device), or
when the window is too narrow for the device plus its frame (a real phone). The wrappers
always exist, so
changing the shell never remounts the app; without a frame they are
`display: contents`.

## Mount

```ts
import { mountPrototype } from '@protoyard/renderer-svelte';
void mountPrototype({ definition, App, target: document.getElementById('app')! });
```

Boot: `parseScenarioLink(location.search)` → `createPrototypeRuntime(definition,
{ themes: BUILTIN_THEMES + definition.themes, link })` → `scenarios.ensureSeeded()`
→ appearance applied to `<html>` and kept in sync (+ cached for no-flash; live
radius, elevation, font and motion presets merge in from a lazy chunk) →
App mounted with the runtime in context → DevTools (dynamic import) unless
`?devtools=0`. Also renders the storage-degraded banner, a "Load linked
scenario" prompt when a link disagrees with stored data (never automatic),
the global pending indicator (see [Pending feedback](#pending-feedback)), the optional "Prototype · simulated data" badge, and a recovery screen
(reload / reset only this prototype's databases) when boot fails.
In offline-enabled builds a waiting new version shows an "Update available · Reload" toast
(`protoyard:offline-update`); nothing reloads on its own.
`<html data-py-ready="true|error">` and `window.__protoyard` help E2E tests,
thumbnails and benchmarks. `window.__protoyard` is exposed in production builds on purpose: it
grants nothing same-origin code couldn't already do (IndexedDB is readable and writable by any
script on the origin) and the simulation is not a security boundary.

### Build options at mount time

A prebuilt app that runs many prototypes (the player, ADR-029) can't rebuild
for each one, so `mountPrototype` takes an optional `build` object. Each field
takes precedence over its Vite define, and an omitted field keeps the build's
value:

```ts
void mountPrototype({
  definition,
  App,
  target,
  build: { namespace: 'bp-abc123', frameWhenEmbedded: false, demoBadge: true, devtools: true, review: false },
});
```

| Field | Overrides | Notes |
| --- | --- | --- |
| `namespace` | `__PROTOYARD_BUILD__.namespace` and the manifest's `storage.namespace` | Checked with the manifest's `NamespaceSchema`. An invalid value shows the recovery screen before any storage opens. |
| `frameWhenEmbedded` | `__PROTOYARD_BUILD__.frameWhenEmbedded` and the manifest flag | Applies in both directions. |
| `demoBadge` | `__PROTOYARD_DEMO_BADGE__` and the top-level `demoBadge` option | |
| `devtools` | the top-level `devtools` option, `?devtools=0` and `__PROTOYARD_DEVTOOLS__` (when on) | Can only narrow the build. |
| `review` | `__PROTOYARD_REVIEW__` (when on) and the manifest's `build.review.enabled` | Can only narrow the build. |

`devtools` and `review` can't add what the bundle doesn't contain. A build
whose define is `false` keeps the define inline, so the minifier still drops the
DevTools and review chunks, and `true` has no effect there. To choose per
prototype, build with them on and pass `false` where they should be off. With
no `build` option, every prototype behaves exactly as before.

## Bindings (`.svelte.ts`)

| API | Returns |
| --- | --- |
| `getRuntime<TDb>()` | the runtime (context, or the mounted one outside components) |
| `liveQuery(fn, { initial?, deps? })` | `{ current, loading, error }`; re-runs on table changes and when its inputs change. **List every reactive input in `deps: () => [...]`** (route params, filters, persona). As a safety net, reads made before the querier's first `await` are tracked automatically (one extra query per subscription); inputs read only after an `await` need `deps` |
| `usePrincipal()` / `useAppearance()` / `useEnvironment()` / `useOverrides()` | `{ current }` |
| `useScenario()` | `{ active, list }` |
| `useClock()` | `{ now, committed, reference, previewing, state }` |
| `can(capability, resource?)` | reactive boolean (services must still `assert`) |
| `usePending()` | `{ active, count, operations, label }` for `runtime.pending` (operations in flight) |

`describeLoadProgress(progress)` turns a core `LoadProgress` into
`{ label, fraction }` ("Writing 6,000 of 15,000 rows…", `0.4`; `fraction: null`
while generating/validating) for custom loading UIs.

## Pending feedback

Every prototype gets loading feedback with no code of its own. The runtime
counts operations in flight in `runtime.pending` (`@protoyard/core`
`PendingTracker`). Each entry has a `kind` (`service`, `scenario`, `time`,
`snapshot`, `session`) and a `label`. It is fed by every
`environment.run` (simulated latency included), scenario load and reset,
time advance, snapshot restore and import, and persona, sign-in, sign-out and
organization switches. The root that `mountPrototype` renders turns it into:

- **`aria-busy`** on the app's scroll root (`[data-py-scroll-root]`) while
  anything is pending.
- **A 3 px top bar** (`[data-py-pending-bar]`, `role="progressbar"`) that
  appears only once work has run for **150 ms**, so instant operations never
  flicker. It is determinate while a scenario writes rows. It sits at the top
  of the app screen, inside every shell frame (under a phone's status bar via
  `--py-safe-top`), is `position: fixed` and pointer-transparent, so it never
  shifts layout, and holds still under reduced motion (OS setting or the
  prototype's toggle).
- **A polite announcement** after **1 s** (`aria-live="polite"`):
  "Working…" for service calls, or the operation's own label ("Switching
  persona…", "Writing 6,000 of 15,000 rows…").

`runService()` also counts its call in the mounted runtime's signal (opt out
with `{ trackPending: false }`), and it returns a promise. So
`<Button onclick={() => runService(…)}>` from `@protoyard/ui` shows its own
spinner until the call settles, while errors still become toasts. For local
"saving…" text, read `usePending()`:

```svelte
<script lang="ts">
  import { usePending } from '@protoyard/renderer-svelte';
  const pending = usePending();
</script>
{#if pending.active}<span class="text-xs text-muted-foreground">Saving…</span>{/if}
```

## Router

For screen maps that tools need to inspect, keep the route table in a
data-only `src/routes.ts` module. `defineRoutes()` checks the lazy component
loaders while preserving names, descriptions and optional capability metadata;
the screen modules are imported only when their routes are visited.

```ts
// src/routes.ts
import { defineRoutes } from '@protoyard/renderer-svelte';

export const routes = defineRoutes([
  {
    path: '/reports',
    name: 'Reports',
    description: 'Review business reports.',
    capability: 'reports:read',
    load: () => import('./screens/Reports.svelte'),
  },
]);
```

```ts
const router = createRouter([
  { path: '/', component: Home, title: 'Home' },
  { path: '/deals/:id', component: Deal },
  // Own chunk — keeps multi-screen apps under the initial-JS budget:
  { path: '/reports', title: 'Reports', load: () => import('./screens/Reports.svelte') },
]);
```

Pass the exported table directly to `createRouter(routes, options)`; existing
inline route definitions remain supported. A route's `name` supplies its
document title when `title` is not set.

`<Router {router} />` renders the match with `params`/`query`. Eager `component`
routes mount immediately. Lazy `load` routes show `@protoyard/ui` `LoadingState`
while the chunk downloads, then the screen; a failed download shows `ErrorState`
with **Try again** (`invalidate` + re-`load`). Resolved modules are cached per
route. `document.title` updates from the route's `title` as soon as the hash
matches (before the chunk settles). After each successful mount the outlet
receives focus (`data-py-router-outlet`, `tabindex="-1"`) so keyboard users land
on the new screen.

`<Link href="/deals/1" {router} activeClass="…">`, `navigate('/x', { replace })`,
`back(fallback)`. Hash routing works on refresh/back/forward on any static host.

### Route guards

A route's `guard(match)` runs before its screen renders. It returns `true` to
let the screen through or a path to redirect to. The redirect replaces the
history entry, so Back never lands on the blocked screen, and the protected
screen never mounts, not even for a frame.

```ts
const router = createRouter(
  [
    { path: '/settings', component: Settings,
      guard: (m) => runtime.session.isSignedIn() || redirectWithNext('/sign-in', m) },
    // Guest-only: once signed in, continue to where the person was going.
    { path: '/sign-in', component: SignIn,
      guard: (m) => !runtime.session.isSignedIn() || nextPath(m.query) },
  ],
  { revalidateOn: (refresh) => runtime.session.subscribe(refresh) },
);
```

- Guards run on the first location, on every hash change, and whenever
  `revalidateOn` calls `refresh` (sign-in, sign-out, persona switch). You can
  also call `router.refresh()` yourself. A refresh that doesn't change the
  outcome does nothing.
- `redirectWithNext(target, match)` appends `next=<path?query>`.
  `nextPath(query, fallback)` reads it back and accepts only in-app paths
  (`/…`, not `//host`, backslashes or whitespace).
- `router.current.redirectedFrom` holds the originally requested path.
- More than `MAX_REDIRECTS` (5) hops counts as a loop. The router renders the
  not-found screen with the message in `current.error` ("This page keeps
  redirecting"), and the title becomes "Redirect loop".
- Guards are synchronous. Gating on the simulated session is UX, not
  security (ADR-008, ADR-018).

### Overlay routes

A route with `overlay: true` opens over the last full-screen route instead of
replacing it. It shows as a bottom sheet on phones and narrow hosts, and as a
dialog (or side panel) on wider hosts, through `@protoyard/ui`
`AdaptiveOverlay`. The screen underneath stays mounted, so its state and
scroll survive. The address still changes, so Back, Forward, refresh and
shared links behave like any route.

```ts
createRouter([
  { path: '/deals', component: Deals },
  { path: '/deals/:id', component: Deal },
  { path: '/deals/:id/edit', load: () => import('./screens/EditDeal.svelte'), title: 'Edit deal',
    overlay: true },
  { path: '/deals/:id/share', component: Share, title: 'Share',
    overlay: { desktop: 'side-panel', size: 'lg', base: '/deals/:id' } },
]);
```

- **Opening:** navigating to an overlay route keeps `router.background` (the
  screen underneath) and sets `router.overlay`. `router.current` is the
  overlay's match, and `isActive` stays true for the screen underneath, so
  navigation keeps its highlight. Neither opening nor closing scrolls the
  screen underneath.
- **Closing:** Escape, the close button, the backdrop, or the `close` prop
  every overlay screen receives all call `router.closeOverlay()`. If the
  overlay was opened from the screen underneath, that is Back. If it was a
  deep link, or after moving between overlays, it replaces the address with
  the screen underneath, so history never gains a stray entry. Focus returns
  to the link or button that opened the overlay, or to the screen.
- **Deep links:** a deep link to an overlay renders, underneath it, its
  `base` (with `:params` filled from the overlay), else the nearest ancestor
  path that matches a full-screen route (`/deals/42/edit` → `/deals/42`),
  else `/`.
- **Options:** `desktop` (`dialog` by default, or `side-panel`) and `size`
  apply to wide hosts. Narrow hosts always get the sheet. Guards apply as
  usual: a guard that redirects to a full-screen route replaces the overlay
  with that screen.
- **Size:** the overlay outlet (`OverlayOutlet.svelte`, with the
  `AdaptiveOverlay` code) is a lazy chunk, loaded when an overlay route first
  opens. Measured on `crm-demo` (which declares no overlay routes) on
  2026-10-21: initial JS 176.33 → 176.88 KB gzip, for the router's overlay
  state and the lazy-load hook.

## Services

```ts
const result = await runService(() => services.create(input), { success: 'Created' });
if (!result.ok && isValidationError(result.error)) errors = result.error.issues;
```

`PermissionDeniedError` and `SimulatedServiceError` become toasts; errors with
an `issues` object are returned for inline display. The call counts as pending
(global bar), and a `Button` whose `onclick` returns it shows `loading`
([Pending feedback](#pending-feedback)). Services throw them with
`parseInput(schema, input)` / `ValidationError` from `@protoyard/core`.

## Package output

The repository keeps source exports for workspace development. `pnpm build:packages --filter svelte` creates the compiled ESM, declarations and Svelte components under `dist/` that the packed manifest exposes.
