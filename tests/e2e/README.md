# End-to-end tests

Playwright runs against real static builds. The gallery is served by `astro preview`, prototypes
by `protoyard preview` from `artifacts/<slug>/dist`, and the showcase by `protoyard showcase
--serve`. Each test runs in a fresh browser context, so IndexedDB and localStorage never leak
between tests.

The suite is kept to the essential journeys (PLAN_009): about 90 listed cases with CI's
environment. Add a case only when it guards a product flow, a security fix, a public contract or
an accessibility smoke check that no unit test can cover.

## Projects and tags

There are two projects: `chromium` (Desktop Chrome) and `mobile` (Pixel 7, touch). A test runs on
both unless it is tagged:

- `{ tag: '@desktop' }` runs on `chromium` only;
- `{ tag: '@mobile' }` runs on `mobile` only.

The filter lives in `playwright.config.ts` (`grepInvert` per project), so a one-project test is
not even listed for the other project. Keep the phone project for cases where the phone layout is
the point (Lumen Bank, shells, deck touch and chrome, content-kind axe, crm-demo axe).

```bash
pnpm test:e2e                                                        # gallery only
PROTOYARD_E2E_PROTOTYPES=crm-demo,mobile-banking-demo,ai-chat-demo \
PROTOYARD_E2E_SHOWCASE=1 PROTOYARD_E2E_DEVTOOLS_PROTOTYPES=mobile-banking-demo \
pnpm test:e2e                                                        # what CI runs
```

Builds exclude DevTools, as shipped. Setup steps that the standalone build has no UI for
(switching persona, a theme override, snapshots, looking up an id) use the runtime handle the
renderer exposes (`window.__protoyard`). Assertions go through the UI or the DOM attributes the
renderer sets (`data-py-ready`, `data-py-mode`, `data-py-theme`, `--tx-primary`).

## Specs

| Spec | Covers | Needs |
| --- | --- | --- |
| `gallery.spec.ts` | home lists the registry; search, filter and an accessible detail page | — |
| `marketplace.spec.ts` | a detail page for a prototype, a template and a blueprint | — |
| `a11y.spec.ts` | axe on the gallery home, the marketplace and each target's main screen, light and dark | targets |
| `docs.spec.ts` | the docs index passes axe | — |
| `crm-demo.spec.ts` | create, edit, delete with reloads; a viewer is refused; snapshot restore; offline save | `crm-demo` |
| `mobile-banking-demo.spec.ts` | payee CRUD; a transfer (both projects); view-only persona; the phone layout | `mobile-banking-demo` |
| `ai-chat-demo.spec.ts` | a streamed reply with safe Markdown (markup stays text); outage, Retry | `ai-chat-demo` |
| `lattice-saas-demo.spec.ts` | sign-up and onboarding resume, SSO consent, magic link, MFA | `lattice-saas-demo` |
| `devtools-panel.spec.ts` | the panel closes by X, Escape and shortcut; theme browser applies a library theme | showcase |
| `pending-feedback.spec.ts` | persona switch speed, latency spinners and the global bar, a slow create | DevTools build |
| `design-system.spec.ts` | create, apply, reload a design system with axe; a CSS-injection document is refused | DevTools build |
| `deck-navigation.spec.ts` | slide and step links, arrows and space; touch swipe on the phone | deck |
| `deck-fragments.spec.ts` | stepped blocks reveal in order and hide going back | deck |
| `deck-presenter.spec.ts` | the presenter window syncs over BroadcastChannel; `?print=1` layout | deck |
| `deck-controls.spec.ts` | Debug for agents, toolbar controls, chrome axe light and dark, the phone More menu | deck |
| `content-kinds-a11y.spec.ts` | a deck, a page and a doc pass axe in light and dark; a page form response persists | player |
| `doc-edits.spec.ts` | a doc edit applies, survives a reload, and Reset clears it | `doc` |
| `showcase.spec.ts` | hosted player per kind, a pasted blueprint journey, a share link with axe, the bundled CRM | showcase |
| `quick.spec.ts` | a brief becomes a served exploration whose player is ready and accessible | `PROTOYARD_E2E_QUICK=1` |
| `review-comments.spec.ts` | comment mode, a persisted pin, resolve and reopen, two reviewers over HTTP | comments builds |
| `charts.spec.ts` | the cartesian chart passes axe and re-reads its palette in dark mode | `ui-kit` |
| `views.spec.ts` | a board drag (both projects) and a calendar event drag | `ui-kit` |
| `shell-layout.spec.ts` | the viewport preset, the phone frame on desktop, full-bleed fallback on a phone | `mobile-banking-demo` |

"Needs" names what turns a spec on; without it the spec skips itself:

- a slug: add it to `PROTOYARD_E2E_PROTOTYPES` (`prototypeUrl(slug)` in `targets.ts`);
- showcase: `PROTOYARD_E2E_SHOWCASE=1` (port 4501, `PROTOYARD_E2E_SHOWCASE_BASE=/protoyard/` for a
  sub-path);
- DevTools build: `PROTOYARD_E2E_DEVTOOLS_PROTOTYPES=mobile-banking-demo` (port 4451,
  `devtoolsPrototypeUrl(slug)`);
- deck: `PROTOYARD_E2E_DECK=1`, or name a deck spec on the command line (port 4891);
- player: `PROTOYARD_E2E_PLAYER=1`, or name `content-kinds-a11y` (ports 4861 and 4862);
- comments builds: `PROTOYARD_E2E_COMMENTS_PROTOTYPES=crm-demo,mobile-banking-demo` (ports 4601+
  and 4651 for the shared HTTP adapter, `support/serve-comments.ts`).

Every fixed port has a `PROTOYARD_E2E_*_PORT` override (see `playwright.config.ts`), so several
checkouts can run the suite side by side.

## Accessibility

`support/a11y.ts` (`expectAccessible(page, testInfo)`) runs axe (`@axe-core/playwright`, tags
`wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`). Serious and critical violations fail the test, and
every result is attached to the report as `axe-<screen>.json`. A domain spec can audit any screen,
including one with an open dialog.

## Adding a spec

Prefer a case in an existing spec over a new file. Skip unless the slug is in
`PROTOYARD_E2E_PROTOTYPES`, open `prototypeUrl(slug)` with `?scenario=<id>`, and wait with
`waitForPrototypeReady(page, { slug })` from `support/ready.ts` instead of ad-hoc selector polls.
Tag desktop-only cases `@desktop`. Never put `data-py-scroll-root` on app markup: it is the
renderer's own wrapper. See the `write-e2e` skill for the full pattern.
