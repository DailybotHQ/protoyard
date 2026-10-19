# Protoyard UI Kit: spec

## Problem

People and agents building Protoyard prototypes need to see which
`@protoyard/ui` components exist, how they behave in every state, how to
use them and how each theme looks before they compose a screen. The UI Kit
is a living showcase that answers this inside a normal Protoyard prototype:
54 catalog entries (50 components in 10 groups and 4 whole-screen
patterns) with live demos, copyable Svelte 5 usage and accessibility notes,
a Theme Lab with live tokens and contrast ratios, a validated form and an
accessibility page. It is a reference, not a business app; its only stored
data is each persona's favorites.

## Users

All roles are simulated personas; see [PERMISSIONS.md](PERMISSIONS.md).

| User | Role | What they do |
| --- | --- | --- |
| Prototype author or agent choosing components and themes (Dana Reyes, product designer) | `designer` | Browses everything, stars and unstars entries, clears favorites, uses the Theme Lab |
| Stakeholder reviewing the kit (Sam Ito) | `viewer` | Browses everything and uses the Theme Lab; stars are visible but locked |

## Capabilities

- Star and unstar components and patterns for quick access: [Star a component](FLOWS.md#star-a-component), [Unstar a component](FLOWS.md#unstar-a-component).
- Clear every favorite of the acting persona: [Clear all favorites](FLOWS.md#clear-all-favorites).
- Interact with a live demo of every component and pattern: [Try a component demo](FLOWS.md#try-a-component-demo).
- Copy a usage snippet: [Copy a usage snippet](FLOWS.md#copy-a-usage-snippet).
- Apply a library or built-in theme to the prototype: [Use a theme in the prototype](FLOWS.md#use-a-theme-in-the-prototype).
- Build a custom theme from a brand color, font pairing, density and radius: [Save a Theme Studio draft](FLOWS.md#save-a-theme-studio-draft).
- Inspect any theme's tokens and contrast and copy them as JSON: [Inspect and copy theme tokens](FLOWS.md#inspect-and-copy-theme-tokens).
- Try a fully validated form: [Submit the Forms page](FLOWS.md#submit-the-forms-page).
- Read the live contrast audit, guarantees and keyboard map (read-only, described in [SCREENS.md](SCREENS.md)).

## Non-goals

- No business domain: the patterns (dashboard, task board, team chat,
  mobile app) are in-memory demos and store nothing.
- The Forms page does not create anything; its save is a timed, local
  simulation.
- No component editing or code generation beyond the static usage
  snippets; no package install or download.
- No theme management beyond saving and applying: custom themes cannot be
  deleted, renamed or imported from this UI (the runtime supports it; the
  kit does not expose it).
- No sharing of favorites between personas or visitors.
- It is not the source of the components: they live in `packages/ui` and
  `packages/themes`, and this kit only renders them.

## Scenarios

<!-- protoyard:generated:scenarios -->
| Scenario | Name | Group | Density | Seed | Generator knobs | Description |
| --- | --- | --- | --- | --- | --- | --- |
| `dark-viewer` | Viewer in dark mode | Personas | normal | 7 | `{"favorites":6}` | A read-only stakeholder who prefers dark mode: stars are visible but locked. |
| `default` | Designer with favorites | Personas | normal | 7 | `{"favorites":6}` | A designer who starred a handful of components and patterns. |
| `empty` | First visit | Lifecycle | empty | 11 | `{"favorites":0}` | No favorites yet — shows the empty states. |
<!-- /protoyard:generated:scenarios -->

## Honest boundaries

Everything below is a simulation. See
[docs/SPECS.md](../../../docs/SPECS.md#honest-boundaries).

| Concern | What this prototype does |
| --- | --- |
| Data | Favorites are stored in IndexedDB in the visitor's browser (namespace `ui-kit`); custom themes and the theme override live in the same browser's control database. Nothing is shared between visitors or devices. Demo and form state is in memory and lost on navigation. |
| Identity | Two fixed fictional personas (Dana Reyes, designer; Sam Ito, viewer). The persona is switched in DevTools, which is part of `pnpm protoyard dev` but not of the static build. There is no sign-in and no authentication. |
| Permissions | `favorites:manage` checked by `session.assert` in `src/domain/favorites.ts`. It shapes the UX and makes a viewer's toggle fail even from the console, but it is not authorization or security. Theme changes are not checked at all. |
| Payments | None. "Not available on the free plan" on the Forms page is static copy. |
| Network | No network calls. The two favorites mutations run through `environment.run`, so DevTools can add latency, go offline or inject failures; theme changes and demos do not. Library themes load as local code-split chunks. |
| Time | Favorites use the simulated clock (reference time `2026-10-16T09:00:00Z`); there is no timeline. Demos use the wall clock and real timers for message times and typing or saving effects. |
| Content | Fictional people and messages (`example.com`); chat replies in demos are canned lines, not a model. The generator is deterministic: the same seed gives the same favorites. |
| Accessibility | Contrast ratios are computed from the theme tokens, and the guarantees on the Accessibility page describe what the components implement and what the test suite checks. Screen-reader quality beyond automated checks is not verified here. |

## Rebuild as a real app

The kit maps to a production **design system and its documentation
site**, not to a product backend. No vendor or framework is chosen here.
See [docs/SPECS.md](../../../docs/SPECS.md#rebuild-as-a-real-app).

| Prototype piece | Real counterpart to design |
| --- | --- |
| The components showcased (`@protoyard/ui`, 50 entries in 10 groups) | A versioned component library with a public API, changelog and deprecation policy; each catalog entry becomes a documented component page. |
| `src/catalog/entries.ts` and `registry.ts` (summary, demo, snippet, a11y notes) | Documentation source per component: live examples, copyable usage generated or tested against the real API, and accessibility notes kept next to the code. |
| Patterns (dashboard, task board, team chat, mobile app) | Reference screens or templates that product teams copy; they need real data contracts when used in an app. |
| Built-in and library themes, Theme Studio, token table | Design tokens as the source of truth (a token pipeline that exports CSS variables and other platform formats), theme versioning, and a review step for new brand themes. The contrast checks (4.5:1 text, 3:1 UI) become a CI gate on token changes. |
| Custom themes in the control database and `exportTheme` JSON | A stored, shared theme registry (per organization or product) with import/export in the same `protoyard-theme/v1`-style envelope or a successor format. |
| Accessibility page and its guarantees | An accessibility statement and automated plus manual audits (keyboard, screen readers) per release. |
| `favorites` table and `createFavoriteServices` ([DATA_MODEL.md](DATA_MODEL.md), [FLOWS.md](FLOWS.md)) | If kept, a per-user bookmarks endpoint with the same toggle and clear semantics, keyed by user and component id. |
| `policy.roles` (`designer`, `viewer`) | Real roles on the documentation site if editing exists (for example who can publish themes); browsing stays public. Enforce on the server ([PERMISSIONS.md](PERMISSIONS.md)). |
| Personas and the DevTools switch | A real identity provider, only if the site needs accounts |
| `environment.run` failures | Error and retry states for the few writes (bookmarks, theme saves) |
| Scenarios and `generateUiKitWorld` | Fixtures for visual-regression and documentation tests |
| Screens ([SCREENS.md](SCREENS.md)) | The documentation site's navigation, component pages and theme tools; the listed loading, empty and error states are the acceptance list |

## Manifest facts

<!-- protoyard:generated:manifest -->
| Field | Value |
| --- | --- |
| id | `protoyard.ui-kit` |
| slug | `ui-kit` |
| name | Protoyard UI Kit |
| version | 0.1.0 |
| platform | responsive |
| category | design-system |
| default scenario | `default` |
| default theme | `violet` |
| storage namespace | `ui-kit` |
| schema version | 1 |
| generator version | — |
| timeline | no |
| themes | built-in presets only |
<!-- /protoyard:generated:manifest -->
