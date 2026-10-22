# Decks

Protoyard decks are bounded, data-only presentations: a `kind: "deck"`
blueprint holds every slide as JSON, and `@protoyard/decks-ui`'s `DeckApp`
renders it (ADR-038). The same component runs a deck in the no-install player
(`deck.html`), in a quick exploration and in a generated prototype. A deck uses
stable slide ids, and the renderer keeps the current slide and step in the URL
hash as `#/<slide-id>/<step>`, so a copied link opens the same place without a
server or client-side router.

This guide is the product workflow. The API reference lives in the package
guides: [`@protoyard/decks`](../packages/decks/README.md) for the schema,
catalog, navigation, steps, quality rules and text twins, and
[`@protoyard/decks-ui`](../packages/decks-ui/README.md) for `DeckApp`, the
presenter, print and Deck Studio. There is no Reveal.js inside.

## Start a deck

Every command below runs in a clone of this repository.

```sh
# From a brief: a disposable deck in the player, no build.
pnpm protoyard quick "A pitch deck for a fictional bakery ordering service: problem, solution, three features, traction and a closing call to action." --kind deck

# From a catalog deck, or your own JSON file.
pnpm protoyard blueprint validate blueprints/decks/example.json
pnpm protoyard quick --blueprint blueprints/decks/example.json
pnpm protoyard quick serve example-deck --open

# As a prototype you own and build (the deck template, ADR-036).
pnpm protoyard generate rehearsal --blueprint blueprints/decks/example.json --dry-run
pnpm protoyard generate rehearsal --blueprint blueprints/decks/example.json
pnpm protoyard dev rehearsal
```

- `quick` writes `.protoyard/quick/<slug>/` with the blueprint and a launcher.
  With `--kind deck`, the offline brief synthesizer picks an outline (pitch,
  update, training…) and one catalog layout per slide. Without `--kind`, it
  detects decks from cues such as "pitch deck" or "slides".
- `blueprint new --from-brief` does **not** write decks yet. It answers "This
  brief looks like a deck, and generate still expects an app blueprint." Use
  `quick --kind deck`, or write the JSON yourself.
- `quick promote` turns only app explorations into prototypes. For a deck, run
  `generate <slug> --blueprint .protoyard/quick/<exploration>/blueprint.json`.
- The catalog decks live in [`blueprints/decks/`](../blueprints/decks/README.md):
  `example`, `cedar-training`, `harbor-ops-pitch`, `lumen-launch`,
  `northwind-qbr` and `protoyard-create-anything`.
- A generated deck prototype changes through its data. Edit
  `prototypes/<slug>/blueprint.json`, run the same `generate` command again,
  then `validate`. Never edit `src/generated/**`; see
  [GENERATOR](GENERATOR.md).

## The deck JSON

A deck blueprint is the shared blueprint envelope (`formatVersion`, `name`,
`description`, optional `tags`, `icon`, `category` and `brand`) with
`kind: "deck"` and a `deck` object of `{ style, slides, outline? }`. Every
object is strict, so an unknown key fails validation with a JSON path. This
three-slide deck validates and runs as written:

```json
{
  "formatVersion": 1,
  "kind": "deck",
  "name": "Harbor kickoff",
  "description": "A fictional three-slide kickoff deck.",
  "deck": {
    "style": {
      "theme": "aurora-analytics",
      "fontPair": "geometric",
      "aspect": "16:9",
      "transition": "fade",
      "background": "solid-surface",
      "slideNumbers": true
    },
    "slides": [
      {
        "id": "cover",
        "layout": "title-hero",
        "props": { "title": "Harbor kickoff", "subtitle": "Fictional figures only" },
        "notes": "Welcome everyone and set the goal for the next twenty minutes."
      },
      {
        "id": "plan",
        "title": "The plan",
        "layout": "free",
        "steps": ["Scope", "Build", "Ship"],
        "blocks": [
          { "type": "heading", "text": "The plan" },
          { "type": "text", "markdown": "1. Agree on the scope", "step": 1, "reveal": "fade-up" },
          { "type": "text", "markdown": "2. Build the first slice", "step": 2, "reveal": "fade-up" },
          { "type": "text", "markdown": "3. Ship it to the pilot team", "step": 3, "reveal": "highlight" }
        ],
        "notes": "Reveal one step at a time; each arrow press shows the next line."
      },
      {
        "id": "next",
        "title": "Next steps",
        "layout": "free",
        "blocks": [
          { "type": "heading", "text": "Next steps" },
          { "type": "text", "markdown": "Book the **pilot review** for Friday." }
        ],
        "notes": "Close with the one date that matters and who owns the review."
      }
    ],
    "outline": {
      "title": "Harbor kickoff",
      "sections": [{ "id": "main", "title": "Kickoff", "slideIds": ["cover", "plan", "next"] }]
    }
  }
}
```

Save it as `tmp/harbor-kickoff.json`, then run
`pnpm protoyard blueprint validate tmp/harbor-kickoff.json` and
`pnpm protoyard quick --blueprint tmp/harbor-kickoff.json`.

- **Catalog slides** are `{ id, layout, props }`. `props` must pass the layout's
  own schema; the error path points inside it
  (`$.slides[3].props.steps`).
- **Free slides** are `{ id, layout: "free", blocks }` with
  `@protoyard/blocks` content: text, lists, charts, tables, code, people,
  quizzes, polls, forms and the rest of the block catalog.
- **Shared slide fields:** `title`, `background` (a preset id or validated local image/video spec), `transition`,
  `steps` (labels), `notes` (speaker notes) and `hidden`. Hidden slides are
  skipped by navigation, the overview and print.
- **Slide ids** are unique lowercase slugs. They are the deep links, so keep
  them stable when you reorder slides.
- **`outline`** groups existing slide ids into titled sections. Its title is
  the deck's accessible name, and the Markdown text twin uses its sections.
- **`style`** holds the theme, type and shape; see
  [Customize a deck](#customize-a-deck).

The full field list, with every bound, is in the
[deck schema section](../packages/decks/README.md#the-deck-schema) of the
package guide. `@protoyard/decks/schema` also exports `DeckJsonSchema`
(Draft 2020-12) for editors and agents.

## Layouts and when to use them

The catalog has 21 layouts. Each entry carries use metadata that agents and
the brief synthesizer read: `useWhen`, `dontUseWhen`, `pacing` (`punch`,
`idea`, `diagram` or `story`), size `limits`, a props schema and a `sample`
that passes it. `describeLayouts()` from `@protoyard/decks/layouts` prints the
whole catalog as agent-readable text, and `selectDeckLayouts` in
`@protoyard/blueprint` picks one layout per slide deterministically, avoiding
three identical layouts in a row.

| Layout | Use it when |
| --- | --- |
| `title-hero` | Opening slide: title, subtitle and an author or event line |
| `section-divider` | Announcing a new chapter |
| `two-column-split` | Two ideas side by side: before and after, problem and solution |
| `three-column-cards` | Three parallel concepts: pillars, features, principles |
| `image-left`, `image-right` | Walking through one image with text; `image-right` reads text first |
| `image-centered` | One image is the focus, with a title |
| `image-full-bleed` | The image is the message |
| `quote` | One short quote that earns the space |
| `code-with-callout` | Explaining a code block beside it |
| `big-stat` | One number that lands a point |
| `comparison-table` | Two to four options across three to five attributes |
| `process-steps` | A linear process of three to five steps |
| `timeline` | Four to eight dated events forming an arc |
| `team-avatars` | Introducing the team or co-presenters |
| `closing-cta` | The final slide: handle, call to action, contact |
| `video-centered`, `video-left`, `video-right` | A demo or clip, alone or with text beside it |
| `chart` | A real chart is clearer than a big stat or a table |
| `free` | No layout fits: compose validated blocks |

The generated table in the
[layout catalog section](../packages/decks/README.md#layout-catalog) lists each
layout's pacing and limits. It is kept in sync with the code by
`packages/decks/tests/readme-sync.test.ts`.

## Slide design

Each of the 21 catalog layouts has its own composition on the stage: display
titles on covers, dividers and closing slides, a dominant big-stat number, pull
quotes, real two- and three-column grids, numbered process steps with
connectors, timelines on an axis, room-sized comparison tables, team cards with
avatars, media that crops and captions, and a chart whose data table stays
behind its toggle (printed on paper). The type scale follows the stage width,
so 16:9, 4:3, 9:16 and 1:1 stages all read well, and it never drops below the
deck minimums of 24 px body and 18 px labels. Long text clamps, or the content
zooms down to a floor; nothing overflows the stage. Layouts use theme tokens
only, so themes and dark mode apply. The per-layout table and the scale are in
[the decks-ui guide](../packages/decks-ui/README.md#slide-design).

## Steps and step links

A slide starts at step 0. Each "next" advances one step, then moves to the
next visible slide; "previous" walks back the same way. Steps come from:

- **Free slides:** a block's `step` (with an optional `reveal`: `fade`,
  `fade-up`, `grow`, `highlight` or `strike`), and a code block's stepped
  `highlights`.
- **Catalog slides:** any object in `props` with an integer `step` and an
  optional `fragment` (`fade-up`, `in`, `out`, `in-then-out`, `grow`,
  `shrink`, `highlight`, `strike`) or `reveal`.
- **`steps` labels**, which name the steps and can add steps of their own.

Authored step numbers are renumbered densely (2, 5, 7 become 1, 2, 3), and a
slide has at most 32 steps. A slide with N steps has N + 1 positions: step 0
(the initial state) and steps 1 to N. Labels name steps 1, 2, 3…, so three
labels give positions 0 to 3. A link `#/<slide-id>/<step>` opens that exact
position, including the last one. An unknown or hidden slide id opens the
first visible slide, and a step past the slide's last step opens its last step
and rewrites the link to it. The position follows every move, so the address
bar, the presenter and the copy-reference tool always agree.

On screen:

- **Reveals keep the layout still.** A stepped block or catalog item stays in
  the layout while it waits, so nothing jumps: it is invisible, `inert` and
  `aria-hidden` (screen readers are not told about it) until its step, then
  fades in (`fade`, `in`), fades up (`fade-up`), or switches its effect on
  (`grow`, `shrink`, `highlight`, `strike`). `out` and `in-then-out` hide
  again. Going back hides it again.
- **Every catalog prop can take a step.** A marker on the props object
  itself reveals the whole slide body (a `big-stat`, a `quote`, a hero). A
  marker on a nested object reveals what it draws:
  - the `image` or `video` media pane;
  - the `code-with-callout` code panel;
  - the `closing-cta` button;
  - the `chart` spec;
  - a `two-column-split` side.

  On list items it reveals one card, process step, timeline event, table row
  or team member. The full table is in the
  [package guide](../packages/decks/README.md#steps-and-motion).
  - A marker deeper inside a prop (a single chart series) still adds a step,
    but nothing hides. `stepMarkersOutsideLayout` from
    `@protoyard/decks/layouts` lists those markers.
- **Code highlights move per step,** on free code blocks and on the
  `code-with-callout` code: highlight 0 is the initial state and each further
  highlight takes one step.
- **Motion:** reveals animate for 500 ms. The browser's reduced-motion
  preference and the deck's `motion: none` turn the animation off; the
  content still appears on its step.
- **Overview, print and the presenter's next-slide preview** show each slide
  at its last step, with every fragment visible and the last highlight on.
  The slide just before the current one is mounted at its last step, so
  going back shows it complete.

## Navigation

- **Arrow keys** and **Space** advance or go back through authored steps and
  slides. Home and End jump to the first and last visible slide.
- Press **O** to open the overview and select a slide. **Escape** closes an
  open deck overlay.
- Press **F** (or the full screen button) to enter or leave full screen, and
  **Escape** to leave it. Escape first closes a tooltip, the help dialog, the
  overview, blackout or the laser, in that order; the next Escape leaves full
  screen, and the keyboard stays on the deck. In full screen a small overlay
  (leave full screen, previous, the slide counter, next) appears when the
  pointer moves or the screen is touched, and fades after 2.5 seconds, so a
  mouse or touch viewer always has a visible way out.
- Where the browser's Fullscreen API is missing or refused (an iPhone, or an
  iframe without `allow="fullscreen"` such as an artifact viewer), the deck
  fills the page's own window instead of failing silently. The button's
  tooltip and the overlay say so, and the root carries
  `data-fullscreen-mode="window"` (`native` for browser full screen).
- Press **?** (or the Controls and shortcuts button) for **Controls and
  shortcuts**: every control this deck offers, grouped as in the toolbar
  (move around, view, present, share and print, help), each with its icon,
  label, one-sentence description and keys, or "Button only". It is built
  from the same registry (`DECK_CONTROLS`) as the toolbar and the input
  guard, so it never drifts from the buttons or the keys, and it leaves out
  controls the host cannot offer.
- On a deck's first visit a hint says "Use ← → to move, F for full screen, ?
  for every control." It leaves after 6 seconds, on the first key or pointer
  input, or with **Got it**, and never takes focus. It shows once per deck
  namespace (remembered in `localStorage`; where storage is blocked it shows
  again next time), never in print or the presenter, and never under
  automation such as screenshots and artifact thumbnail capture. Add
  `?hint=0` to the page URL to turn it off (`?hint=1` forces it for checks).
- A click on the slide canvas advances. Links, buttons, embedded controls and
  the deck's progress chrome keep their own click behavior.
- On touch devices, a horizontal swipe moves between slides; vertical movement
  remains available to scroll.

Navigation is keyboard usable and honors the browser's reduced-motion
preference. The catalog deck browser checks cover the desktop and mobile
projects, including deep links, guarded interactions, overview, fullscreen,
swipe and reduced-motion preference handling:

```sh
pnpm exec playwright test tests/e2e/deck-navigation.spec.ts
```

The E2E fixture mounts the real DeckApp with the Lumen Launch catalog deck. It
adds three explicit navigation labels to one fixture slide so the test can
verify stable step links and step-before-slide keyboard behavior, and speaker
notes to two slides for the presenter checks.

## Stage and chrome

The slide stage is scaled to fit and centered in the space the chrome leaves,
at every aspect (16:9, 4:3, 9:16, 1:1) and on desktop, tablet and phones in
both orientations. The letterbox uses the theme's muted color. Progress, the
slide counter and the presenting tools sit in their own row below the stage,
so they never cover a slide; on phones the row wraps. Full screen hides the
row in favor of the fading full screen overlay, and resizing or rotating
refits the stage. A deck takes the app height
by default; embed it with `fit="container"` to fill a sized parent instead.

## Presenting and printing

- Press **S** or **P** to open the presenter view. It opens in a popup window
  that follows the deck over `BroadcastChannel`, and either side can move the
  other. The popup shows only the current slide id and step today; the full
  panel below is the in-page view, where the Next panel shows a live, scaled
  preview of the next slide (the same renderer as the stage). Messages are validated; anything malformed
  is ignored. Press **S** again to close it.
- When the popup is blocked (by the browser or a sandbox such as an artifact
  frame) or the browser has no `BroadcastChannel`, the presenter opens in the
  page instead, as a split view: the deck beside a panel with the position,
  the current and next slide with their speaker notes, Previous and Next
  buttons, an elapsed timer and a per-slide timer. A note at the top says
  why it is not a separate window (pop-ups blocked, no `BroadcastChannel`,
  or no window at all).
- **Pause** holds both timers and **Resume** continues from there; **Reset**
  sets both back to 00:00. The per-slide timer restarts on every slide change
  (a paused one stays paused, and pausing never resets it).
- **B** or **.** blacks out the screen (a click, B or Escape brings the slide
  back; arrows do nothing meanwhile). For two seconds it says "Screen blacked
  out — press B or click to return", then goes fully black.
- **L** turns the pointer into a laser dot, and clicks stop advancing while
  it is on. The dot appears at once, where the pointer last was over the deck
  (else in the middle of the stage), and a "Laser on" chip shows in the
  corner. On touch screens the dot moves to each tap and stays there when the
  finger lifts.
- The **Copy link to this slide** button copies a plain link: the page URL
  with the `#/<slide-id>/<step>` deep link. A toast shows "Link to slide 3
  copied" for 2.5 seconds (longer while the pointer is on it), and the same
  text goes to one polite live region. Where the clipboard is blocked the
  toast says "Could not copy the link" instead of claiming success. A new
  message replaces the old one.
- **Debug for agents** (the bug button, or **D**) opens a side sheet for
  pointing a coding agent at this exact slide: its id, position, step,
  layout, JSON pointer, blocks, visible text and lint findings (with buttons
  to jump to other slides that have findings). It copies the one-line agent
  reference (`[slide-ref] …`, which `protoyard deck inspect --ref` resolves),
  a Markdown agent prompt, or the slide JSON, downloads the deck JSON, and
  can outline each block with its JSON pointer on the stage. **Escape**
  closes it first. It is on in dev builds and with `?debug=1` on the page
  URL; a host can pass `debug="on"` or `debug="off"` to DeckApp. Exports,
  artifacts and the hosted player are off unless the URL asks. It never uses
  the network, is never printed, and loads on its own chunk only when it
  opens.
- The **Print** button, Ctrl/Cmd+P, `?print=1` (add `&notes=1` for speaker
  notes) and the browser's print command all lay out every visible slide on
  its own page at the canvas size, with all steps shown and no deck chrome:
  the button enters that layout before it opens the dialog. A printed PDF has
  one page per slide, sized to the deck aspect (1280 x 720 CSS px for 16:9).
  `PrintButton` from `@protoyard/decks-ui/print` takes an `onprint` callback
  for a host with its own print layout; without it, it calls
  `window.print()`.

The keys reach the deck while it has focus. When a click or tap would leave
focus nowhere (the blackout screen removes itself after a click, a tap lands
on plain slide content), the deck takes focus back, so its keys keep working.
It never takes focus from a control elsewhere on the page.

The browser checks run on the same built fixture, on the desktop and mobile
projects, with the timers on Playwright's controlled clock:

```sh
pnpm exec playwright test tests/e2e/deck-presenter.spec.ts
```

They cover the popup in both sync directions, malformed messages, the in-page
fallback for a blocked popup and for a missing `BroadcastChannel` (with the
reason shown), notes, timers with pause, resume and reset, blackout and the
focus kept on the deck after a click, the laser pointer, `?print=1` with and without notes, the
`beforeprint` and `afterprint` swap, and the page count and size of a
Chromium PDF. Each failure names what broke, for example
"pressing S should open the presenter popup (was it blocked?)".

## Customize a deck

### Style: theme, fonts and backgrounds

Everything a deck sets in `deck.style` is visible in every view that shows
slides: the canvas, the overview thumbnails, the presenter's deck surface and
print pages.

- **Theme.** `theme` (a built-in or one of the 64 library themes) or
  `paletteSeed` (a generated palette). It is applied to the deck root only, so
  the host page and DevTools keep their own theme. Library themes load lazily.
  An unknown theme or font pairing falls back to the default, and a short note
  appears in the deck chrome; the deck never fails to render. Find a theme with
  `pnpm protoyard theme list --search <query>` ([THEMES](THEMES.md)).
- **Type and shape.** `fontPair` (system font stacks, no downloads), `radius`,
  `density` and `motion`. Headings, body text and default borders follow the
  deck as well as utility classes.
- **Canvas.** `aspect` is `16:9` (1280 × 720, the default), `4:3`
  (1024 × 768), `9:16` (720 × 1280) or `1:1` (1080 × 1080). Slides are laid
  out in canvas pixels and scaled as a whole, so a deck looks the same on any
  screen.
- **Transitions.** `transition` on the deck or a slide: `fade` (the default),
  `slide`, `zoom`, `morph` or `none`. `motion: "subtle"` shortens them and
  `motion: "none"` turns them off. The viewer's reduced-motion preference can
  only lower the level, never raise it, and no transition runs longer than
  400 ms.
- **Backgrounds.** `style.background` sets the deck background preset and each
  `slide.background` overrides it with one of the 13 `DECK_BACKGROUND_PRESET_IDS`
  or a validated local image/video spec:
  six solids, five gradients and two patterns. Every preset gets a computed text
  color with at least 4.5:1 contrast against all of the background. On a preset
  that flips the theme's text tone (light text on a light theme), the slide's
  text tokens take that color and cards become outlines. Text stays readable in
  light and dark, in every built-in and library theme
  (`packages/decks-ui/tests/style-apply.test.ts`).
- **Footer.** `footer`, a local `logo` image and `slideNumbers` appear at the
  bottom left of every slide. Turn numbers off with `slideNumbers: false`. A
  remote logo is refused with a note.
- **Mode.** `DeckApp` takes `mode` (`light` by default, for stable exports) or
  `dark`.

### Deck Studio

With DevTools on, the **Deck** tab edits the deck live: theme or palette seed,
font pair, aspect, motion, background, slide numbers and progress position for
the deck, and layout, background, transition and hidden for the current slide.
Layout choices are only the layouts whose props schema already accepts the
slide's content, so switching never drops content. Edits stay in memory: the
studio writes no files. It shows them as an RFC 6902 JSON Patch with **Copy
patch** and **Download patch**, and selects the patch text where the clipboard
is blocked.

- In the player and quick explorations the patch is rooted at the blueprint
  (`/deck/…`). Apply it with
  `pnpm protoyard quick iterate <slug> --patch <file>`, which keeps an undo
  history.
- In a generated prototype the patch is rooted at the deck object
  (`/slides/…`, `/style/…`). Prefix each path with `/deck` to apply it to
  `prototypes/<slug>/blueprint.json`, then run `generate` again.

## Check a deck

### Authoring lint

`lintDeckStructure(deck)` and `lintDeckAssets(deck)` from
`@protoyard/blueprint` check a deck body before anyone sees it. They are
deterministic, never fetch and never render. The structure lint runs the
static quality rules of `@protoyard/decks/quality` (`checkDeckStatic`) and adds
outline, slide-link and chart-description checks. The asset lint walks every
image and video source, poster and embedded-app value. Each diagnostic has a
`code`, a `severity` and a JSON path. There is no CLI command for them yet:
call them from code, a test or an agent tool.

Catalog layout props may contain `{ step, fragment }` or `{ step, reveal }`
markers. The schema validates those markers, then lint and static quality
checks strip them before checking the layout's strict content props; the
markers remain in the parsed deck for step navigation and reveal behavior.

- **Errors** fail the deck: duplicate or missing slide ids, unknown layouts,
  props that break a layout's schema, images in props without alt text or a
  size, fragment order that reveals content before what sits above it, and
  unsafe asset URLs.
- **Warnings** report and never fail: missing, short, duplicated or
  boilerplate speaker notes; a third identical layout in a row; more visible
  words than the layout's pacing allows; step labels without fragments; short
  chart descriptions; external images without a credit.

The warning thresholds (40-character notes; 15, 45, 60 and 50 visible words
for punch, idea, diagram and story slides) are ported from the developer's
keynote QA scripts and are **not calibrated** against a body of real decks.
They stay report-only, as warnings, until they are.

### Visual QA sweep

`scripts/sweep-deck.ts` is the maintained browser sweep for a **built deck
fixture** (SITE_QA). It is separate from authoring lint (`lintDeckStructure`)
and from the general prototype matrix (`pnpm visual:sweep`).

```bash
# Unit tests (no browser)
pnpm vitest run scripts/tests/deck-sweep.test.ts

# Browser sweep — private loopback port (ephemeral unless --port)
pnpm exec tsx scripts/sweep-deck.ts --blueprint blueprints/decks/example.json
pnpm exec tsx scripts/sweep-deck.ts --out tmp/deck-sweep --viewport 1280x720

# Plan only: list the visits and write sweep.json and index.html, no browser
pnpm exec tsx scripts/sweep-deck.ts --dry-run --out tmp/deck-sweep
```

**What it does**

1. Serves a Vite harness that mounts `DeckApp` with the given blueprint.
2. Visits every slide id and step (hash `#/<id>/<step>`).
3. Measures canvas overflow, text size vs `DECK_TEXT_MINIMUMS` (24 / 18 px),
   image completeness / dimensions / alt, fragment index order, and browser
   console / page / request failures.
4. Writes under `tmp/deck-sweep/` (override with `--out`, must stay in `tmp/`):
   - `sweep.json` — machine report (`protoyard.deck-sweep` v1)
   - `index.html` — static contact sheet
   - `shots/*.png` — per visit (skip with `--no-shots`)

**Exit code**

- `0` when there are no **error**-severity issues.
- `1` when any deterministic error is present (overflow, missing image alt or
  dimensions, broken images, navigation failure, console/page/request errors,
  missing deck app root).

**Heuristics (warnings only until calibrated)**

- `font-too-small` — measured CSS px under body/label minima.
- `contrast` — reserved for a calibrated estimator; currently unused in the
  browser measure so reports stay stable.

Authoring lint remains the source of truth for layout props, outline integrity
and asset policy. The sweep does not replace `lintDeckStructure`.

### Design gate

The visual sweep passed while the flagship deck rendered a 24 px cover title,
the default theme, no backgrounds and blank charts. The design gate
([`tests/e2e/deck-design.spec.ts`](../tests/e2e/deck-design.spec.ts), rules
in [`scripts/lib/deck-design.ts`](../scripts/lib/deck-design.ts)) measures
what a well-designed slide must show. It runs the flagship deck
(`blueprints/decks/protoyard-create-anything.json`) at level 1 (the built
player's `deck.html`) and level 2 (the built `create-anything-deck`
prototype), on the desktop and Pixel 7 projects, with reduced motion.

On every slide, once its lazy layout, blocks and charts have loaded and its
measurements have settled:

| Check | Fails when |
| --- | --- |
| Overflow | A text line, image, SVG, canvas or frame sticks out of the stage by more than 2 px |
| Text overlap | Two text lines share at least 20 % of the smaller one's line box (3 px or more each way) |
| Theme | The deck root's theme is not `deck.style.theme` |
| Background | The slide frame's background preset is not the slide's own, or else the deck's |
| Display title | The largest text on a cover, divider or big-stat slide is under 8 %, 7 % or 10 % of the stage height |
| Charts | A chart slide draws no chart, or a series has no geometry (an empty or invalid path, a zero area) |

Every threshold is a share of the stage, so the phone (a scaled canvas) is
held to the same design as the desktop. Font sizes and line heights are
scaled to screen pixels before they are compared.

The interactive blocks must respond: a poll vote shows the viewer's own
result, a quiz answers and scores, a calculator recomputes when a slider
moves, a chart-kind switch redraws real series, and the embedded app starts
only when asked, then loads in its frame.

```bash
pnpm vitest run scripts/tests/deck-design.test.ts      # the rules, no browser
PROTOYARD_E2E_DECK=1 pnpm exec playwright test deck-design
```

The browser run needs the built player and the built `create-anything-deck`
servers (`PROTOYARD_E2E_PLAYER_PORT`, default 4861, and
`PROTOYARD_E2E_DECK_PROTOTYPE_PORT`, default 4892). Each slide's screenshot
lands in `tmp/deck-design/<level>-<project>/` for a person to review. A
finding attaches the slide's measurements to the report. Taste is still a
person's call: the gate rules out the measurable failures, and the
screenshots are for the rest.

## Share and export

| Where the deck is | How to share it | What you get |
| --- | --- | --- |
| A quick exploration | `pnpm protoyard quick export <slug> --single-file` | One HTML file that opens from `file://`, with no server or network |
| A quick exploration | `pnpm protoyard quick export <slug> --target artifact` | A Claude artifact page in `<exploration>/artifact/`, never published by the command |
| A generated prototype | `pnpm protoyard export <slug> --target artifact` | An artifact pack in `artifacts/<slug>/artifact/`: one script chunk and one stylesheet |
| A generated prototype | `pnpm protoyard export <slug>` | A relocatable ZIP of the static build |
| Any deck JSON | the player's `deck.html` with a `#bp=` share link or `?src=` | The deck in the no-install player ([PLAYER](PLAYER.md)) |

Publishing an artifact is a separate step that needs your consent; see
[Sharing as a Claude artifact](PUBLISHING.md#sharing-as-a-claude-artifact).
`tests/e2e/deck-artifact.spec.ts` packs the `create-anything-deck` prototype
and opens it the way the artifact viewer does: the first slide renders, keys
and deep links navigate, only the entry script loads, and the deck still runs
without `window.claude`, the clipboard or IndexedDB:

```sh
pnpm exec playwright test tests/e2e/deck-artifact.spec.ts
```

Measured 2026-10-22: that pack is 177 files plus the page (2,193,470 B), with
one 548,131 B gzip script. A quick deck exported as one file measured
1.53 MB, under the 2 MiB single-file cap for a deck page.

## Limits

| What | Limit | Enforced by |
| --- | --- | ---: |
| Document size from any untrusted source | 1 MiB of UTF-8 JSON, nesting depth 32 | `loadUntrustedDocument` |
| Slides per deck | 200 | `DECK_LIMITS.slides` |
| Blocks per slide / per deck | 200 / 2,000 (nested container blocks count) | `loadUntrustedDocument` |
| Chart points across a deck | 23,424 (eight full charts) | `loadUntrustedDocument` |
| Embedded apps per deck | 8, one level deep | `loadUntrustedDocument` |
| Steps per slide | 32 (later ones play together on the last step) | `DECK_LIMITS.steps` |
| Speaker notes per slide | 2,000 characters | `DECK_LIMITS.slideNotes` |
| Slide title | 160 characters | `DECK_LIMITS.slideTitle` |
| Rendered text minimum | 24 px body, 18 px labels, in canvas pixels | `DECK_TEXT_MINIMUMS` |
| Slides mounted at once | the active slide and its neighbors (2–3) | `DeckCanvas` |
| Single-file export of a deck page | 2 MiB | `quick export --single-file` |

Media come only from the deck itself: relative paths without `..`, bounded
base64 `data:` URIs of raster images and mp4/webm video, or library avatars
(`avatar:av-012`). Remote URLs, SVG, `blob:` and every script-capable scheme
are refused, which matches the player and artifact Content Security Policy.
Every deck string renders as text, never as HTML; see
[Kinds: hostile decks, pages and docs](SECURITY.md#kinds-hostile-decks-pages-and-docs).

## What decks do not do yet

- **Steps inside a chart do not hide.** A marker on the `chart` spec reveals
  the whole chart, but one on a single series adds a step without hiding
  anything. Use one chart slide per reveal, or a free slide with several chart
  blocks.
- **No custom slide components.** A generated deck's `src/custom-slides.ts`
  is a typed registry for later. `DeckApp` renders only the catalog layouts
  and free blocks.
- **Media backgrounds.** Slides accept local image and video background specs.
  Their sources use the same level-1 media policy as other deck media: relative
  paths inside the deck, bounded base64 media, or library avatars for images;
  remote URLs and `..` paths are refused. Image/video text gets a computed
  contrast scrim. Background videos are muted and loop, load only for the
  active or next slide, pause when outside the viewport, and use their poster
  for reduced motion and print. Add a local poster to video specs so those
  views have a still image.
- **No remote media, iframes, math or syntax themes.** There is no KaTeX and
  no highlight.js; code highlighting comes from the blocks tokenizer.
- **Briefs to deck blueprints only through quick.** `blueprint new` refuses
  deck briefs (see [Start a deck](#start-a-deck)).
- **The presenter popup is minimal.** It shows the slide id and step; notes,
  the next slide and timers are in the in-page view. The two windows sync only
  within one browser (same-origin `BroadcastChannel`), never across devices.
- **No PowerPoint, Keynote or Google Slides export.** Print to PDF from the
  browser, or share the HTML file or artifact.
- **Heuristics are report-only.** Lint warnings and the sweep's
  `font-too-small` never fail a deck, and the sweep's contrast estimate is not
  implemented, until they are calibrated.

## Tests

```sh
pnpm vitest run packages/decks packages/decks-ui
pnpm vitest run packages/cli/tests/decks-docs.test.ts   # this guide's commands, example and catalog
pnpm vitest run scripts/tests/deck-sweep.test.ts
pnpm exec playwright test tests/e2e/deck-navigation.spec.ts
pnpm exec playwright test tests/e2e/deck-presenter.spec.ts
pnpm exec playwright test tests/e2e/deck-artifact.spec.ts
pnpm check:docs
```
