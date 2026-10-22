import { BLOCK_TYPE_FAMILY, BLOCK_TYPES, type BlockType } from '../schema/index.ts';
import { BLOCK_CONTENT_LIMITS as L } from '../schema/primitives.ts';
import { MINIMAL_EXAMPLES, RICH_EXAMPLES } from './examples.ts';
import type { BlockCatalogEntry } from './types.ts';

type Meta = Pick<BlockCatalogEntry, 'label' | 'useWhen' | 'dontUseWhen' | 'limits' | 'a11y'>;

const META: Record<BlockType, Meta> = {
  flow: {
    label: 'Flow diagram',
    useWhen: [
      'Show a short process or chain of steps as connected nodes',
      'Explain a loop (set loopBack)',
    ],
    dontUseWhen: ['More than 12 steps (split it)', 'Numbered prose steps (use steps)'],
    limits: ['1–12 nodes', 'labels ≤ 120 characters', 'unique node ids'],
    a11y: 'Rendered as an ordered list of nodes with arrows as decoration; order carries the meaning.',
  },
  tree: {
    label: 'Tree diagram',
    useWhen: ['A file tree or an org chart', 'Hierarchy that is at most 6 levels deep'],
    dontUseWhen: ['Flat lists (use list)', 'Graphs with cycles (not supported)'],
    limits: ['1–64 nodes', 'depth ≤ 6', 'every parentId must exist; no cycles'],
    a11y: 'Rendered as nested lists so the hierarchy is announced; tone never carries meaning alone.',
  },
  board: {
    label: 'Board diagram',
    useWhen: ['A static kanban-style snapshot of work by column'],
    dontUseWhen: ['A live, editable board (use a level-2 board view)', 'More than 6 columns'],
    limits: ['1–6 columns', '≤ 8 cards per column', 'unique column and card ids'],
    a11y: 'Each column is a labelled list; card tone is decorative and backed by text.',
  },
  terminal: {
    label: 'Terminal',
    useWhen: ['Show a command-line session: prompts, output and comments'],
    dontUseWhen: ['Source code with highlighting (use code)', 'Real secrets or real hosts'],
    limits: ['1–40 lines', 'line text ≤ 240 characters', 'kinds: prompt, output, comment'],
    a11y: 'Rendered as preformatted text in a focusable, labelled region; prompts are marked in text.',
  },
  heading: {
    label: 'Heading',
    useWhen: ['Open a section or slide with a clear title', 'Mark hierarchy (H1–H4)'],
    dontUseWhen: ['Long body copy (use text)', 'A single icon callout (use icon or callout)'],
    limits: [`text ≤ 200 characters`, `level 1–4`, `optional eyebrow and subtitle`],
    a11y: 'Rendered as a real heading level; keep a single H1 per slide or page when possible.',
  },
  text: {
    label: 'Rich text',
    useWhen: ['Paragraphs, short lists and inline emphasis in markdown'],
    dontUseWhen: ['A structured checklist with icons (use list)', 'Executable HTML or scripts'],
    limits: [`markdown ≤ ${L.markdown} characters`, `parsed by safe markdown (no raw HTML)`],
    a11y: 'Markdown becomes semantic elements; links keep visible labels; never {@html}.',
  },
  list: {
    label: 'List',
    useWhen: ['Bullets, numbers, checks or icon rows with short items'],
    dontUseWhen: ['Long narrative (use text)', 'A multi-column feature grid (use cards)'],
    limits: [`${L.listItems} items`, `item text ≤ ${L.shortMarkdown} markdown`],
    a11y: 'Uses list markup; check style exposes done state in text, not color alone.',
  },
  quote: {
    label: 'Quote',
    useWhen: ['A short testimonial or pull quote with optional cite and avatar'],
    dontUseWhen: ['Long body copy', 'A full person bio grid (use people)'],
    limits: [`quote ≤ 600 characters`, `optional avatar id av-001…175`],
    a11y: 'Cite is associated with the quote; avatar is decorative when name is present.',
  },
  callout: {
    label: 'Callout',
    useWhen: ['Highlight a warning, tip or note beside the main story'],
    dontUseWhen: ['Primary title (use heading)', 'Multiple competing CTAs'],
    limits: [`body ≤ 1,000 markdown`, `tone from the closed palette`],
    a11y: 'Tone maps to theme tokens with contrast; icon is decorative when title exists.',
  },
  divider: {
    label: 'Divider',
    useWhen: ['Separate sections visually with an optional label'],
    dontUseWhen: ['As the only content on a slide'],
    limits: [`optional label`, `variant line or space`],
    a11y: 'Decorative; label is plain text when present.',
  },
  image: {
    label: 'Image',
    useWhen: ['Show a local or embedded raster image with alt text'],
    dontUseWhen: ['Remote https images at level 1', 'SVG or HTML markup as the source'],
    limits: [
      `avatar:av-001…175, data: raster, or relative path`,
      `width/height 1–${L.mediaDimension}`,
      `no remote URLs`,
    ],
    a11y: 'Requires alt text unless decorative: true; caption stays as visible text.',
  },
  video: {
    label: 'Video',
    useWhen: ['Local or embedded short product clips'],
    dontUseWhen: ['Remote streaming URLs', 'Autoplay with sound'],
    limits: [`mp4/webm data or relative path`, `autoplay requires muted`, `label required`],
    a11y: 'Accessible name from label; autoplay is muted; controls remain available when set.',
  },
  people: {
    label: 'People',
    useWhen: ['Team grids or speaker lists with fictional portraits'],
    dontUseWhen: ['A single quote (use quote)', 'Real PII or real people photos'],
    limits: [`1–${L.people} people`, `avatar ids only`],
    a11y: 'Name is the primary label; avatar is supplementary.',
  },
  stat: {
    label: 'Stats',
    useWhen: ['KPI row with values, deltas and optional spark trends'],
    dontUseWhen: ['Full time-series charts (use chart)', 'Editable metrics (use calculator)'],
    limits: [`1–${L.statItems} items`, `trend ≤ ${L.trendPoints} points`],
    a11y: 'Values and labels are text; delta tone is not the only signal (include words).',
  },
  table: {
    label: 'Table',
    useWhen: ['Small comparison tables with typed cells'],
    dontUseWhen: ['Huge datasets (cap is small by design)', 'Charts of the same numbers alone'],
    limits: [
      `caption required`,
      `≤ ${L.tableColumns} columns`,
      `≤ ${L.tableRows} rows`,
      `formats text/number/percent/cents`,
    ],
    a11y: 'Caption names the table; numeric formats stay in data for screen readers.',
  },
  chart: {
    label: 'Chart',
    useWhen: ['Bounded ChartSpec (line, area, bar, donut, pie, funnel)'],
    dontUseWhen: ['Unvalidated chart JSON', 'More than 8 series or 366 points'],
    limits: [`ChartSpecSchema caps`, `optional accessible data table`],
    a11y: 'Prefer showTable for a data table; series colors come from theme tokens.',
  },
  code: {
    label: 'Code',
    useWhen: ['Short code samples with a closed language list'],
    dontUseWhen: ['Executable scripts', 'Huge dumps over the line/char caps'],
    limits: [
      `≤ ${L.code} characters`,
      `≤ ${L.codeLines} lines`,
      `≤ ${L.highlightSteps} highlight steps`,
    ],
    a11y: 'Presented as a code block with language; highlights are visual only.',
  },
  timeline: {
    label: 'Timeline',
    useWhen: ['2–12 ordered events along a path'],
    dontUseWhen: ['A single milestone (use stat or heading)', 'Gantt-style project plans'],
    limits: [`2–${L.timelineEvents} events`],
    a11y: 'Events read in order; time and title are both text.',
  },
  steps: {
    label: 'Steps',
    useWhen: ['Short how-to sequences (2–8 steps)'],
    dontUseWhen: ['Branching flows (use product flow engine)', 'Long docs'],
    limits: [`2–${L.steps} items`],
    a11y: 'Numbered mode exposes order; icons are decorative beside titles.',
  },
  comparison: {
    label: 'Comparison',
    useWhen: ['Side-by-side plan or feature matrices'],
    dontUseWhen: ['Free-form prose', 'More than four columns'],
    limits: [`2–${L.comparisonColumns} columns`, `≤ ${L.comparisonRows} rows`],
    a11y: 'Row labels and cell values are text or boolean words, not color alone.',
  },
  cards: {
    label: 'Cards',
    useWhen: ['Feature grids with title, body, icon or image'],
    dontUseWhen: ['A single CTA band (use cta)', 'Dense data tables'],
    limits: [`1–${L.cards} cards`, `2–4 columns`],
    a11y: 'Each card has a text title; images need imageAlt when present.',
  },
  icon: {
    label: 'Icon',
    useWhen: ['A single allow-listed icon with a label or decorative mark'],
    dontUseWhen: ['Arbitrary SVG uploads', 'Icon-only navigation without a name'],
    limits: [`allow-listed icon names`, `label or decorative: true`],
    a11y: 'Provide label unless decorative; size does not replace the name.',
  },
  cta: {
    label: 'Call to action',
    useWhen: ['One to three safe links as primary actions'],
    dontUseWhen: ['Long forms (use form)', 'Unsafe javascript: links'],
    limits: [`1–${L.ctaActions} actions`, `https, mailto or #section href only`],
    a11y: 'Buttons/links use visible labels; variants are not the only cue.',
  },
  columns: {
    label: 'Columns',
    useWhen: ['Side-by-side block groups on wide layouts'],
    dontUseWhen: ['Deep nesting beyond three container levels', 'As a substitute for tabs'],
    limits: [
      `2–${L.columns} columns`,
      `≤ ${L.blocksPerColumn} blocks each`,
      `nest ≤ ${L.containerDepth} deep`,
    ],
    a11y: 'Reading order follows column then block order; avoid empty columns.',
  },
  tabs: {
    label: 'Tabs',
    useWhen: ['2–6 alternative panels the viewer can switch'],
    dontUseWhen: ['Linear steps (use steps)', 'SEO-critical content only in hidden panels'],
    limits: [`id required`, `2–${L.tabPanels} panels`, `≤ ${L.blocksPerColumn} blocks each`],
    a11y: 'label names the tablist; selected panel is keyboard reachable.',
  },
  reveal: {
    label: 'Reveal',
    useWhen: ['Answers or details behind a button'],
    dontUseWhen: ['Critical content that must always be visible'],
    limits: [`id required`, `≤ ${L.blocksPerColumn} nested blocks`],
    a11y: 'Button label toggles open/closed; content stays in the accessibility tree when open.',
  },
  poll: {
    label: 'Poll',
    useWhen: ['Live audience choices with local tallies'],
    dontUseWhen: ['Real multiplayer voting backends', 'Quizzes with right answers (use quiz)'],
    limits: [`id required`, `2–${L.pollOptions} options`, `results after-vote/always/hidden`],
    a11y: 'Question is the group label; selected options are announced; results not color-only.',
  },
  quiz: {
    label: 'Quiz',
    useWhen: ['Short self-checks with known answers'],
    dontUseWhen: ['Graded certification', 'Open-ended essays'],
    limits: [
      `id required`,
      `1–${L.quizQuestions} questions`,
      `2–${L.quizChoices} choices`,
      `seeded shuffle`,
    ],
    a11y: 'Feedback text explains correctness; passScore is numeric, not color alone.',
  },
  calculator: {
    label: 'Calculator',
    useWhen: ['Interactive what-if math with a closed formula AST'],
    dontUseWhen: ['Executable JavaScript formulas', 'Unbounded sliders'],
    limits: [
      `id required`,
      `1–${L.calculatorInputs} inputs`,
      `1–${L.calculatorOutputs} outputs`,
      `formula caps in ./formula`,
    ],
    a11y: 'Inputs have labels and units; outputs update as text values.',
  },
  counter: {
    label: 'Counter',
    useWhen: ['Simple +/- tallies within min/max'],
    dontUseWhen: ['Analytics metrics (use stat)', 'Multi-input math (use calculator)'],
    limits: [`id required`, `start/step/min/max bounds`],
    a11y: 'Value is a live text readout; controls are real buttons with names.',
  },
  'chart-controls': {
    label: 'Chart controls',
    useWhen: ['Let viewers switch kind, series or range on one ChartSpec'],
    dontUseWhen: ['Static charts (use chart)', 'Incompatible kind lists'],
    limits: [`id required`, `kinds 2–4`, `needs seriesToggle or range or kinds`],
    a11y: 'Controls are labeled; chart updates keep an optional data table.',
  },
  map: {
    label: 'Map',
    useWhen: ['Points and routes on the simulated basemap'],
    dontUseWhen: ['Real tile servers or GPS tracking', 'More than 200 points'],
    limits: [
      `id required`,
      `basemap port-meridian only`,
      `1–${L.mapPoints} points`,
      `route ≤ ${L.mapRoute}`,
    ],
    a11y: 'label names the map; points expose text labels (not color alone).',
  },
  'embed-app': {
    label: 'Embedded app',
    useWhen: ['Mount a small opaque app blueprint inside a deck or page'],
    dontUseWhen: ['Unvalidated remote iframes', 'Full product shells as embeds'],
    limits: [
      `id required`,
      `app ≤ ${L.embedBytes / 1024} KB`,
      `depth ≤ ${L.embedDepth}`,
      `host validates with blueprint loader`,
    ],
    a11y: 'title names the embed; start control is a real button; nested app keeps its own a11y.',
  },
  form: {
    label: 'Form',
    useWhen: ['Collect structured fields; pages own responses'],
    dontUseWhen: ['Auth or real PII pipelines', 'More than 20 fields'],
    limits: [
      `id required`,
      `1–${L.formFields} fields`,
      `closed field types`,
      `responses via @protoyard/pages`,
    ],
    a11y: 'Each field has a label; errors map to fields; success message is text.',
  },
};

function entry(type: BlockType): BlockCatalogEntry {
  const meta = META[type];
  return {
    type,
    label: meta.label,
    family: BLOCK_TYPE_FAMILY[type],
    useWhen: meta.useWhen,
    dontUseWhen: meta.dontUseWhen,
    limits: meta.limits,
    a11y: meta.a11y,
    exampleMinimal: MINIMAL_EXAMPLES[type],
    exampleRich: RICH_EXAMPLES[type],
  };
}

/** Every block type’s authoring metadata, keyed by type. */
export const BLOCK_CATALOG: { readonly [K in BlockType]: BlockCatalogEntry } = Object.freeze(
  Object.fromEntries(BLOCK_TYPES.map((type) => [type, entry(type)])) as {
    [K in BlockType]: BlockCatalogEntry;
  }
);

/** Catalog rows in stable {@link BLOCK_TYPES} order. */
export const BLOCK_CATALOG_LIST: readonly BlockCatalogEntry[] = Object.freeze(
  BLOCK_TYPES.map((type) => BLOCK_CATALOG[type])
);

/** Look up one catalog row. */
export function getBlockCatalogEntry(type: BlockType): BlockCatalogEntry {
  return BLOCK_CATALOG[type];
}
