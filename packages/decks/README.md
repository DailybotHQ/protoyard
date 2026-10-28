# @protoyard/decks

Protoyard's deck engine ([ADR-038](../../docs/DECISIONS.md)), a thin layer
over [`@texuli/deck`](../../../texuli/packages/deck/README.md) (Texuli
ADR-009). Protoyard keeps what is its own: the deck shape a `kind: "deck"`
blueprint stores (`{ style, slides, outline? }`, zod, for the blueprint
envelope, the TypeScript types and `DeckJsonSchema`), its offline media and
link policy, its theme ids and font pairings, the agent slide references,
Deck Studio's edits, the word-count, step-marker and boilerplate lint rules
it keeps, and the Markdown-to-blueprint bridge. The deck model, validation,
layout catalog, steps and fragments, transitions, navigation and hash routes,
the controls registry, input decisions, the virtual canvas, backgrounds and
their contrast math, the presenter protocol, lint, RFC 6902 patches and the
text twins come from `@texuli/deck`: a stored Protoyard deck is migrated with
`migrateDeck` (detected as `protoyard`) and validated with `parseDeck`. It has
no Svelte. [`@protoyard/decks-ui`](../decks-ui/README.md) presents decks on
the `@texuli/slides` stage.

This README names every runtime export. `tests/readme-sync.test.ts` keeps
three parts generated from the code: the layout table, the limits table and
the controls table (and the decks-ui keyboard table).

## Exports

| Import | What it provides |
| --- | --- |
| `@protoyard/decks` | **Texuli bridge:** `checkProtoyardDeck` (migrate and validate a Protoyard deck: errors, warnings and the model deck), `toTexuliDeck` (the model deck a validated Protoyard deck presents as). **Canvas** (the engine's): `DECK_ASPECTS`, `DEFAULT_DECK_ASPECT`, `isDeckAspect`, `deckCanvasSize`, `DECK_TEXT_MINIMUMS`. **Catalog:** `DECK_LAYOUTS`, `DECK_LAYOUT_BY_ID`, `DECK_LAYOUT_IDS`, `LAYOUT_PACING`, `getDeckLayout`, `parseLayoutProps`, `describeLayouts`. **Navigation** (the engine's): `createDeckNavigator`, `parseDeckHash`, `formatDeckHash`, `parseDeckRoute`, `slidePositionCount`, `DECK_HASH_ID_MAX`, `DECK_HASH_STEP_MAX`. **Controls** (the engine registry in Protoyard's shape): `DECK_CONTROLS`, `deckControlFor`, `availableDeckControls`, `deckKeyBindings`, `DECK_KEY_BINDINGS`, `DECK_CONTROL_GROUPS`, `DECK_CONTROL_ICONS`, `DECK_CONTROL_CAPABILITIES`, `DEFAULT_DECK_CONTROL_ENVIRONMENT`. **Input** (the engine's): `decideDeckInput`, `inputPathFrom`, `DECK_INPUT_ACTIONS`, `DECK_ESCAPE_ORDER`, `DECK_CHROME_ATTRIBUTE`, `DECK_SWIPE_MIN_DISTANCE`, `DECK_SWIPE_AXIS_RATIO`, `DECK_SWIPE_MAX_DURATION_MS`, and `DECK_INTERACTIVE_ATTRIBUTE` (the marker `@protoyard/blocks-ui` puts on blocks with their own controls). **Steps and motion** (the model's): `slideSteps`, `slideStepCount`, `slideFragments`, `fragmentPhase`, `activeCodeHighlight`, `FRAGMENT_EFFECTS`, `DECK_TRANSITIONS`, `DEFAULT_TRANSITION`, `DEFAULT_MOTION`, `MAX_MOTION_MS`, `REDUCED_FADE_MS`, `resolveSlideTransition`, `resolveDeckTransitions`, `resolveFragmentMotion`, `effectiveMotion`. **Backgrounds:** the model's resolver and contrast math (`resolveDeckBackground`, `chooseInk`, `compositeOver`, `sampleGradient`, `worstContrast`, `DECK_TEXT_CONTRAST_MIN`, `DECK_BACKGROUND_PRESETS`, `DECK_BACKGROUND_PRESET_IDS`, `DECK_GRADIENT_IDS`, `DEFAULT_DECK_BACKGROUND`), Protoyard's `DeckBackgroundSchema`, `DeckBackgroundSpecSchema` and offline media policy `checkDeckMediaSrc`. **Untrusted input:** `loadUntrustedDeck`, `DEFAULT_UNTRUSTED_DECK_LIMITS`, `stripHiddenCharacters`. **Presenter protocol** (the engine's): `PRESENTER_MESSAGE_TYPES`, `parsePresenterMessage`, `presenterMessage`, `presenterChannelName`, `sanitizeNamespace`, `createBroadcastPresenterTransport`, `createMemoryPresenterTransport`. Plus the matching types. |
| `@protoyard/decks/schema` | `DeckSchema`, `DeckStyleSchema`, `DeckSlideSchema`, `CatalogSlideSchema`, `FreeSlideSchema`, `CustomSlideSchema`, `CustomSlideComponentIdSchema`, `isCustomSlide`, `DeckOutlineSchema`, `DeckSectionSchema`, `DeckAspectSchema`, `DeckDensitySchema`, `DeckRadiusSchema`, `DeckMotionSchema`, `DeckJsonSchema` (Draft 2020-12), `safeParseDeck`, `DECK_LIMITS`, and the deck types. The zod part is Protoyard's deck shape; its refinement runs Protoyard's media and link policy, then `checkProtoyardDeck` (the model's validation). `@protoyard/blueprint`'s `kind: "deck"` branch validates its body with this schema. |
| `@protoyard/decks/layouts` | The catalog from `DECK_LAYOUTS` in `@texuli/deck/model`, in Protoyard's shape: `DECK_LAYOUTS` (each entry's `propsSchema` is its JSON Schema, built on first read; `sample` uses local media; `chart` keeps Protoyard's `ChartSpec`), `DECK_LAYOUT_BY_ID`, `DECK_LAYOUT_IDS`, `LAYOUT_PACING`, `getDeckLayout`, `parseLayoutProps` (the model's props validation, step markers removed, links by Protoyard's policy), `stripStepMarkers`, `describeLayouts`, and where each layout reveals a step marker: `DECK_LAYOUT_STEPPABLE`, `isSteppablePropPath`, `steppablePattern`, `stepMarkersOutsideLayout`. |
| `@protoyard/decks/style` | How a deck's theme reaches the stage: `deckThemeKey` (a theme id, `seed-<hex>` for a palette seed, or the default `DEFAULT_DECK_THEME_ID`) and `loadDeckTheme` (the six built-ins, the 64-theme library and seeds through `@protoyard/themes`, with the deck's font pairing, as a Texuli theme; unknown ids fall back with warnings). `@protoyard/decks/style/key` holds `deckThemeKey` alone, for the deck entry. |
| `@protoyard/decks/quality` | `DECK_QUALITY` thresholds, `DECK_QUALITY_RULES`, `DECK_QUALITY_RULE_BY_ID`, `checkDeckStatic` (the model's `lintDeck` with Protoyard's rule ids and paths, plus Protoyard's own `too-many-words`, `step-unrevealed`, `notes-boilerplate` and `unknown-background` checks on the stored deck), `deckJsonPath`. Renderers never import it. |
| `@protoyard/decks/text` | The text twins (the model's `deckToText` and `deckOutline` on the migrated deck): `deckToMarkdown`, `deckOutline`, `formatDeckOutline`, `slideTitle`; `escapeText`, `escapeInline`, `stripInvisible`; and the shared safety rules for text that leaves a deck: `isInvisibleCodePoint`, `inertJson`, `isSafeDeckPath`, `isSafeShareId` and `SAFE_SLUG`. |
| `@protoyard/decks/markdown` | `parseMarkdownDeck`: a Markdown deck (the `@texuli/deck` dialect) read into a validated Protoyard deck, every issue with its line and column; what a Protoyard deck cannot hold (component slides, math, embedded themes) is reported. `protoyard deck from-markdown` uses it. |
| `@protoyard/decks/presenter` | The presenter protocol the stage and its presenter window speak (the engine's): `PRESENTER_MESSAGE_TYPES`, `PRESENTER_PROTOCOL_VERSION`, `parsePresenterMessage`, `isPresenterMessage`, `presenterMessage`, `presenterChannelName`, `sanitizeNamespace`, `createBroadcastPresenterTransport`, `createMemoryPresenterTransport`, `createPresenterTransport`. Messages are closed shapes; nothing is executed. |
| `@protoyard/decks/agent` | "Debug for agents": `describeSlideForAgent`, `formatAgentReference`, `parseAgentReference`, `safeAgentSource` (drops a source with shell syntax or a path escape), `cleanReferenceText`, `capText`, `jsonPointer`, `referenceBytes`, `AGENT_REFERENCE_FORMAT`, `AGENT_REFERENCE_VERSION`, `AGENT_REFERENCE_LIMITS`, `AGENT_REFERENCE_MAX_BYTES`, `AGENT_REFERENCE_FORMATS`, `SLIDE_REF_PREFIX`. |
| `@protoyard/decks/patch` | Deck Studio's engine: `applyDeckEdits`, `deckEditsToPatch`, `compatibleLayouts`, `deckStudioOptions`, `DECK_STUDIO_STYLE_KEYS`, `DECK_STUDIO_SLIDE_KEYS`, `applyDeckPatch` (the model's RFC 6902 patch; returns the document or throws `DeckPatchError`, never half-applies, never replaces the root), `DECK_PATCH_MAX_OPS` (1,000), `DeckPatchError`, `parsePointer`, `formatPointer`, `jsonEquals`. |
| `@protoyard/decks/style/key` | `deckThemeKey`, `DEFAULT_DECK_THEME_ID` (no theme registry). |

## The deck schema

A deck is `{ style, slides, outline? }`, and every object is strict, so unknown keys fail.

- **Catalog slides** are `{ id, layout, props }`. `layout` must be a catalog id, and `props` must
  pass that layout's schema; see "Loading untrusted decks" below.
- **Free slides** are `{ id, layout: "free", blocks }`, with `@protoyard/blocks` content.
- **Custom slides** are `{ id, layout: "custom", props: { component, data? } }`
  (`CustomSlideSchema`, `isCustomSlide`): a generated deck renders the component registered under
  `component` in its `src/custom-slides.ts`; the player shows a placeholder. `component` is a slug,
  `data` is bounded like catalog props (and its links and media follow the deck policies), steps
  come from the `steps` labels only, and `checkDeckStatic` reports a `custom-slide` warning.
  `free` and `custom` are never catalog layout ids.
- **Shared slide fields:** `title`, `background` (a preset id or a validated image/video spec; an
  unknown slug from an older deck still parses, renders `solid-color` and warns), `transition`, `steps` (labels),
  `notes` and `hidden`.
- **Slide ids** are unique lowercase slugs.
- **An outline** groups existing slide ids into sections.
- **`safeParseDeck(value)`** returns the typed deck or issues with a stable `jsonPath` for
  authoring feedback.

<!-- deck-limits:start (generated by packages/decks/tests/readme-sync.test.ts) -->
| `DECK_LIMITS` key | Bounds | Limit |
| --- | --- | ---: |
| `slides` | Slides per deck | 200 |
| `sections` | Outline sections | 200 |
| `sectionSlides` | Slide ids per outline section | 200 |
| `slideTitle` | Slide title characters | 160 |
| `slideNotes` | Speaker notes characters per slide | 2,000 |
| `sectionTitle` | Section and outline title characters | 120 |
| `stepLabel` | Characters per step label | 80 |
| `steps` | Step labels per slide (and steps played separately) | 32 |
| `propsKeys` | Keys per catalog props object | 100 |
| `propsArray` | Items per catalog props array | 200 |
| `propsDepth` | Nesting depth of catalog props | 4 |
| `propsString` | Characters per catalog props string | 2,000 |
| `freeBlocks` | Blocks per free slide | 2,000 |
<!-- deck-limits:end -->

## Loading untrusted decks

`loadUntrustedDeck(textOrData, limits?)` loads a deck from a link, a paste, a file, an embed message
or an artifact. It never throws and never fetches, runs or renders anything. Cheap checks run
**before** zod, so hostile input never costs a deep parse:

1. **Size and depth.** At most 1 MiB of UTF-8 JSON and 32 levels, scanned on the text.
2. **A plain-data copy.** The loader refuses accessors (they are never called), holes, cycles, class
   instances, symbols, NaN and `__proto__` / `constructor` / `prototype` keys. It strips control and
   bidirectional characters from strings, keeping newlines and tabs.
3. **Counts.** At most 200 slides and 20,000 block nodes across free slides.
4. **`safeParseDeck`.** It enforces the rules below.

Issues carry a `code` (`invalid-input`, `invalid-json`, `too-large`, `too-deep`, `too-many`,
`unsafe-key` or `invalid-deck`), a `jsonPath`, a message and a fix.

`DeckSchema` itself enforces three things:

- **The layout catalog.** A catalog slide's `layout` must be a catalog id, and its `props` must
  pass that layout's props schema (`parseLayoutProps`). Diagnostics point into the props
  (`$.slides[3].props.steps`).
- **Step markers.** `{ step, fragment | reveal }` may sit on any props object; `slideSteps` reads
  them. `step` is an integer from 0 to 1,000, `fragment` one of the effects, and `reveal` one of
  the block reveal words, never both. The markers are checked, then set aside for the props schema,
  and kept in the parsed slide. A `fragment` or `reveal` without `step` is ordinary content, so a
  strict layout refuses it.
- **The media and link policy in props.** Every `src` or `poster` passes `checkDeckMediaSrc`; a
  `src` under `video` is checked as a video. Every `href` passes the blocks link policy: http(s),
  mailto, `#anchor` or relative, never `javascript:` or protocol-relative. Free slides get the
  blocks media policy from `@protoyard/blocks`.

Rendering is the other half: decks-ui shows every deck string as text and has no `{@html}`,
`innerHTML` or eval sink. `decks-ui/tests/hostile-render.test.ts` checks both.

## Layout catalog

```ts
import { DECK_LAYOUTS, describeLayouts, parseLayoutProps } from '@protoyard/decks/layouts';

parseLayoutProps('timeline', { events: [/* 4–8 */] });
describeLayouts(); // agent-readable summary of every layout
```

There are 21 layouts: the 19 primitives from the developer's deck kit, plus `chart` (a chart
spec through `@protoyard/blocks`) and `free` (validated blocks).

Each entry has `id`, `label`, `useWhen`, `dontUseWhen`, `pacing`
(`punch` \| `idea` \| `diagram` \| `story`), size `limits`, a zod `propsSchema`
and a `sample`. AUTHORING consumes the catalog read-only for selection and
lint. No brand hex values and no site-specific class names.

<!-- layout-catalog:start (generated by packages/decks/tests/readme-sync.test.ts) -->
| Layout | Name | Pacing | Limits | Use when |
| --- | --- | --- | --- | --- |
| `title-hero` | Title hero | punch, story | title 1–100 characters; optional subtitle and meta, 160 characters each | The first slide of a deck: title, subtitle, speaker and event. |
| `section-divider` | Section divider | punch | title 1–120 characters; optional eyebrow, 80 characters | Opening a new chapter or section of the deck. |
| `two-column-split` | Two-column split | idea, diagram | exactly two columns; body 1–600 characters each; optional heading, 80 | Two ideas side by side: before and after, problem and solution. |
| `three-column-cards` | Three-column cards | idea, diagram | exactly 3 cards; heading 1–80, body 1–280 characters; optional icon name | Three parallel concepts: pillars, features or principles. |
| `image-left` | Image left | idea, diagram | one image with alt text; body 1–600 characters | Walking through a screenshot, photo or diagram with some text. |
| `image-right` | Image right | idea, story | one image with alt text; body 1–600 characters | The idea comes first and the image anchors it. |
| `image-centered` | Image centered | diagram, punch | one image with alt text; optional caption, 200 characters | A single diagram, screenshot or chart image is the point of the slide. |
| `image-full-bleed` | Image full bleed | punch, story | one image with alt text; optional caption (200) and credit (160) | The image is the message: a hero photo or a quote on an image. |
| `quote` | Quote | punch, story | quote 1–280 characters; optional cite, 120 characters | A short quote that earns a slide of its own. |
| `code-with-callout` | Code with callout | diagram, idea | source 1–8,000 characters, kept verbatim; 1–6 bullets of up to 200 characters; up to 16 highlight ranges, each revealed as a step | Explaining what a short piece of code does. |
| `big-stat` | Big stat | punch | number 1–32 characters; label 1–200 characters; optional context and source | A single number makes the case: adoption, scale, time saved. |
| `comparison-table` | Comparison table | diagram, idea | 2–4 columns; 3–5 rows; every row has one value per column | Comparing 2–4 options across 3–5 attributes. |
| `process-steps` | Process steps | idea, diagram | 3–5 steps; title 1–80, optional body 200 characters | A 3–5 step process or workflow. |
| `timeline` | Timeline | story, diagram | 4–8 events; time 1–40, text 1–200 characters | 4–8 dated events that form a story arc. |
| `team-avatars` | Team avatars | idea, story | 1–8 people; name 1–80, optional role 80; optional avatar id or media source | Introducing the team or the co-presenters. |
| `closing-cta` | Closing call to action | punch, story | title 1–120 characters; one link: label 1–60, href up to 512; optional footnote | The final slide: what to do next and where to go. |
| `video-centered` | Video centered | diagram, story | one video; optional caption, 200 characters | A single demo, trailer or explainer clip is the point of the slide. |
| `video-left` | Video left | idea, diagram | one video; body 1–600 characters | Walking through a demo or clip with some text. |
| `video-right` | Video right | idea, story | one video; body 1–600 characters | The idea comes first and the clip shows it. |
| `chart` | Chart | diagram, idea | spec: a chart block without `type`, checked by the stage chart block parser; spec JSON: depth 6, 100 keys per object, 400 items per array; optional height (sm, md, lg) and data table | A trend or a distribution is clearer as a chart than as a number or a table. |
| `free` | Free blocks | punch, idea, diagram, story | 1–2,000 top-level blocks; lint warns past 48; each block follows the blocks schema and may carry step fields | No catalog layout fits the idea; compose it from content blocks. |
<!-- layout-catalog:end -->

### Style and themes

The stage resolves `style` (aspect, density, radius, motion, transition,
backgrounds, logo, footer, slide numbers, progress) with `@texuli/deck`.
Protoyard resolves only the theme: `deckThemeKey(style)` names it (a theme id,
`seed-<8 hex digits>` for `paletteSeed`, else the default `violet`) and
`loadDeckTheme(key, fontPair)` turns it into a Texuli theme through
`@protoyard/themes` (`toTexuliTheme`), with the deck's font pairing. An unknown
theme or font pairing falls back with a warning; DeckApp shows it.

## The virtual canvas

The fixed virtual canvas is the engine's (`deckCanvasSize`: 1280 × 720 for
16:9, 1024 × 768, 720 × 1280, 1080 × 1080). Lint thresholds are in canvas
pixels: `DECK_TEXT_MINIMUMS` (24 px body, 18 px labels).

## Navigation, input and the presenter protocol

These are `@texuli/deck/engine`'s, re-exported: `createDeckNavigator` reads a
Protoyard deck as is (hidden slides skipped, `steps` labels and step markers
counted; `stepCount` is a slide's last step, so positions run `0 …
stepCount`); `slidePositionCount(slide)` is `stepCount + 1`; hash routes are
`#/<slide-id>/<step>` (`parseDeckHash`, `formatDeckHash`, `parseDeckRoute`
with the `?print=1` and `notes=1` flags); `decideDeckInput` maps keys, clicks
and swipes through the controls registry; the presenter protocol is a closed
`{ type, slideId, step }` message on `texuli-deck-presenter/1:<namespace>`.
The `@texuli/slides` stage runs all of them; Texuli's tests cover them.

### Controls

`DECK_CONTROLS` describes every deck control once, and everything that shows or
runs a control reads it: the toolbar, its tooltips, the help dialog, this table
and `protoyard deck capabilities`. The input guard derives its key maps from it,
so a label, a shortcut and what the key does cannot drift apart.

Each control has:

- `id` and `action` (one control per `DeckInputAction`);
- a `group` (`navigate`, `view`, `present`, `share`, `help`, `debug`);
- a short `label` and a one-sentence `description` for a first-time viewer;
- its `keys` (`KeyboardEvent.key`, a readable label, Shift and modifier rules,
  and `closes` for `Esc`);
- `toggle` (it turns something on and off), an `icon` id (a Lucide name the
  renderer maps);
- the capabilities it `requires`, and `available(env)`.

A renderer passes what it detected as a `DeckControlEnvironment` (`fullscreen`,
`popup`, `clipboard`, `print`, `debug`). `availableDeckControls(env)` and
`deckKeyBindings(env)` list only what works there.
`DEFAULT_DECK_CONTROL_ENVIRONMENT` is a normal viewer's browser, with debug off.
The input guard needs two facts of deck state for the new keys: `fullscreen`
(`Esc` leaves full screen once nothing else is open) and `debugAvailable` (`D`
opens debug).

<!-- controls:start (generated by packages/decks/tests/readme-sync.test.ts) -->
| Control | Group | Label | Keys | Available | What it does |
| --- | --- | --- | --- | --- | --- |
| `prev` | navigate | Previous step or slide | `←`, `↑`, `Page Up`, `Shift + Space`, `Backspace` | always | Goes back one step, or to the previous slide. |
| `jump` | navigate | Choose a slide | — | always | Opens the slide list so you can jump directly to a slide. |
| `next` | navigate | Next step or slide | `→`, `↓`, `Page Down`, `Space`, `Enter` | always | Shows the next step, or advances to the next slide. |
| `first` | navigate | First slide | `Home` | always | Jumps to the first slide. |
| `last` | navigate | Last slide | `End` | always | Jumps to the last slide. |
| `overview` | view | Overview of all slides | `O`, `Esc` | always | Shows every slide as a grid. |
| `fullscreen` | view | Full screen | `F` | fullscreen | Fills the screen with the slides. |
| `fullscreen-exit` | view | Leave full screen | `Esc` | fullscreen | Returns the deck to its normal place. |
| `presenter` | present | Presenter view | `S`, `P` | always | Shows notes, the next slide and timers. |
| `blackout` | present | Black out the screen | `B`, `.`, `Esc` | always | Turns the screen black. |
| `laser` | present | Laser pointer | `L`, `Esc` | always | Turns the pointer into a bright dot. |
| `copy-link` | share | Copy link to this slide | — | clipboard | Copies a link to this slide and step. |
| `print` | share | Print, one slide per page | `Ctrl + P`, `⌘ + P` | print | Prints the deck or saves it as a PDF. |
| `help` | help | Controls and shortcuts | `?`, `Esc` | always | Lists every control and its keys. |
| `debug` | debug | Debug for agents | `D`, `Esc` | debug | Shows this slide source, checks and reference. |
<!-- controls:end -->

## Steps and motion

A slide starts at step 0, and each "next" advances one step until the slide
has none left. `slideSteps(slide)` derives the steps from what the slide
renders:

- **Free slides.** Each block's `step` and `reveal` become a fragment. A code
  block's stepped `highlights` take one step each, starting at the block's own
  step.
- **Catalog slides.** Any object in `props` with an integer `step`, plus
  optional `fragment` (any effect) or `reveal` (the block vocabulary), is a
  fragment.

**Where a catalog layout reveals a marker** (`DECK_LAYOUT_STEPPABLE` in
`@protoyard/decks/layouts`; paths relative to `props`, `*` for each list
item). The designed renderers in decks-ui hide that element until its step:

| Path | Layouts | What hides |
| --- | --- | --- |
| `''` (the props object) | every catalog layout | the whole slide body; the background stays |
| `left`, `right` | `two-column-split` | one side |
| `cards.*`, `steps.*`, `events.*`, `rows.*`, `people.*` | `three-column-cards`, `process-steps`, `timeline`, `comparison-table`, `team-avatars` | one card, step, event, row or person |
| `image` | `image-left`, `image-right`, `image-centered`, `image-full-bleed` | the media pane |
| `video` | `video-left`, `video-right`, `video-centered` | the media pane |
| `code` | `code-with-callout` | the code panel (its highlights still step from the same base) |
| `cta` | `closing-cta` | the call-to-action button |
| `spec` | `chart` | the chart |

A marker anywhere else (inside a chart spec's series, say) still adds a step,
but nothing hides. `stepMarkersOutsideLayout(slide)` lists those paths, and
`isSteppablePropPath(layout, path)` answers for one. The step model itself is
unchanged, so decks without new markers keep their step counts.

Distinct authored step numbers are renumbered 1, 2, 3…, so order is always
monotonic and gaps never cost an empty click. Fragments at step 0 belong to the
initial state. `slide.steps` labels name the steps and can extend the count. A
slide has at most 32 steps; later ones play together on the last step, and the
result carries a warning.

The fragment effects are `fade-up`, `in`, `out`, `in-then-out`, `grow`,
`shrink`, `highlight` and `strike`. `fragmentPhase(fragment, current)` tells a
renderer whether a fragment is `visible` and whether its effect is `active`:

- an `out` fragment disappears at its step;
- an `in-then-out` fragment is shown only on its step;
- `highlight`, `strike`, `grow` and `shrink` stay visible and switch on at
  their step.

`activeCodeHighlight` returns the line spec to highlight at a step. A catalog
code prop (`{ source, highlights }`, as in `code-with-callout`) steps its
highlights like a code block does.

Navigation counts positions: a slide with N steps has N + 1 positions
(`slidePositionCount(slide)` is `1 + slideStepCount(slide)`); the engine
navigator's `stepCount` is the last step (N).

Transitions (`none`, `fade`, `fade-up`, `slide`, `zoom`, `morph`) and the
motion levels (`full`, `subtle`, `none`, and the viewer's reduced-motion
preference, which only lowers the level) are the model's
(`resolveSlideTransition`, `resolveDeckTransitions`, `resolveFragmentMotion`,
`effectiveMotion`; durations capped at `MAX_MOTION_MS`, a reduced-motion fade
of `REDUCED_FADE_MS`). The `@texuli/slides` stage plays them.

## Backgrounds

The 13 presets, media specs, the resolver and its contrast guarantee (a scrim
keeps slide text at `DECK_TEXT_CONTRAST_MIN`, 4.5:1, against the worst point)
are the model's (`resolveDeckBackground`, tested in `@texuli/deck` for every
library theme in light and dark). Protoyard keeps `DeckBackgroundSchema` for
its deck shape and `checkDeckMediaSrc`, its offline media policy: relative
paths, bounded `data:` raster images or web video, and library avatars; no
remote media, no SVG. An unknown preset slug from an older deck still opens:
migration paints `solid-color` and `checkDeckStatic` warns
(`unknown-background`).

## Quality rules (`@protoyard/decks/quality`)

Deck quality thresholds and static checks, as data. They are ported from the
developer's keynote QA scripts. `deck lint` and the visual sweep both read
them, so no rule is declared twice.

- **`DECK_QUALITY`:**
  - minimum rendered text: 24 px body and 18 px labels on the canvas (the same
    values as `DECK_TEXT_MINIMUMS`);
  - notes of at least 40 characters;
  - at most two identical layouts in a row;
  - visible words per pacing type: punch 15, idea 45, diagram 60, story 50;
  - phrases that mark boilerplate notes.
- **`DECK_QUALITY_RULES`:** every rule with its `severity` and where it runs.
  `static` rules run in `checkDeckStatic`; `rendered` rules (font size,
  overflow, failed images, contrast) need a browser and run in the visual
  sweep. Structure, assets and step order are errors. Notes, density and
  repetition are warnings.
- **`checkDeckStatic(deck)`** takes a deck that passed `safeParseDeck` and
  returns `{ ok, errors, warnings, issues }`. Each issue has its `rule`,
  `severity`, `slideId`, `path` and a schema-style `jsonPath`
  (`$.slides[2].props.image.alt`). It checks:

  | Rule | Severity | What it flags |
  | --- | --- | --- |
  | `unknown-layout` | error | A layout the catalog does not have |
  | `layout-props` | error | Props that break the layout's schema and limits (paths from `parseLayoutProps`) |
  | `image-alt` | error | An image in props with no alt text |
  | `image-size` | error | An image in props with no width and height |
  | `step-order` | error | A fragment that reveals before content above it, in reading order (columns included) |
  | `empty-steps` | warning | More step labels than fragments |
  | `unknown-background` | warning | A slide `background` that is neither a preset id nor a media spec: it still parses (older decks keep opening) and renders `solid-color` |
  | `custom-slide` | warning | A `layout: "custom"` slide: it runs only in a generated deck; the player shows a placeholder |
  | `step-unrevealed` | warning | A step marker where the layout reveals nothing (inside a chart series, say): see `DECK_LAYOUT_STEPPABLE` |
  | `notes-missing` | warning | Notes absent or under 40 characters |
  | `notes-duplicate` | warning | The same notes as an earlier slide, ignoring case and punctuation |
  | `notes-boilerplate` | warning | Notes that only say not to read the slide |
  | `layout-repetition` | warning | A third (or later) visible slide in a row with the same layout |
  | `too-many-words` | warning | More visible words than the layout's most lenient pacing allows; code and alt text do not count |

  Hidden slides are still checked for structure, assets and step order, but
  not for notes, words or repetition. Image blocks on free slides already
  require alt (or `decorative`) and a size in their schema.

The subpath is 21.8 KB gzip minified with zod external. Most of that is the
layout catalog and the block schemas it validates against. Only authoring
tools and the sweep import it.
## Debug for agents (`@protoyard/decks/agent`)

A structured reference to the slide on screen, for a person to paste to a
coding agent. It is inspired by the developer's dev-only `[slide-ref]` button
on xergioalex.com, with what an agent needs to change the slide without
reading source.

```ts
import { describeSlideForAgent, formatAgentReference } from '@protoyard/decks/agent';

const record = describeSlideForAgent(deck, { slideId: 'loop', step: 1 }, {
  deckId: 'protoyard-create-anything',
  source: { kind: 'blueprint', value: 'blueprints/decks/protoyard-create-anything.json' },
});
formatAgentReference(record, 'line');
// [slide-ref] deck=protoyard-create-anything id=loop position=7/25 step=1/2 layout=free pointer=/deck/slides/6 source=blueprint:blueprints/decks/protoyard-create-anything.json text="From brief to shared artifact …"
```

- **The record** (`protoyard.slide-ref` version 1):
  - the deck id, title and visible-slide count;
  - the source (a blueprint path, a prototype slug or a share id), when the
    host knows it;
  - the slide id, layout, title and index;
  - `position` among visible slides (as the deck shows it);
  - `step` and `steps`: the hash step runs from 0 to `steps`;
  - JSON pointers for the slide (`/deck/slides/6`, rooted at `pointerBase`,
    `/deck` by default), a catalog slide's props and every block, nested
    blocks included (`…/blocks/1/columns/0/0`, `…/panels/1/blocks/0`);
  - block types and ids;
  - a visible-text excerpt (markup and notes excluded), whether speaker
    notes exist, the slide's lint findings (`checkDeckStatic`) with
    pointers, the hash, and the page URL for http(s) hosts.
- **The location** resolves the way `DeckApp` resolves it: an unknown or
  hidden id opens the first visible slide, and the step is clamped.
- **Formats** (`formatAgentReference`):
  - `line`: the site's one-line format, plus layout, pointer and source;
  - `markdown`: a paste-ready prompt with where the slide lives and how to
    change and check it, with the slide text fenced as untrusted data;
  - `json`: the record.

  The Markdown names `protoyard deck inspect`, `deck lint` and `deck schema`
  (the PLAN_006 deck command group) and `blueprint validate`.
- **`parseAgentReference(text)`** reads a `[slide-ref]` line back, ours or
  the site's, for `deck inspect --ref`.
- **Untrusted text:** every deck string passes through `cleanReferenceText`
  (no control, zero-width or bidirectional characters, whitespace squashed).
  The line form escapes quotes and backslashes and keeps tokens free of
  spaces, quotes and `=`. Every field is capped (`AGENT_REFERENCE_LIMITS`:
  48 blocks, 12 findings, a 280-character excerpt…). The serialized record
  stays at or under 8 KB: blocks, then findings, then the excerpt are cut,
  and `truncated` is set.
- **Pure and deterministic:** no DOM, clock or randomness, so the same deck
  and location always give the same record.

## Text twins

`@protoyard/decks/text` turns a deck into text with pure, deterministic
functions: the same deck always gives the same output, with no dates, random
ids or locale formatting.

- **`deckToMarkdown(deck, { title?, includeHidden?, notes? })`** is a Markdown
  twin for accessibility, artifact descriptions, LLM context and the
  "Markdown next to every deck" idea:
  - The `# title` is the outline title, then `options.title`, then "Deck".
  - Outline sections become `##` headings, and slides outside every section
    come under "Other slides".
  - Each slide is a numbered heading with its title, its body, and its speaker
    notes under a "Notes" heading (`notes: false` leaves them out).
  - Hidden slides are skipped unless `includeHidden` is set.
  - Catalog layouts render from their validated props.
  - A layout whose props fail their schema, or an unknown layout, lists every
    prop string by key path.
  - Free slides render their blocks.
  - Charts become a caption plus a data table, with one row per label and one
    column per series.
- **`deckOutline(deck)`** returns one row per slide (`number`, `id`, `layout`,
  `title`, `section`, `hidden`). `formatDeckOutline` prints it as lines such as
  `3. growth · chart · Tickets per month`. `slideTitle(slide)` is the title
  both use: the slide's own title, else the layout's `title`, `heading` or
  `number` prop, else the first heading block, else a shortened quote.

Deck data is untrusted, so nothing from it can become Markdown structure:

- Plain strings are escaped by context. Inline syntax and HTML characters are
  escaped everywhere; `#`, `-`, `+`, `=` and `1.` only where they would start
  a block.
- Bare `https://` and `www.` URLs are broken so they never turn into links.
- Control, zero-width and bidi characters (Trojan Source) are removed.
- Author Markdown (text blocks, list items, callout and card bodies…) is
  parsed with `@protoyard/ai/markdown` and serialized back from that safe
  AST, never copied as a raw string. Raw HTML stays escaped text, and only
  links and images that passed `safeHref` / `safeImageSrc` stay links.
  Author headings are demoted below the slide heading.
- Code goes in a fence longer than any backtick run inside it.
- Inline `data:` images are replaced by their alt text.

## Known limits

- **No remote media at level 1.** Background and layout media must be relative paths inside the
  deck, bounded `data:` URIs or library avatars (`checkDeckMediaSrc`). This matches the player and
  artifact CSP. There are no iframe backgrounds.
- **Media backgrounds are per slide.** `slide.background` takes an image or video spec;
  `style.background` (the deck-wide default) takes only a preset id.
- **Presenter needs a same-origin peer.** The `@texuli/slides` stage opens the presenter view
  beside the slides and, on request, a second window over `BroadcastChannel`; cross-origin and
  other devices are out of scope.
- **No math, component slides or vertical stacks in Protoyard decks yet.** The deck model has
  them; Protoyard's deck shape does not, and `parseMarkdownDeck` reports them. No highlight.js:
  code highlighting comes from the blocks tokenizer.
- **Rendered checks need a browser.** `checkDeckStatic` covers structure, assets, steps, notes and
  density; font size, overflow and contrast on real pixels belong to the visual sweep.

## Tests

```bash
pnpm vitest run packages/decks
pnpm vitest run packages/decks/tests/readme-sync.test.ts   # README tables vs the code
pnpm vitest run packages/decks/tests/untrusted.test.ts
pnpm vitest run packages/decks/tests/patch.test.ts
pnpm --filter @protoyard/decks typecheck
```

Regenerate the generated README tables after changing the catalog, limits or key bindings:
`PROTOYARD_UPDATE_README=1 pnpm vitest run packages/decks/tests/readme-sync.test.ts`.
