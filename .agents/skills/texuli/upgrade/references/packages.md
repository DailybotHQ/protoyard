# Texuli packages: breaking changes in 0.8.0 and earlier

Back to [`../SKILL.md`](../SKILL.md), which has `0.10.0` and `0.9.0`.

## 0.8.0: breaking changes

This sub-skill never upgrades packages; moving an app from `^0.7.0` to
`^0.8.0` is the developer's install ([`../../components/SKILL.md`](../../components/SKILL.md)).
`0.8.0` publishes `@texuli/forms`, `@texuli/canvas` and `@texuli/sheets`
for the first time; an app that does not use them sees only these changes.
Before the move, check the app for:

- **Spec 0.8.0:** validated drafts carry `spec: "0.8.0"`; a host that
  compares the string must accept it. A `0.8.0` envelope with a `$source`
  binding or a `schema-form`, `canvas`, `spreadsheet` or dashboard node is
  refused by `0.7.0` validators, so upgrade the validating side first.
- **A new catalog hash:** the new ids change the catalog hash; a host that
  pins `catalogHash` refuses envelopes written for the `0.7.0` catalog
  (`catalog-mismatch`) until it pins the new hash.
- **`aria-required` inside a `Field`:** it lands only on roles that
  support it; a `DatePicker`, `DateRangePicker`, `TimeField` or `Slider`
  gets native `required` on its inputs, and a `ColorPicker` drops it. A
  test or selector that expected it on every control needs an update.
- **Component labels from one catalog:** `texuli` and
  `@texuli/primitives` labels resolve through `@texuli/core/i18n`; the
  English defaults stay and label props still win, but check labels an
  app set another way.

Not breaking: `validateDraft` takes `checkForm`, `checkCanvas` and
`checkSheet`; the player takes `formHost`, `canvasHost`, `sheetHost`,
`sourceRegistry` or `sourceLoader`, and `print`.

New APIs in `0.8.0` (none of them in `0.7.0`) are listed in
[`../../build-ui/references/imports.md`](../../build-ui/references/imports.md).

## 0.7.0: breaking changes

This sub-skill never upgrades packages; moving an app from `^0.6.0` to
`^0.7.0` is the developer's install ([`../../components/SKILL.md`](../../components/SKILL.md)).
`0.7.0` publishes `@texuli/document` and `@texuli/pages` for the first time;
an app that does not use them sees only these changes. Before the move,
check the app for:

- **Spec 0.7.0:** validated drafts carry `spec: "0.7.0"`; a host that
  compares the string must accept it. A `0.7.0` envelope with node keys or
  a `document` node is refused by `0.6.0` validators, so upgrade the
  validating side first.
- **A new catalog hash:** the `document` id changes the catalog hash; a
  host that pins `catalogHash` refuses envelopes written for the `0.6.0`
  catalog (`catalog-mismatch`) until it pins the new hash.
- **`EditOp` gains `patchDocument`:** an exhaustive `switch` over `EditOp`
  or `EditOpKind` (`@texuli/catalog/edit`) needs a branch;
  `applyEditOps` and `applyEditOp` take an optional third argument, and
  without its `patchDocument` patcher that op is refused (`invalid-op`).

Not breaking: nodes may carry an optional `key` (unique in the tree),
`RenderNode` carries it, the player takes a `documentHost`, and the
`texuli` bin gains a `document` command.

New APIs in `0.7.0` (none of them in `0.6.0`) are listed in
[`../../build-ui/references/imports.md`](../../build-ui/references/imports.md);
agent documents are stage I of [`../../blueprints/SKILL.md`](../../blueprints/SKILL.md).

## 0.6.0: breaking changes

This sub-skill never upgrades packages; moving an app from `^0.5.0` to
`^0.6.0` is the developer's install ([`../../components/SKILL.md`](../../components/SKILL.md)).
Under 0.x a new minor may break. Before that move, check the app for:

- **Field ids reach the focusable control:** `FileUpload`'s `id` lands on
  the file input and `TagsInput`'s on its text input (both were on the
  wrapper); `DatePicker`, `DateRangePicker` and `TimeField` put `id` on
  their first segment and, inside a `Field`, hide their own label (the
  Field's label names them).
- **`InputGroup`:** `id`, `aria-*`, `data-*` and handlers reach the input
  (`aria-*` and `data-*` were on the group).
- **Caller handlers on more parts:** menu items, the navigation menu, toast
  roots and viewports, the tree, splitter handles, the command input, the
  carousel and the input group run a caller's handler first, then their
  own unless the caller called `event.preventDefault()`; they no longer
  drop or replace it.
- **`texuli/avatar`:** `data-avatar` is `initials` after an image error.
- **Dates:** `@texuli/primitives/date-field` (and the styled date
  controls) report no value until the year has four digits.
- **Reduced motion is `0s`:** `base.css` and the player set durations and
  delays to `0s` (it was `0.01ms`), so no `transitionend` fires under
  reduced motion.
- **Motion through the runtime:** the toast, tooltip and slides stage CSS
  keyframes (`tx-toast-in`, `tx-toast-out`, `tx-tooltip-in`,
  `tx-deck-slide-*`) are gone; a closing overlay stays mounted, `inert`,
  until its exit ends (at most 1.2 s). Override with the `motion` prop or a
  `MotionProvider` from `texuli/motion`, not CSS keyframes; tests that
  expect an overlay to leave at once run under reduced motion or
  `motion={false}`.
- **`Toaster`:** no top-layer viewport while it has no toasts.
- **`@texuli/chat`:** the day separator is its own row above the avatar and
  bubbles; CSS on the old structure needs a look.
- **Types:** `FilterCondition.operator` widens to
  `FilterOperator | FilterCustomOperatorId` (add a default branch to an
  exhaustive `switch`); `AccordionRootProps` and `SliderRootProps` members
  are type aliases.
- **Spec 0.6.0:** validated drafts carry `spec: "0.6.0"`; a host that
  compares the string must accept it.

Not breaking: `DeckStage` now preloads its default renderers in server
builds, so the server render keeps slide content; `DateRangePicker`'s
`onInvalid` gains a third `{ side }` argument.

New APIs in `0.6.0` (none of them in `0.5.0`) are listed in
[`../../build-ui/references/imports.md`](../../build-ui/references/imports.md).

## 0.5.0: breaking changes

This sub-skill never upgrades packages; moving an app from `^0.4.0` to
`^0.5.0` is the developer's install ([`../../components/SKILL.md`](../../components/SKILL.md)).
Under 0.x a new minor may break. Before that move, check the app for:

- **`texuli/input`:** with `type="number"` or `type="range"`, `bind:value`
  holds a `number`, or `null` while empty (it was the field's text);
  `onValueChange` still receives the text. With `type="file"`, `files`
  starts as `null` and resets with `null`.
- **Caller handlers compose:** a handler passed to `Input`, `Textarea`,
  `InputGroup` and `TextCounter` (`oninput`), to `CopyButton` and to 14
  primitive parts (`onclick`, `onkeydown` and others) runs first and no
  longer replaces the built-in one; call `event.preventDefault()` in a click
  or key handler to skip the built-in behavior.
- **`Tag`:** the remove button is named "Remove {label}" (it was
  "Remove: {label}"); a `removeLabel` prefix gets the label appended
  without a colon.
- **`toast`:** the store owns the auto-dismiss timers; they count from
  publication, with or without a mounted `Toaster`, and each toast settles
  exactly once (`onSettle(reason)`).
- **`DeckStage`:** the default renderer tables load on first use, so the
  first stage paints a polite loading status (`aria-busy`) for one chunk,
  also on the server. Await `loadDefaultDeckRenderers()` (or, with
  `defaultRenderers={false}`, `loadBuiltinDeckBlocks()`) before mounting to
  paint at once.
- **`texuli/layouts/content`:** `TocItem.level` and `TocHeading.level`
  widen from `2 | 3` to `2 | 3 | 4 | 5 | 6`; exhaustive checks need the new
  levels.
- **Callback names:** `onStop`, `onCopy`, `onCopyError` and `onSettle` are
  camelCase props, not the native DOM events.

New APIs in `0.5.0` (none of them in `0.4.0`) are listed in
[`../../build-ui/references/imports.md`](../../build-ui/references/imports.md);
`@texuli/editor` is published for the first time.
