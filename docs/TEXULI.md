# Texuli in Protoyard

Protoyard is Texuli-first: new shared and prototype UI starts with the
published [Texuli](https://www.npmjs.com/package/texuli) components, tokens,
and kits. Protoyard composes them through its public package exports and
keeps product behavior, runtime contracts, and documented exceptions in
Protoyard. Every Texuli dependency is pinned to the exact npm version `0.14.0`
in this workspace, and every workspace package uses the same pin;
`check-texuli-latest.ts --registry` compares the pins with npm `latest` before
a release.

## How it is linked

Texuli is consumed from npm at exact versions. The workspace does not require
a Texuli checkout or use `link:`/`file:` dependencies for Texuli. The release
age guard exempts Texuli packages so Protoyard can adopt the release from its
maintainer as it ships. Dependency changes and the lockfile are maintained as
one workspace update.

`pnpm exec tsx scripts/check-texuli-latest.ts` keeps it that way: it fails
when a Texuli dependency is not an exact npm version (`link:`, `file:`,
`workspace:`, a tag or a range) or when two manifests pin one package
differently. `pnpm test` runs it offline through
`scripts/tests/texuli-latest.test.ts`. `--registry` also compares every pin
with that package's npm `latest` dist-tag; run it before a release (the npm
CDN can lag a few minutes after a Texuli publish).

| Package family | Direct Protoyard consumers |
| --- | --- |
| `texuli` | `ai-ui`, `analytics-ui`, `blocks-ui`, `charts-ui`, `crud`, `decks-ui`, `devtools`, `flows-ui`, `gamification-ui`, `pages-ui`, `player`, `renderer-svelte`, `review-ui`, `saas-ui`, `ui`, `views-ui`, gallery; every template and prototype app |
| `@texuli/astro` | gallery |
| `@texuli/blocks` | `blocks`, `blocks-ui`, `pages-ui` |
| `@texuli/canvas` | `views-ui` (`./canvas`), `crud` (`./screens/canvas`) |
| `@texuli/charts` | `analytics-ui`, `blocks-ui`, `charts`, `charts-ui` |
| `@texuli/chat` | `ai-ui`, `ui` |
| `@texuli/core` | `ui` |
| `@texuli/data` | `analytics-ui`, `blocks-ui`, `ui`, `views`, `views-ui` |
| `@texuli/date` | `analytics-ui`, `ui` |
| `@texuli/deck` | `decks`, `decks-ui` |
| `@texuli/document` | `pages`, `pages-ui` |
| `@texuli/drag` | `views-ui` |
| `@texuli/editor` | `blocks-ui`, `views-ui` |
| `@texuli/forms` | `crud`, `pages-ui`, `saas-ui` |
| `@texuli/pages` | `pages-ui` |
| `@texuli/primitives` | `devtools`, `ui`, `views-ui` |
| `@texuli/sheets` | `views-ui` (`./sheet`), `crud` (`./screens/sheet`) |
| `@texuli/slides` | `decks-ui` |
| `@texuli/tokens` | gallery, `charts`, `themes` |
| `@texuli/workflows` | `flows-ui` |

Every package is `0.14.0`. Texuli pins its own internal dependencies exactly,
so the family moves together. The root manifest also pins the published
family used by optional and future workspace surfaces (for example
`@texuli/catalog` and `@texuli/media`). `docs/PACKAGES.md` lists the package
graph and direct dependencies. `@texuli/mcp` is not a dependency: it runs as
a companion MCP server next to `protoyard mcp` ([MCP](MCP.md)).

Protoyard typechecks against the published package declarations in
`node_modules`; Texuli's own source is covered by the Texuli maintainers'
checks.

## The Texuli agent skill

Agents working in this repository have the Texuli skill at
`.agents/skills/texuli` (version 0.3.13, the skill release that matches the
Texuli 0.12 packages Protoyard installs). It is the pinned `skill-v0.3.13`
release, installed from its archive after checking the archive and every file
against the release's `SHA256SUMS` and running
`setup.sh --verify --expect-version 0.3.13`. It explains Texuli's components,
tokens, icons, layouts, themes, documents and MCP hosts, and how to report a
missing API. To upgrade, repeat
those steps for the new release and replace the folder; never edit it in place.

## Labels in another language

Texuli 0.13 has one label dictionary for every component (`texuli/i18n`,
Texuli ADR-026). A prototype passes it once, to `mountPrototype` in
`src/main.ts`, and the renderer wraps the whole app in Texuli's
`LabelsProvider`:

```ts
mountPrototype({
  definition,
  App,
  target,
  i18n: {
    locale: 'es',
    labels: {
      'texuli.toaster.label': 'Notificaciones',
      'blocks.text.tones.info': 'Información',
      'pages.outline': 'En esta página',
    },
  },
});
```

Ids come from `TexuliMessageId`, `PrimitivesMessageId`, `BlocksMessageId`
(`@texuli/blocks/i18n`) and `PagesMessageId` (`@texuli/pages`); a component's
own `labels` prop still wins, and missing ids stay English. The renderer's own
words (service toasts, loading text, the demo badge) go in `messages`
(`ChromeMessages`). Texuli's `data`, `chat`, `media` and `editor` packages still
take per-component `labels` props only (a known Texuli gap), and most of Protoyard's
kits do not map their own strings onto the dictionary yet. DocApp does: its
outline reads `pages.outline`, and its own words use `protoyard.doc.edit`,
`protoyard.doc.reset`, `protoyard.doc.download`, `protoyard.doc.download-as`
(`{format}`), `protoyard.doc.edits-saved`, `protoyard.doc.edits-unsaved`,
`protoyard.doc.download-failed`, the `protoyard.doc.*` notice ids in
`DocApp.svelte`, `protoyard.pages.document-content` and
`protoyard.pages.untitled-document`.

## Protoyard kit ids

Protoyard's kits resolve their own words through the same dictionary, with
ids shaped `protoyard.<kit>.<component>.<key>` and today's English as the
fallback. Put them in `mountPrototype({ i18n: { labels } })` next to the
Texuli ids; a component prop (for example `Leaderboard emptyTitle`) still
wins. Placeholders are written `{name}`. Counts arrive as plain digits so the
English text stays exactly as before; where English needs a singular, the kit
uses a separate id (such as `…label-one`) instead of a plural message.

### Gamification (`@protoyard/gamification-ui`)

- `protoyard.gamification.level-chip.label` (`Level {level}`)
- `protoyard.gamification.points-chip.points` (`{points} points`),
  `.points-provisional` (`{points} points verified, {provisional} in progress`)
- `protoyard.gamification.streak-chip.label-one` (`1 week streak`),
  `.label` (`{weeks} week streak`)
- `protoyard.gamification.mission-card.status-complete`, `.status-expired`,
  `.status-in-progress`, `.status-available`, `.progress`, `.progress-value`
  (`{progress} of {goal}`), `.reward` (`Reward {reward} points`), `.accept`,
  `.accepted`, `.completed`
- `protoyard.gamification.leaderboard.label`, `.opt-in`, `.opt-in-hint`,
  `.saving`, `.empty-title`, `.empty-description`, `.show-me`, `.position`
  (`{position}`), `.you`, `.points` (`{points}`)
- `protoyard.gamification.achievement-badge.earned` (`{name}, earned`),
  `.earned-on-spoken` (`{name}, earned {date}`), `.earned-on`
  (`Earned {date}`), `.progress`
  (`{name}, {progress} of {goal} ({percent} percent)`)

`AchievementBadge earnedAt` formats its date with the dictionary's `locale`.

### SaaS (`@protoyard/saas-ui`)

- `protoyard.saas.account-gate.title`, `.description`, `.note`,
  `.simulated-note`, `.create`, `.dismiss` (`AccountGate`; each also a prop)

### Pages and docs (`@protoyard/pages-ui`)

Besides the `protoyard.doc.*` ids listed above:

- `protoyard.doc.loading`, `.loading-editor`, `.loading-form`
- `protoyard.doc.saved` (`Saved {filename} ({size}).`), `.saved-pages`
  (`Saved {filename} ({size}, {pages}).`), `.page-count-one` (`1 page`),
  `.page-count` (`{count} pages`), `.write-failed`
- `protoyard.page.loading`, `.load-failed`, `.try-again`, `.loading-form`
- `protoyard.pages.print` (`PrintButton`; its `label` prop still wins)

### Views (`@protoyard/views-ui`)

- `protoyard.views.query-state.empty-title`, `.denied-title`,
  `.denied-message` (`{capability}`), `.offline-title`, `.offline-message`,
  `.failed-title`, `.failed-message` (`QueryState`; `classifyQueryError(error,
  messages)` takes the same lookup)
- `protoyard.views.notification-center.label`, `.marking-all`, `.marking`,
  `.loading`, `.load-failed`, `.unread-trigger` (`{count} unread, {label}`),
  `.unread-description` (`{count}`), `.mute` / `.unmute` (`{kind}`)
- `protoyard.views.notification-center.inbox.*` bridges Texuli's inbox labels
  (which have no dictionary ids yet): `.view`, `.all`, `.unread`,
  `.mark-all-read`, `.mark-read`, `.mark-unread`, `.unread-item`, `.empty`,
  `.empty-unread`, `.save-failed`, `.unread-count` (`, {count} unread`),
  `.mark-read-item` / `.mark-unread-item` (`{title}`), `.arrived-one`,
  `.arrived` (`{count}`). The `labels` prop (any inbox or center label) wins.
- `protoyard.views.comment-thread.label`, `.loading` (`{label}`), `.someone`,
  `.edited`, `.deleted`, `.edit-by` (`{name}`), `.save`, `.comment`,
  `.reaction-count` (`{emoji} {count}: {names}`), `.react`, `.reply`, `.edit`,
  `.delete`, `.reactions`, `.react-with` (`{emoji}`), `.sending-comment`,
  `.you`, `.sending`, `.pending-comment`, `.empty`, `.replies-to` / `.reply-to`
  (`{name}`), `.send-reply`, `.add`, `.delete-title`, `.delete-description`,
  `.delete-confirm`
- `protoyard.views.composer.submit`, `.empty`, `.not-saved`, `.placeholder`,
  `.cancel`
- `protoyard.views.activity-feed.label`, `.loading` (`{label}`)

### Review comments (`@protoyard/review-ui`)

The review UI mounts as its own Svelte root, outside the app's
`LabelsProvider`; pass the dictionary to `mountReview({ i18n })` (or the
`i18n` prop of `ReviewPanel`). `mountPrototype` does not forward it yet.

- `protoyard.review.tab` (the DevTools tab name; a plain string)
- `protoyard.review.session.import-none`, `.imported-one`, `.imported`
  (`{count}`), `.load-failed`, `.save-failed`, `.name-prompt`, `.body-prompt`,
  `.thread`, `.thread-on` (`{screen}`), `.this-screen`, `.close`, `.reopen`,
  `.resolve`, `.reply`, `.sending`, `.send-reply`
- `protoyard.review.toolbar.label`, `.title`, `.launcher` (`{threads}`),
  `.launcher-pending` (`{label}`, `{count}`), `.threads-one`, `.threads`
  (`{count}`), `.count` (`{count}`), `.comment`, `.stop`, `.panel`, `.export`,
  `.import`, `.synced`, `.pending-one`, `.pending` (`{count}`), `.shared`,
  `.local`, `.live`, `.on-refresh`, `.action-failed`
- `protoyard.review.panel.label`, `.title`, `.thread-count` (`{count}`),
  `.filters`, `.state`, `.filter-state`, `.all-states`, `.open`, `.resolved`,
  `.screen`, `.filter-screen`, `.all-screens`, `.author`, `.filter-author`,
  `.all-authors`, `.anchor`, `.filter-anchor`, `.all-anchors`, `.anchored`,
  `.orphaned`, `.search`, `.counts`, `.empty`, `.threads`, `.unknown-screen`,
  `.restoring`, `.restore`, `.restore-failed`, `.switch-title`,
  `.switch-description` (`{scenario}`), `.cancel`, `.switching`,
  `.switch-confirm`
- `protoyard.review.thread.label`, `.name-title`, `.name-hint`, `.name-label`,
  `.name-invalid`, `.name-not-saved`, `.continue`, `.by` (`{name}`),
  `.reopen`, `.resolve`, `.update-failed`, `.gone`, `.open`
- `protoyard.review.overlay.label`, `.add`, `.exit`, `.saving`, `.place`,
  `.place-hint`, `.pin-one` / `.pin` (`{name}`, `{excerpt}`, `{count}`),
  `.cluster` (`{count}`), `.composer-opening`, `.composer-opened`,
  `.location-saving`, `.location-saved`, `.location-failed`
  (`createReviewOverlay({ messages })` takes the lookup)
- `protoyard.review.composer-notice.text`

## Icons, code fields, image pairs and avatar grids (Texuli 0.13.1)

Texuli 0.13.1 adds four components a prototype can use directly (they are
not in the agent catalog yet, so blueprints cannot emit them):

- **Icons by name:** `registerIcons({ rocket: Rocket })` in a root or layout
  component (or `<IconsProvider icons={…}>`), then `<Icon icon="rocket" />`.
  Both come from `texuli/icons`; it is Svelte context, so it is SSR-safe and
  scoped to the subtree.
- **Code field:** `<CodeField bind:value language="ts" label="Query" />` from
  `@texuli/blocks/code-field`, an editable highlighted field with no HTML sinks.
- **Light and dark image:** `<Image src={light} srcDark={dark} alt="…" />` from
  `@texuli/media/image`.
- **Avatar grid:** `<AvatarGroupGrid items={members} label="…" />` from
  `texuli/avatar`, a 2×2 collage for group conversations.

## What Texuli 0.14.0 adds for prototypes

Texuli 0.14.0 closes the Texuli rows from the downstream gap reports. All of
it is additive for Protoyard:

- **Timeline:** `TimelineView` (`@texuli/data/timeline`) draws group header
  rows and bands from `getGroup`, takes `bind:collapsed`, `bind:selectedRow`,
  `onRowSelect`, `onGroupAdd` and `markers`.
- **Charts:** the cartesian charts take `yDomain` and `formatValue`.
- **Dialogs:** `AlertDialog` takes `confirmDisabled`; dialog and sheet scrims
  read `--tx-scrim`, so set that in host CSS for a dark scrim.
- **Navigation:** `Breadcrumb` items take `ariaLabel` and
  `onSelect(item, event)`; tabs set `aria-controls` only while their panel is
  rendered (or take `panelId`); `TabItem` attributes such as
  `data-testid` land on the trigger.
- **Icons:** `registerIcons` takes lazy loaders and a `fallback` icon.
- **Motion:** `MotionLoop` from `texuli/motion/loop` (static under reduced
  motion; not in the blueprint vocabulary).
- **Design systems:** compiler version 3 (every compiled hash changes once;
  Protoyard commits no compiled output), the `aa-non-text` (3:1) check for
  `sidebarPrimary` on the sidebar, `darkOpacity` on elevation layers and
  `components.card["font-size"]`. Texuli now derives `sidebarPrimary` itself,
  and `ds new --from-theme` already drops a copied one.

## The uniform component contract

Since Texuli 0.8, every styled component follows one contract: `bind:ref`
gives its root element (an overlay's open content), the rest attributes land
on that root or on the focusable control inside it, and a caller's handler
(`onclick`, `onkeydown`…) runs first, with the component's own behavior kept.
`@protoyard/ui` applies the same contract to all 90 of its component exports.
`packages/ui/tests/contract.test.ts` checks every export through one harness,
so a new export without a contract row fails. The rows Texuli still blocks are
`it.fails` tests that name their gap and turn red when the fix ships. The
additions were all additive: `ref` and rest props everywhere, `CommandPalette`
`bind:open`, `FileDropzone` `id` and `TabItem.badgeLabel`.

## Texuli first: the adoption check

Run `pnpm exec tsx scripts/check-texuli-adoption.ts` to enforce the
workspace rules. A workspace that installs Protoyard from npm runs the same
rules with `protoyard check texuli [--scope <path>…]` (the core lives in
`packages/cli/src/lib/texuli-adoption.ts`). `pnpm test` (which CI runs) includes
`tests/adoption/texuli-adoption.test.ts`, which runs this default ratchet over
the whole repository. Scoped strict checks (`--scope <path> --strict`, with
`--allow-gaps` where a pending entry waits on an open gap) are not part of CI;
run them by hand for the surface a task migrates.

| Rule | Prevents | Required direction |
| --- | --- | --- |
| `legacy-import` | Imports of `clsx`, `tailwind-merge`, or `tailwind-variants` | Use Texuli's `cx` from `texuli/cx`. Protoyard keeps `cn` as an alias for compatibility; it is equivalent to `cx` and does not resolve Tailwind conflicts. Update callers that relied on conflict merging. |
| `raw-lucide` | Rendering a component directly from `@lucide/svelte` | Use `Icon` from `texuli/icons` for its ten built-in names. For every other glyph, import the glyph from `@lucide/svelte` and render it through `LucideIcon` from `texuli/icons/lucide`, e.g. `<LucideIcon icon={Activity} />`. Lucide is only the glyph source. |
| `py-token` | Reading legacy `--py-*` styling tokens in authored UI | Use Texuli's `--tx-*` theme tokens. Only renderer-owned geometry (`--py-fixed-right-edge`, `--py-side-panel-width`, `--py-safe-*`, `--py-device-radius`, `--py-app-height`) remains under `--py-*`; deck-stage properties use `--tx-deck-*`. |
| `raw-control` | Native interactive controls in Svelte markup | Use the matching Texuli or public `@protoyard/ui` control. |
| `input-as-choice` | Using `Input` with `type="checkbox"` or `type="radio"` | Use `Checkbox` or `RadioGroup`/`RadioGroupItem`. Texuli `Input` binds its `value`; it is not a choice control. |
| `own-component` | A leaf UI component that draws a generic control without using Texuli or Protoyard UI | Compose Texuli, or use a documented Protoyard exception where the behavior is product-specific. |
| `component-bind-this` | Capturing a Texuli/Protoyard UI component with `bind:this` and then using it as a DOM element | Use `bind:ref` when the component exposes a DOM ref. If it does not, keep a minimal adapter and report the missing ref as a gap. `bind:this` remains valid for component APIs, not DOM operations. |
| `local-motion` | An import from `svelte/transition` or `svelte/animate`, or an `@keyframes` rule, in a UI package (`ui`, `*-ui`, `devtools`, `crud`, `player`, `renderer-svelte`), the gallery, a template or a prototype | Use Texuli motion: the `motion` prop or `MotionProvider` from `texuli/motion`, the `@texuli/core/motion` texels, and the `--tx-motion-*` tokens. They honor reduced motion by construction. |
| `icon-size` | A pixel number as `size` on `Icon` or `LucideIcon`, such as `size={16}` | Use a Texuli size: `xs` (12 px), `sm` (16 px), `md` (20 px) or `lg` (24 px). A number matches no size, so a built-in glyph renders with no width and stretches to fill its container. `astro check` does not catch it in the gallery's Svelte islands. |
| `ref-undefined` | `bind:ref={x}` where `x` does not start as `null` (for example `$state<HTMLElement \| null>()` or a declaration with no initializer). Svelte throws at runtime on `bind:ref={undefined}` against a `ref` with a fallback, which stops the whole island | Start refs as `$state<HTMLElement \| null>(null)`, `$state(null)` or `= null`. The check reads the initializer, not the type. |

### Motion

Motion comes from Texuli: component `motion` props, the `texuli/motion`
factories (`createPresenceMotion`, `createListMotion`…) and the
`--tx-motion-*` tokens. A theme's motion (fast, base and slow durations and
an easing; Theme Studio's motion preset) reaches Texuli's variables, with the
`slower` step Texuli derives. The renderer wraps every prototype in a
`MotionProvider` with the prototype's resolved reduced-motion setting, so the
DevTools toggle, a scenario or the reader's preference turns every Texuli
animation into an instant state change. The global pending bar is Texuli's
`Progress`. Two looping indicators stay local keyframes, each a reasoned
entry in `tests/adoption/texuli-exceptions.json`: the undo countdown bar and
the voice orb (Texuli's motion caps one run at 1 s).

### Exceptions and the gap loop

`tests/adoption/texuli-exceptions.json` is the reviewed exception list. It
covers Protoyard-owned behavior such as device/browser chrome, shell and frame
geometry, the player’s explanatory surface, and product-specific extension
points. Each entry has a reason. Add an exception only for a real Protoyard
responsibility; generic UI belongs to Texuli.

When a Texuli API cannot support a needed behavior, keep the smallest adapter
that preserves the public Protoyard API. Record the affected path in
`tests/adoption/pending/<unit>.json` with `"gap": "G<n>"`, and report the
gap with its package, API, minimal reproduction, and expected behavior to the
Texuli maintainers. Track the authoritative open and fixed gaps in
[`tests/adoption/texuli-gaps.json`](../tests/adoption/texuli-gaps.json). Once a
maintainer releases the fix, adopt it, remove the adapter and pending entry,
and verify with the strict adoption check. Never copy or patch Texuli source
inside Protoyard.

The checker supports a normal ratchet run, `--scope <path> --strict`,
`--allow-gaps` with strict mode, and `--prune` to remove fixed pending entries.
The ratchet also fails on a stale pending entry (its recorded count is above
today's, or the violation is gone) until `--prune` tightens it, so a fixed file
cannot regress silently up to its old count. In `.svelte` files, markup drops
only `<!-- -->` comments; JS and CSS comments are stripped only inside
`<script>` and `<style>`.
It scans source under `packages/`, `apps/`, `templates/`, and `prototypes/`;
tests and build output are excluded.

## Themes come from `@texuli/tokens`

`@protoyard/themes` builds and adapts Protoyard's appearance model using
`@texuli/tokens`. The 204 library themes (Texuli's 64 port themes, the
catalog, and its 140 expand themes from `@texuli/tokens/library-expand`; 210
with the six built-ins), on by default and loaded on demand, remain
Protoyard's product surface. Theme writers now emit only Texuli's `--tx-*`
variables. The deprecated `--py-*` theme aliases are removed; renderer-owned
geometry remains under `--py-*`, while deck-stage properties use `--tx-deck-*`. Import token
subpaths such as `@texuli/tokens/css` and `@texuli/tokens/contract`; do not
statically import the root barrel, which includes the theme library.

## Decks run on `@texuli/deck` and `@texuli/slides`

`@protoyard/decks` is a thin layer over `@texuli/deck` (the deck model,
validation, catalog, steps, navigation, controls, presenter protocol, lint,
patches and text twins), and `@protoyard/decks-ui`'s `DeckApp` presents decks
on the `@texuli/slides` stage. Every decks-ui module imports the leaner
`@texuli/slides/stage-core` (a hygiene test fails on `@texuli/slides/stage`),
and `DeckApp` hands the stage a deck already prepared by `prepareDeckV2`, so
the stage paints without validating again. The Debug for agents button sits in
the stage toolbar's host-tools group, and print preloads its view without
Texuli's default renderers. Protoyard keeps its deck shape, offline media
policy, themes, free slides through `@protoyard/blocks-ui`, custom slides, the
debug panel and Deck Studio. Details and the migration note:
[DECKS](DECKS.md#built-on-texuli-migration-note).

## Forms from `@texuli/forms`

Generated entity forms, page and doc form blocks, and the SaaS kit's forms
(sign-in, sign-up, password reset, magic link, phone sign-in and code, MFA,
profile, notification preferences, member invite and the onboarding wizard)
render through Texuli's `SchemaForm`. `@protoyard/blueprint` maps entity fields to a Texuli
`FormSchema` as plain data (`entityFormModel`); `@protoyard/crud`'s
`EntityForm` paints the mapped fields with `SchemaForm` and keeps Protoyard
controls for the kinds Texuli has no control for (relation, datetime, geo,
avatar, file). Every submission still goes through the entity, form-response
or SaaS service, and the service's issues come back inline. The SaaS kit
uses Texuli's `otp` field for the MFA and phone codes and its `color` field
for the profile's avatar color. The onboarding wizard is one multi-step form
on `createFormController`, whose `onStep` saves each answer through the
onboarding service. Password fields use Texuli's `password` type with
`autocomplete: 'off'` (accepted since 0.11.2, G129), so browsers never offer
to save a fake password. The phone number is a `phone`-format text field,
which Texuli paints as `type="tel"` with the telephone keypad (since 0.11.3,
G131).

Details: [GENERATOR](GENERATOR.md#entity-forms), [PAGES](PAGES.md) and
[SAAS_KITS](SAAS_KITS.md).

## Documents from `@texuli/pages` and `@texuli/document`

A doc can be edited in Texuli's `PageEditor` (slash menu, drag or
Alt+arrow reordering, undo) and downloaded as Word, PDF or Markdown through
`@texuli/document`. `@protoyard/pages` converts a doc body to a Texuli
document and back; untouched blocks return byte-identical, and Protoyard's
own blocks travel as placeholders. Applied edits are saved per doc and world
in the content-kind runtime's `docEdits` store (its storage schema version 2)
and survive a reload; Reset removes them. The reading view stays Protoyard's
`DocHost`. Texuli 0.10–0.11 added the `renderBlock` seam (G111),
`@texuli/pages/reader-core`, host heading anchors (`anchorFor`, G132) and a
validator without the deck model (`@texuli/document/schema-core`, G133).
Protoyard's blocks paint through the seam, and `anchorFor={(block) => block.id}`
keeps every `#<block-id>` link and the TOC ids. One thing still blocks the
switch, measured 2026-11-01 on Texuli 0.11.3 with `budget.test.ts`'s Vite
production build:

- **Size.** The reader needs the doc → Texuli conversion on the first screen.
  Today's doc entry plus that conversion alone measures 147,659 B of initial
  JS gzip, against 120,623 B today and a 122,880 B budget. That is before the
  reader is added. The conversion's largest parts are the Markdown codec
  (`@texuli/core/editor`, about 15 KB), because Protoyard's text blocks are
  Markdown, and the schema toolkit `schema-core` still validates with
  (`@texuli/deck/schema`, about 9 KB). On 0.11.1 the conversion cost
  30,854 B; `schema-core` saves about 3.8 KB of that and keeps the deck model
  out.

The edit-mode conversion also drops some content a reading view must keep:
heading eyebrows and subtitles, quote citations and callout icons.
`@protoyard/pages` validates converted documents with `schema-core`, which
refuses inline decks (Protoyard writes none). That shrinks the shared chunk
behind the Word, PDF and Markdown downloads from 19,283 B to 3,907 B gzip.

`PageApp` renders page sections (hero, pricing, steps…), not a document, so
the reader does not apply to it. Details: [PAGES](PAGES.md#reading-view-and-texulis-reader)
and [KINDS](KINDS.md).

## Spreadsheets and the infinite canvas

`@protoyard/views-ui/sheet` (`SheetView`, over `@texuli/sheets`) and
`@protoyard/views-ui/canvas` (`CanvasView`, over `@texuli/canvas`) are lazy
views that persist through a service callback and validate stored data as
untrusted input. Blueprints gain `sheet` and `canvas` screen types, painted by
`@protoyard/crud/screens/sheet` and `@protoyard/crud/screens/canvas`. Used by
the `canvas-board-demo` prototype, the fintech-dashboard ledger and the
design-kit sketches. Details: [VIEWS](VIEWS.md).

## Charts from `@texuli/charts`

`@protoyard/charts` re-exports Texuli chart math and adapts palette tokens.
`@protoyard/charts-ui` exposes lazy chart-family subpaths backed by Texuli,
with thin adapters for Protoyard data shapes and callbacks. Analytics and
block UI consume the same chart families through their public package
subpaths. Protoyard retains analytics models, deterministic data generation,
and its dashboard-specific composition.

## Content blocks from `@texuli/blocks`

`@protoyard/blocks` uses Texuli for tokenization, diagram layout, limits,
safety, and formula operations while owning Protoyard schemas, catalog,
interactive host, and product extensions. `@protoyard/blocks-ui` renders
Texuli block families through lazy public subpaths and thin shape adapters;
Protoyard-specific block types remain extensions. `@protoyard/pages-ui` uses
the same block rendering surface for pages and documents.

## Generic styled components come from `texuli`

`@protoyard/ui` exposes the stable Protoyard UI API while re-exporting or
composing Texuli's styled components and primitives. Use its public exports in
prototypes; do not import its source paths. Direct Texuli imports belong in
package adapters or when a needed component is not available from the
Protoyard public API. The UI package also owns Protoyard-specific shells,
device frames, navigation contracts, overlays, and scenario controls.

`@texuli/primitives` underpins the remaining wrappers in the dialog, floating,
and simple-control families. `@protoyard/ui` preserves its props and the
overlay stack, device containment, and undo behavior. This is a compatibility
layer, not a reason to create new generic controls.

### Follow-ups: components that stay Protoyard wrappers

Some public Protoyard components remain thin adapters because their stable
props or host behavior differ from Texuli's APIs. The current exception list
and adoption pending files identify these paths and any blocking gap. In
particular, keep Protoyard service callbacks, overlay ownership, layout
contracts, and API compatibility in their existing package boundaries.
New components should start from Texuli; add a wrapper only when it translates
a real Protoyard contract or works around a tracked gap.

## Layouts come from `texuli/layouts`

`@protoyard/ui`'s `LayoutHost` wraps Texuli's layout host and registers the
Texuli app, mobile, and auth/settings layouts alongside Protoyard-specific
dashboard-grid and marketing entries. Protoyard retains its layout catalog,
the docs layout contract, device frames, and host markers. `@protoyard/crud`,
DevTools, pages, decks, and prototypes consume layouts through public
`@protoyard/ui` exports.

## UI package migration

Every UI package now uses Texuli as its component foundation. Its own domain
behavior and host contracts remain Protoyard-owned:

| Package | Texuli role today | Protoyard-owned surface |
| --- | --- | --- |
| `ui` | Styled components and primitives, navigation, choice, field, input, feedback, and layout exports | Shells, device frames, overlays, scenario and honesty controls, stable public API |
| `devtools` | Texuli components and tokens for the control center | Prototype runtime controls, inspectors, theme studio workflows |
| `crud` | Texuli UI and lazy layout/screen composition; `@texuli/forms` `SchemaForm` in `EntityForm`; sheet and canvas screens | Blueprint CRUD behavior, services and screen registry |
| `charts-ui` | Texuli chart families through lazy adapters | Protoyard prop/data compatibility |
| `analytics-ui` | Texuli KPI, date, filter and chart components | Analytics dashboard composition and Protoyard engine integration |
| `views-ui` | Texuli rich-view renderers and primitives, `@texuli/sheets` and `@texuli/canvas` | Service callbacks, view host APIs, and extensions where Texuli gaps remain |
| `blocks-ui` | Texuli block-family renderers | Protoyard-only block renderers and extensions |
| `decks-ui` | The `@texuli/slides` stage core, Texuli controls and styled UI | Deck authoring, presenter, print, and prototype-specific behavior |
| `pages-ui` | Texuli controls and block renderers, the `@texuli/pages` editor, `@texuli/document` exports, `@texuli/forms` form blocks | Page/doc hosts, form-response and saved-edit services, and print behavior |
| `saas-ui` | Texuli controls and styled components; `@texuli/forms` for the auth, profile, settings and invite forms and the onboarding wizard | Simulated SaaS screen flows and route guards |
| `ai-ui` | Texuli chat components and styled UI | Assistant state, safe rich answers, tool orchestration and widget modes |
| `flows-ui` | Texuli workflow editor and run-panel components | Protoyard workflow contract and deterministic simulation |
| `review-ui` | Texuli controls and styled UI | Review thread, anchor, and mount integration |
| `gamification-ui` | Texuli controls and styled UI | Protoyard points, badge, mission, and streak presentation |
| gallery | Texuli Astro integration and tokens | Protoyard gallery and marketplace experience |
| `player` | Texuli styles and controls in the prebuilt blueprint player | Blueprint-kind routing and no-install player behavior |
| `renderer-svelte` | Texuli appearance integration at the prototype host boundary | Vite setup, shell routing, and runtime bindings |

The non-UI packages `themes`, `charts`, `views`, and `blocks` use the
corresponding Texuli token, math, data, or block APIs.

## The dev server

Texuli is installed in `node_modules`, so `@protoyard/renderer-svelte` does
not need to expose a linked Texuli source tree through Vite's `/@fs` allowlist.
The dev server helper remains for consumers that link local packages.

## Using a Texuli package

Import only documented package exports. For example:

```svelte
<script lang="ts">
  import { Button } from '@protoyard/ui';
</script>

<Button>Save</Button>
```

When a package adapter needs a Texuli API directly, use its exported
subpath—for example `texuli/button`, `texuli/icons`, or
`@texuli/data/board/engine`—rather than a deep `src/` path. The package
manifest's `exports` map is the API boundary.

## Verified

The public-docs, adoption, package, component and runtime tests are the source
of truth for current behavior. Useful checks include:

| Command | What it proves |
| --- | --- |
| `pnpm exec tsx scripts/check-texuli-adoption.ts` | The nine adoption rules and pending/gap ratchet |
| `pnpm exec tsx scripts/check-texuli-latest.ts [--registry]` | Exact, consistent Texuli pins from npm; with `--registry`, equal to npm `latest` |
| `pnpm vitest run tests/adoption` | Rule matching, strict mode, gap allowances, exception records and pending cleanup |
| `pnpm vitest run packages/ui` | The shared Texuli-backed component API and Protoyard wrapper contracts |
| `pnpm check:packages --filter @protoyard/ui` | The packed public component exports and declarations |

## Limits

Texuli gaps are release-dependent; check the gap tracker before choosing an
adapter or claiming support. Protoyard verifies its use against the published
package declarations and runtime. It does not replace Texuli's own package
tests or claim that simulated prototype behavior is a real backend.

## Views from `@texuli/data`

### Engines (`@protoyard/views`)

Board, calendar, timeline, grid, tree, map, activity, and files use the
corresponding `@texuli/data` engine exports. Protoyard retains extension
engines such as editor, notifications, settings, states, commands, and
scenarios where they express Protoyard-specific contracts or tracked gaps.

### UI (`@protoyard/views-ui`)

Each rich view is a thin host adapter over Texuli's matching public view
export, with liveQuery and service callbacks where the Protoyard runtime API
differs. The grid filter/saved-view toolkit, tree outline editor, map routes
and fences, and other host-only behavior remain Protoyard extensions while
the relevant APIs are gaps. Consult `tests/adoption/texuli-gaps.json` and the
package pending list for current gap ids and affected files.

## Texuli gaps

`tests/adoption/texuli-gaps.json` is the authoritative list. Texuli 0.10.0
fixed G100–G124 and 0.11.0 fixed G125–G127 and G130, so their adapters and
`it.fails` pins are gone. Each of these changed Protoyard code:

- `@texuli/tokens/system.css` (system tokens without the reset, G110) replaces `base.css`.
- `CommandPalette` has a `searchLabel` (G108).
- The date range picker announces the pending end date (G109).
- The inbox has its own mark-all callback (G106).
- `FilterBuilder` takes host issues (G101).
- The board and calendar fixes (G103, G104).
- Entity forms are one `SchemaForm` with hosted custom fields (G113–G121).
- The doc editor is `@texuli/pages/editor-core` with host-painted blocks (G111, G123).
- Deck print goes through `@texuli/slides/export-core` (G105).
- `@protoyard/themes` reads its theme id lists from `@texuli/tokens/library-ids` (G125).

G128 (a square theme radius written as unitless `0`) and G129 (password
fields could not ask for `autocomplete: 'off'`) are fixed in 0.11.2. The SaaS
kit's password fields use Texuli's type with `off`, and
`@protoyard/themes` keeps writing any custom theme's zero radius as `0px`.

G131–G134 are fixed in 0.11.3 and adopted:

- A `phone`-format text field is a telephone input (G131), so the phone
  sign-in no longer needs `TelInput`.
- `anchorFor` keeps host heading ids (G132).
- `@texuli/document/schema-core` validates without the deck model (G133).
- `SchemaForm` follows `disabled` and `readOnly` after mount (G134), so the
  MFA form no longer remounts.

G135 (`fromTheme` could return a document the compiler refused) is fixed in
0.11.4, and `designSystemFromTheme` calls Texuli's `fromThemeWithReport`
directly.

G136 is fixed in 0.12.0: the `@texuli/pages` core entries no longer carry the
deck model. `DocEditor` passes no `validateDeck`, because Protoyard docs never
hold inline decks, so the slash menu offers no inline deck that a save would
refuse.

Texuli 0.12.1 adds `coverHeadingLevel` (1 or 2) to `@texuli/slides`
`DeckStage` and `DeckStageCore`, for a deck embedded in a page that has its
own h1. Protoyard does not pass it: page and doc documents refuse inline decks,
and a deck prototype is its own page, so the cover title stays the page's h1.

Won't fix: G137. Texuli keeps `@texuli/deck/schema` as the validator's schema
kit (8.77 KiB gzip). Moving it would save no bytes, and Texuli's layer rule
forbids it.

No gap is open.

The doc reading view stays `DocHost` for size, because Protoyard's Markdown
text blocks need the codec; see Documents above.

Texuli 0.10.0 also removed the tree block's `style` alias (Protoyard's
blocks-ui adapter passes `variant`) and the 0.8 MCP tool names, which Protoyard
never used.
