# End-to-end tests

Playwright runs against real static builds. The gallery is served by `astro preview`, prototypes
by `protoyard preview` from `artifacts/<slug>/dist`, and the showcase by `protoyard showcase
--serve`. Each test runs in a fresh browser context, so IndexedDB and localStorage never leak
between tests. There are two projects: `chromium` (Desktop Chrome) and `mobile` (Pixel 7, touch).

```bash
pnpm test:e2e                                                        # gallery only
PROTOYARD_E2E_PROTOTYPES=crm-demo,mobile-banking-demo,ai-chat-demo pnpm test:e2e   # what CI runs
PROTOYARD_E2E_SHOWCASE=1 PROTOYARD_E2E_SHOWCASE_BASE=/protoyard/ pnpm test:e2e    # + the one-site showcase
PROTOYARD_E2E_REVIEW=1 pnpm test:e2e tests/e2e/review-index.spec.ts              # the team review index (port 4502)
```

Builds exclude DevTools, as shipped. Setup steps that the standalone build has no UI for
(switching persona, a theme override, snapshots, looking up an id) use the runtime handle the
renderer exposes (`window.__protoyard`). Assertions always go through the UI or the DOM
attributes the renderer sets (`data-py-ready`, `data-py-mode`, `data-py-theme`, `--py-primary`).

## Required flows (product spec) → specs

| # | Flow | Spec · test |
| --- | --- | --- |
| 1 | Open gallery → list prototypes → open target | `gallery.spec.ts` · *lists every prototype…*, *searches, filters and opens a detail page*; `showcase.spec.ts` · *opens a card, previews the bundled CRM…* |
| 2 | CRM create/edit/delete → refresh → persisted | `crm-demo.spec.ts` · *flow 2* |
| 3 | New-user scenario → onboarding/empty state | `crm-demo.spec.ts` · *flow 3* (`new-company`) |
| 4 | Established scenario → populated records | `crm-demo.spec.ts` · *flow 4* (`growing-team`) |
| 5 | Admin → viewer without reset → actions blocked, records unchanged | `crm-demo.spec.ts` · *flow 5*; `mobile-banking-demo.spec.ts` · *a view-only persona is blocked without wiping data* |
| 6 | Dark/light and theme preset → `data-py-mode` / `--py-primary` change, records persist | `crm-demo.spec.ts` · *flow 6* |
| 7 | Save snapshot → create record → restore → exact state | `crm-demo.spec.ts` · *flow 7* (table counts compared before/after) |
| 8 | Mobile demo transfer → balances/ledger updated → refresh persists | `mobile-banking-demo.spec.ts` · *a transfer moves money and survives a reload* (both projects, including Pixel 7) |
| 9 | Standalone CRM build → static server → works without a dev server | `crm-demo.spec.ts` · *flow 9* (no `@vite/client`), with every CRM flow running on that build |
| 10 | Another prototype's build contains no CRM data/code | `isolation.spec.ts` (scans each non-CRM `dist`; a positive control proves the patterns match the CRM build) |
| 11 | Back navigation and a direct refresh of a nested route (`#/deals/:id`) | `crm-demo.spec.ts` · *flow 11* |
| 12 | Error/slow/offline flow with visible feedback | `crm-demo.spec.ts` · *flow 12* (offline save → "You are offline" toast, nothing saved); `ai-chat-demo.spec.ts` (agent outage → "Reply failed." → Retry recovers) |

Also covered: `prototypes.spec.ts` (every target boots without errors and persists across
reloads), `gallery.spec.ts` (favorites, device frames, theme toggle, the create builder, no
horizontal overflow on phones) and `showcase.spec.ts` (live demo iframe write survives a reload,
scenario links, no 404s under a sub-path), and `devtools-panel.spec.ts` (with the showcase: the
DevTools panel closes by X, Escape and Ctrl/⌘ + ., and stays closed after a reload).

## Accessibility

`a11y.spec.ts` runs axe (`@axe-core/playwright`, tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`)
on the gallery home, a gallery detail page and each target's main screen. It runs in light and
dark mode on both projects. Serious and critical violations fail the test. Every result is
attached to the report as `axe-<screen>.json`. The helper is `support/a11y.ts`
(`expectAccessible(page, testInfo)`), so a domain spec can audit any screen, including one with an
open dialog.

## Shell layout matrix

`shell-layout.spec.ts` opens the static Lumen Bank build (`mobile-banking-demo`) once per shell
with `?shell=` (`phone`, `tablet`, `desktop-window`, `browser`, `widget-host`, `extension-popup`,
`side-panel`).

- **Desktop project, at 1440×900** (the panel shells need the 1280 px laptop device plus a
  gutter): the shell's frame is drawn, the screen fits in the window, the bottom nav and the Home
  quick action are inside the screen, every `position: fixed` element stays in the screen box, the
  document does not scroll, and axe passes. Reduced motion is emulated, so axe measures the settled
  page, not a panel mid-fade. The widget is opened through its launcher first.
- **Mobile project (Pixel 7)**: the window is narrower than any device, so `auto` and every
  explicit shell render full-bleed with no frame, and the actions stay inside the viewport.

```bash
PROTOYARD_E2E_PROTOTYPES=mobile-banking-demo pnpm test:e2e tests/e2e/shell-layout.spec.ts
```

## Pending feedback

`pending-feedback.spec.ts` checks that DevTools switches react at once and
show progress (timed in the page from `pointerdown` to the first frame with
the result), and that slow simulated operations show the Button spinner, the
global `[data-py-pending-bar]` and `aria-busy` on the app root, then clear.
The DevTools tests need a DevTools build, which
`PROTOYARD_E2E_DEVTOOLS_PROTOTYPES` adds next to the standard build (served
from port 4451; `devtoolsPrototypeUrl(slug)` in `targets.ts`):

```bash
PROTOYARD_E2E_PROTOTYPES=mobile-banking-demo,crm-demo,helpdesk-demo \
PROTOYARD_E2E_DEVTOOLS_PROTOTYPES=mobile-banking-demo \
pnpm test:e2e tests/e2e/pending-feedback.spec.ts
```

## Rich views kit

`views.spec.ts` runs on the ui-kit build (desktop and Pixel 7, a fresh context
per test) with real mouse moves and the keyboard, never synthetic drag events:

- **Board:** a mouse drag across columns on desktop (a reorder inside the one
  visible column on Pixel 7), then a keyboard move (Space, arrow, Space) with
  its live-region message.
- **Calendar:** a mouse drag moves a week-view event one hour later. A
  repeating event confirms with Save.
- **Timeline:** the end handle of a bar is dragged three days longer on
  desktop. On Pixel 7 the canvas is hidden on purpose, and the test asserts the
  task table instead.
- **Grid:** Enter edits a cell. The editor's box must be inside the viewport;
  `fill()` would scroll it into view and prove nothing. Then 100,000 rows
  scroll to `Record 100000` with at most 80 DOM rows. On Pixel 7 it checks the
  capped card list.
- **Map:** pan by drag, zoom by button and wheel, and 5,000 places painted
  under 100 ms (measured in the page). A cluster opens, and the virtualized
  place list reaches the last of 5,000 places with End.
- **Axe:** every view demo in light and dark.

```bash
PROTOYARD_E2E_PROTOTYPES=ui-kit pnpm test:e2e tests/e2e/views.spec.ts
```

## Known gaps

- `views.spec.ts`: the timeline cannot be rescheduled below `md` (its canvas is hidden; only
  the task table shows), and the grid cannot be edited there (its card list is read-only in
  the ui-kit demo). Both are asserted as layouts, not as missing tests.
- `ai-chat-demo`'s outage flow runs on desktop only, because its Home pane is hidden at `#/` on
  phones.
- E2E found and got fixed: crm-demo had no phone navigation (`f52cd89`; now asserted by *section
  navigation and the role label are reachable on phones*), and Lumen Bank's account screen ignored
  a changed `:id` because `liveQuery` lacked `deps` (`00b7a30`; now covered by the balance test).

## Adding a spec

Use one file per prototype (`<slug>.spec.ts`). Skip unless the slug is in
`PROTOYARD_E2E_PROTOTYPES`, open `prototypeUrl(slug)` with `?scenario=<id>`, and wait for
`html[data-protoyard-ready="1"]` (and the older `data-py-ready="true"`). Use `waitForPrototypeReady(page, { slug })` from `tests/e2e/support/ready.ts` instead of ad-hoc selector polls. Viewport layout is guarded by `tests/e2e/viewport-fit.spec.ts` (desktop 1280×800 + Pixel 7) and, for every target, by `tests/e2e/layout-fit.spec.ts` (1920×1080 + 390×844: no document scroll for full-viewport apps, primary inputs on screen, the main region scrolls). Add a new target to its `FIT_TARGETS` with its densest scenario and its layout (`viewport` or `document`); mark a chat composer with `data-py-composer`. Never put `data-py-scroll-root` on app markup: it is the renderer's own wrapper, and its layout rules flatten any element that carries it. See the `write-e2e` skill for the full pattern.
