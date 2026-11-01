# Interface recipes

Each recipe is a **starting checklist**, not a generated app. Stay offline;
import public subpaths only.

## 1. Dashboard

**Brief shape:** KPI row, primary chart or table, filters, optional side nav.

| Need | Prefer |
| --- | --- |
| Shell | App layout / sidebar from `texuli` layouts (developer tier) |
| KPIs | `stat` / `kpi` (display manifests) |
| Grouping | `card` + `CardGrid` |
| Dense data | `@texuli/data/*` views (grid, tree, board, calendar, timeline, files, …) |
| Charts | `@texuli/charts/*` lazy families (`cartesian`, `compact`, `part-whole`, …) |
| Theme | `enterprise-neutral` or themes skill search |

**Compose order:** shell → filter bar → KPI row → main visualization → detail
drawer (if needed). Validate empty and loading states.

**Gates:** unit tests for any new host logic; typecheck `texuli` / `data` /
`charts` as touched; optional website showcase e2e if you edit showcase.

## 2. Landing page

**Brief shape:** hero, value props, CTA, optional social proof, footer.

| Need | Prefer |
| --- | --- |
| Structure | Page layout / content sections |
| CTA | `button` (forms manifest) |
| Labels | `badge` for status chips |
| Hero media | media skill `Image` with URL policy |
| Theme | brand-friendly library theme |

**Compose order:** hero (title, lead, primary+secondary CTA) → feature cards →
closing CTA. Keep motion optional and respect `prefers-reduced-motion`.

## 3. Form flow

**Brief shape:** multi-step intake or settings save.

| Need | Prefer |
| --- | --- |
| Progress | `stepper` |
| Fields | `input`, textarea, select, checkbox/radio via forms components |
| Actions | `button` primary submit + secondary back |
| Errors | `alert` near fields; `error-state` for full-page failure |
| Success | inline alert or empty-state with next action |

**Compose order:** stepper → current step fields → validation messages →
footer actions. Wire pending state on submit. Never store secrets in
prototypes as real credentials.

**Gates:** forms unit tests; axe on the flow when e2e exists
(`tests/e2e/a11y-forms.spec.ts` pattern).

## 4. Slide / deck

**Brief shape:** sequential slides for a pitch or lesson.

**Deck model v2 (the deck generator, in development, on npm from `0.4.0`):**
write the deck as JSON or Markdown with `@texuli/deck`,
validate it with `parseDeck` / `loadUntrustedDeck` / `parseDeckMarkdown`,
pick from the 21 layout ids by `useWhen`, present it with the v2
`DeckStage`, export print and PPTX, and use the `deck` CLI and MCP tool:
[`decks.md`](decks.md). The table below is the v1 model that
`@texuli/slides` `0.3.0` ships; the v2 stage (`0.4.0` and later) still
accepts v1 decks (it migrates them).

| Need | Prefer |
| --- | --- |
| Deck model | `@texuli/slides/model` (`parseDeck`): validated slides of `@texuli/blocks` content, notes, masters, theme references |
| Agent catalog tree | `@texuli/slides/grammar` (`toDeckRenderTree`): `layout-deck` with one `deck-slide` child per slide (`slideId`, `title`, `notes`, `master`, `transition`, `themeRef`) and block-family children |
| Validate agent output | `validateDeckDraft(input, { catalog })`: the catalog's `validateDraft` (ids, props, sinks, block schemas, grammar, `layout-deck` root) plus deck rules (slide ids, declared masters, theme references); returns the deck and per-slide master, transition, theme and step count |
| Interchange / legacy | `toDeckGrammar` (structured `slides[]` prop; not checked node by node by the renderer); `projectLegacyDeck` reads the older deck-of-cards shape |
| Present | `@texuli/slides/stage` (`DeckStage`, optional `@texuli/slides/styles.css`): one slide at a time, previous/next, Home/End, `o` overview, `p` presenter view (notes, next slide or step; timer opt-in), `f` fullscreen (visible window-filling fallback), slot masters split at top-level dividers, `fade`/`fade-up`/`none` transitions, reduced motion honoured |
| Print / export | `DeckPrint` (`@texuli/slides/stage`) + `requestDeckPdf` (`@texuli/slides/export`, browser print to PDF), `exportDeckPptx` (`@texuli/slides/export`: text, bullets and notes; media and charts are reported as omitted) |
| Starter decks | `createDeckFromTemplate('report' \| 'pitch' \| 'review')` from `@texuli/slides/templates`: real blocks that validate, render, print and export like any deck |
| Text | block content or plain text — not HTML strings |
| Chrome | developer shell only outside the deck frame |

**Compose order:** deck model → validate with `parseDeck` → present with
`DeckStage`. For agent output: emit the `deck-slide` tree → `validateDeckDraft`
→ show diagnostics on a draft, never activate an invalid one. Reveal steps
play on the stage: put `step` (and optionally `reveal`) on top-level slide
blocks only; a list with a `step` reveals one item per step. Print and PPTX
flatten them. A presenter screen is a second same-origin window linked with
`createDeckSync` (BroadcastChannel, no server): do not promise another device.

## 5. Media story

**Brief shape:** narrative with images or video chapters.

| Need | Prefer |
| --- | --- |
| Media | [`../../media/SKILL.md`](../../media/SKILL.md) — Image, Gallery, Video + captions |
| Framing | `card` / content layouts |
| URLs | `safeImageSrc` / `safeMediaSrc` on every src |

**Compose order:** story outline → media slots with policy-safe URLs →
captions/chapters → export only if the brief asks (media export docs).

## 6. Drag and drop: sortable lists, groups and boards

**Brief shape:** reorder a list; move cards between columns; copy from a
palette; reparent in a tree. `@texuli/drag` is in development and on npm
as `0.11.3`.

| Need | Prefer |
| --- | --- |
| A sortable list or several lists that exchange items | `@texuli/primitives/sortable` (`Sortable.Root`, `List`, `Item`, `Handle`) |
| A kanban board with WIP limits and a "Move to…" menu | `@texuli/data/board` (`Board`) |
| An outline or file tree with reorder and indent | `@texuli/data/tree-view` (`TreeDataView`) |
| Rules and planning without Svelte (server, worker, tests) | `@texuli/drag/sortable` (`createSortableModel`, `planMove`, `applyMove`) |
| Localized announcements | `@texuli/drag/messages` (`resolveDragMessages`), or each view's `messages` prop |

```svelte
<script lang="ts">
  import { Sortable, type SortableContainer } from '@texuli/primitives/sortable';

  const labels: Record<string, string> = { copy: 'Write copy', review: 'Review', ship: 'Ship' };
  let containers = $state<SortableContainer[]>([
    { id: 'todo', items: ['copy', 'review'], group: 'tasks' },
    { id: 'done', items: ['ship'], group: 'tasks', maxItems: 10 },
  ]);
</script>

<Sortable.Root bind:containers crossContainers>
  {#each containers as list (list.id)}
    <Sortable.List id={list.id} label={list.id === 'todo' ? 'To do' : 'Done'}>
      {#snippet children({ items })}
        {#each items as id (id)}
          <Sortable.Item {id} label={labels[id]}>
            <Sortable.Handle>⠿</Sortable.Handle>
            {labels[id]}
          </Sortable.Item>
        {/each}
      {/snippet}
    </Sortable.List>
  {/each}
</Sortable.Root>
```

**Rules:** container `group` with `pull` (`true`, `false` or `'clone'`) and
`put`; `locked` items never move; `maxItems` caps a list; `canDrop` refuses
with a reason; `onMove` returning `false` means you apply the move yourself.
**Accessibility contract** (every drag surface): Space or Enter picks up and
drops, arrows move (inline arrows flip in RTL), Escape restores the origin,
handles are named buttons with instructions, every pointer drag has a non-drag
alternative (WCAG 2.5.7), and every announcement comes from `DragMessages`.
Contract: `packages/drag/docs/contract.md`.

**Gates:** `pnpm vitest run packages/primitives/tests/sortable.test.ts` and
the behavior scenario `tests/behavior/scenarios/sortable.spec.ts`.

## 7. Workflow editor

**Brief shape:** an automation, approval or pipeline the person edits as
nodes and edges, or a read-only diagram of one. `@texuli/workflows` is in
development and on npm as `0.11.3`.

```svelte
<script lang="ts">
  import { WorkflowEditor } from '@texuli/workflows/editor';
  import { layoutMoves, layoutWorkflow } from '@texuli/workflows/layout';
  import { applyWorkflowOps, createWorkflow, defineNodeTypes, type WorkflowGraph } from '@texuli/workflows/model';

  const registry = defineNodeTypes([
    { type: 'request', label: 'Request', ports: [{ id: 'out', direction: 'out', dataType: 'any' }] },
    { type: 'end', label: 'End', ports: [{ id: 'in', direction: 'in', dataType: 'any' }] },
  ]);
  const at = { x: 0, y: 0 };
  const built = applyWorkflowOps(createWorkflow(), [
    { op: 'addNode', node: { id: 'ask', type: 'request', label: 'Expense submitted', position: at } },
    { op: 'addNode', node: { id: 'paid', type: 'end', label: 'Paid', position: at } },
    { op: 'connect', edge: { id: 'e1', from: { node: 'ask', port: 'out' }, to: { node: 'paid', port: 'in' } } },
  ], { registry });
  if (!built.ok) throw new Error(built.error.message);
  const laid = applyWorkflowOps(built.graph, [{ op: 'moveNodes', moves: layoutMoves(layoutWorkflow(built.graph)) }], { registry });
  let graph = $state.raw<WorkflowGraph>(laid.ok ? laid.graph : built.graph);
</script>

<WorkflowEditor {graph} {registry} onchange={(next) => (graph = next)} />
```

| Need | Prefer |
| --- | --- |
| Editable graph (toolbar, palette, canvas, minimap, inspector, treegrid outline) | `WorkflowEditor` from `@texuli/workflows/editor`; each part is also exported |
| Read-only figure | `WorkflowViewer` from `@texuli/workflows/viewer` |
| Node props panel | `WorkflowInspector` from `@texuli/workflows/inspector` |
| Undo and redo | `createWorkflowHistory` from `@texuli/workflows/model` |
| From or to blueprint JSON (`workflow-graph`) | `fromSpecWorkflow`, `toSpecWorkflow` from `@texuli/workflows/spec-adapter` |

**Keyboard:** arrows move focus to the nearest node, Alt+Arrow nudges,
Enter on a port starts connect mode, Delete removes, Ctrl or Cmd with Z / Y
undo and redo, = / - zoom, 0 fits; the outline treegrid edits without the
canvas. **Limits:** 500 nodes, 2,000 edges; every op is validated and a
refused op changes nothing; labels refuse control and bidi characters.

**Gates:** `pnpm vitest run packages/workflows` and the behavior scenario
`tests/behavior/scenarios/workflow-editor.spec.ts`.

## Shared acceptance for every recipe

- [ ] Primary path works with real handlers (no dead buttons)
- [ ] Empty and error states are reachable
- [ ] Keyboard order is sane; focus visible
- [ ] AA contrast in light and dark for chrome you ship
- [ ] No foreign network in the static or fixture path
- [ ] Imports are public subpaths; `texuli/cx` for classes
