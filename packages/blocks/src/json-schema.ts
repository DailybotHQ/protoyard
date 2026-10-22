import { z } from 'zod';
import { BLOCK_CATALOG_LIST } from './catalog/entries.ts';
import type { BlockType } from './schema/index.ts';
import { BlockSchema } from './schema/index.ts';

export const BLOCKS_SCHEMA_URL =
  'https://github.com/DailybotHQ/protoyard/schema/blocks/v1' as const;

const PROPERTY_DESCRIPTIONS: Record<string, string> = {
  actions: 'Safe, visibly labelled actions available from this block.',
  align: 'Horizontal alignment for this content.',
  alt: 'Alternative text describing the image for people who cannot see it.',
  answers: 'Ids of the correct choices for this question.',
  app: 'A bounded app blueprint mounted in an isolated namespace by the host.',
  args: 'Operands for this closed expression operator.',
  autoplay: 'Whether video playback starts automatically; autoplay requires muted audio.',
  avatar: 'An allow-listed fictional avatar id.',
  base: 'Base value used by this operation.',
  basemap: 'The allow-listed simulated map style; no map tiles are fetched.',
  bio: 'Short fictional biography for this person.',
  blocks: 'Nested blocks rendered inside this container.',
  body: 'Short markdown body content, parsed as safe text rather than HTML.',
  caption: 'Visible caption that names this table or media item.',
  cards: 'Cards grouped under this board column.',
  chart: 'Optional bounded chart configuration for the selected output.',
  choices: 'Available answer choices, each with a stable id and visible label.',
  cite: 'Attribution shown with the quoted text.',
  code: 'Source text shown as inert, syntax-tokenized code.',
  columns: 'Column groups or headers, depending on the enclosing block.',
  context: 'Brief source or context note for this value.',
  control: 'The allow-listed control that a viewer may use.',
  controls: 'Viewer controls declared by this interactive block.',
  credit: 'Attribution for the media source.',
  currency: 'Currency code used when formatting integer cents.',
  decorative: 'Marks the icon or image as decorative so assistive technology can ignore it.',
  default: 'Initial value used before the viewer changes this input.',
  defaultPanel: 'Id of the panel selected when the tabs first open.',
  delta: 'Change compared with the stated reference period or value.',
  deltaTone: 'Theme tone describing the direction or meaning of the change.',
  description: 'Plain-text description of this item.',
  digits: 'Number of decimal places used by this rounding operation.',
  done: 'Whether this list item is complete.',
  emphasis: 'The bounded emphasis style applied to this text.',
  events: 'Ordered milestones shown on the timeline.',
  explanation: 'Feedback shown after the answer is checked.',
  exponent: 'Exponent applied by this expression.',
  eyebrow: 'Short secondary label shown above the main heading.',
  feedback: 'When quiz feedback is revealed to the viewer.',
  fields: 'Declared fields or inputs for this form or interactive block.',
  filename: 'Fictional file name displayed in this terminal line.',
  fit: 'How the image fits inside its declared dimensions.',
  footnote: 'Small supporting note shown below the main content.',
  format: 'How values in this column are interpreted and formatted.',
  formula: 'Closed, data-only formula AST; it is never executed as code.',
  height: 'Height in CSS pixels or the bounded media aspect dimension.',
  help: 'Supporting instructions associated with this input.',
  highlight: 'Optional row or text range receiving a visual highlight.',
  highlightRow: 'Zero-based table row index to highlight.',
  highlights: 'Line ranges highlighted at each presentation step.',
  href: 'Safe navigation target: http(s), mailto, an anchor or a relative path.',
  icon: 'Icon name from the package allow-list.',
  id: 'Stable lowercase identifier used to target this item and preserve viewer state.',
  ifFalse: 'Expression result when the condition is false.',
  ifTrue: 'Expression result when the condition is true.',
  image: 'Image source or image configuration for this card.',
  imageAlt: 'Alternative text for the card image.',
  input: 'Declared input name read by this expression.',
  inputs: 'Bounded viewer inputs declared for this calculator.',
  items: 'Ordered content items shown by this block.',
  kind: 'Chart kind or item category selected from a closed set.',
  kinds: 'Chart kinds the viewer may select.',
  label: 'Short visible label and accessible name for this item.',
  labels: 'Category labels associated with chart values.',
  lang: 'Language from the supported code-tokenizer list.',
  lat: 'Latitude in decimal degrees for this simulated map point.',
  layout: 'Allow-listed diagram or content layout.',
  left: 'Left operand or left-side content, depending on the block.',
  level: 'Heading level or bounded content level.',
  lineNumbers: 'Whether line numbers are included in the display.',
  lines: 'Ordered terminal lines or source lines shown by this block.',
  lng: 'Longitude in decimal degrees for this simulated map point.',
  loop: 'Whether this line or node participates in a loop.',
  loopBack: 'Id of the node reached by the optional loop-back edge.',
  markdown: 'Bounded markdown source rendered through the safe markdown parser.',
  max: 'Maximum permitted numeric value.',
  maxChoices: 'Maximum number of choices a viewer may select.',
  maxLength: 'Maximum number of characters accepted for this value.',
  maxTags: 'Maximum number of tags accepted.',
  min: 'Minimum permitted numeric value.',
  muted: 'Whether audio is muted; required when autoplay is enabled.',
  name: 'Stable field or variable name used by the data model.',
  nodes: 'Nodes in the diagram, with stable ids and visible labels.',
  numbered: 'Whether ordered items display their step numbers.',
  open: 'Whether this reveal container starts open.',
  openLabel: 'Button label shown while the reveal content is open.',
  options: 'Allow-listed options presented to the viewer.',
  op: 'Closed expression operator; its value selects a data-only operation.',
  orientation: 'Direction in which the content is laid out.',
  output: 'Output value or destination defined by this operation.',
  outputs: 'Calculated outputs and their closed formulas.',
  panels: 'Named tab panels, each containing a bounded block list.',
  parentId: 'Id of the parent node, or null for a root node.',
  passScore: 'Fraction of correct answers required to pass, from zero to one.',
  people: 'Fictional people shown in this block.',
  placeholder: 'Example value shown before a viewer enters input.',
  points: 'Bounded simulated map points; these do not request remote map data.',
  poster: 'Safe image source shown before video playback.',
  prompt: 'Question or instruction presented to the viewer.',
  question: 'Question text shown to the viewer.',
  questions: 'Ordered quiz questions and their declared answer choices.',
  quote: 'Quoted text, rendered as text and never as HTML.',
  range: 'Allow-listed range labels available to the viewer.',
  required: 'Whether a viewer must provide this value.',
  results: 'When poll results are made visible.',
  reveal: 'Presentation effect used when this block is revealed.',
  right: 'Right operand for this expression.',
  role: 'Short role or attribution associated with this item.',
  route: 'Ordered point ids describing a simulated route.',
  rows: 'Bounded table rows or comparison rows.',
  series: 'Named chart series and their numeric values.',
  seriesToggle: 'Whether viewers may show or hide individual series.',
  showTable: 'Whether an accessible data table accompanies the chart.',
  shuffle: 'Whether choices are shuffled deterministically from the block id.',
  size: 'Display size or bounded text size.',
  source: 'Declared source or attribution; it does not trigger a network request.',
  spec: 'Chart specification validated by the shared ChartSpec schema.',
  src: 'Safe media source: avatar id, bounded raster data URI or relative asset path.',
  start: 'Starting value or label for this operation.',
  startLabel: 'Visible label for the action that starts the embedded app.',
  step: 'Presentation reveal step, from zero to thirty-two.',
  style: 'Allow-listed visual style for this block.',
  submitLabel: 'Visible label on the form submit action.',
  subtitle: 'Supporting line shown beneath the main heading.',
  successMessage: 'Confirmation text shown after a simulated form submission.',
  test: 'Closed condition expression evaluated against the declared data.',
  text: 'Plain text or short markdown content, according to the block field.',
  time: 'Time label displayed for this schedule or timeline item.',
  title: 'Short title naming this content or action.',
  tone: 'Theme tone from the closed palette; raw colors and CSS are not accepted.',
  trend: 'Bounded numeric sparkline values shown with this statistic.',
  type: 'Discriminator selecting a block or nested data shape.',
  unit: 'Visible unit appended to this numeric value.',
  value: 'Value displayed or supplied to this operation.',
  values: 'Typed values corresponding to the declared columns or series.',
  variant: 'Allow-listed visual variant for this block.',
  width: 'Width in CSS pixels or a bounded media dimension.',
  widths: 'Allow-listed relative widths for the column groups.',
};

type JsonSchema = Record<string, unknown>;

function addPropertyDescriptions(value: unknown): void {
  if (!value || typeof value !== 'object') return;
  const schema = value as JsonSchema;
  const properties = schema.properties;
  if (properties && typeof properties === 'object' && !Array.isArray(properties)) {
    for (const [name, property] of Object.entries(properties)) {
      const description = PROPERTY_DESCRIPTIONS[name];
      if (!description) throw new Error(`Missing JSON Schema property description for "${name}"`);
      if (property && typeof property === 'object') {
        (property as JsonSchema).description = description;
      }
    }
  }
  for (const child of Object.values(schema)) {
    if (child && typeof child === 'object') {
      if (Array.isArray(child)) child.forEach(addPropertyDescriptions);
      else addPropertyDescriptions(child);
    }
  }
}

function splitBlockDefinitions(schema: JsonSchema): void {
  const variants = schema.oneOf;
  if (!Array.isArray(variants)) return;
  const definitions = { ...((schema.$defs as Record<string, unknown> | undefined) ?? {}) };
  const refs: JsonSchema[] = [];
  for (const variant of variants) {
    if (!variant || typeof variant !== 'object') continue;
    const properties = (variant as JsonSchema).properties as JsonSchema | undefined;
    const typeProperty = properties?.type as JsonSchema | undefined;
    const type = typeProperty?.const;
    if (typeof type !== 'string') throw new Error('Every block schema must declare its type');
    definitions[type] = variant;
    refs.push({ $ref: `#/$defs/${type}` });
  }
  schema.$defs = definitions;
  schema.oneOf = refs;
}

function addBlockDescriptions(schema: JsonSchema): void {
  const definitions = schema.$defs as Record<string, unknown> | undefined;
  if (!definitions) return;
  const entries = new Map(BLOCK_CATALOG_LIST.map((entry) => [entry.type, entry]));
  for (const [name, variant] of Object.entries(definitions)) {
    if (!variant || typeof variant !== 'object') continue;
    const entry = entries.get(name as BlockType);
    if (entry) {
      (variant as JsonSchema).title = entry.label;
      (variant as JsonSchema).description = `${entry.useWhen[0]}. ${entry.limits.join('; ')}.`;
    }
  }
}

/** JSON Schema (draft 2020-12) for agents and blueprint kind documents. */
export function blocksJsonSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(BlockSchema, {
    io: 'input',
    target: 'draft-2020-12',
  }) as JsonSchema;
  splitBlockDefinitions(schema);
  addBlockDescriptions(schema);
  addPropertyDescriptions(schema);
  return {
    $schema: schema.$schema,
    $id: BLOCKS_SCHEMA_URL,
    title: 'Protoyard content blocks',
    description:
      'A bounded list item used to compose decks, pages and documents. Blocks are data only; scripts, HTML, raw styles and remote media are not accepted.',
    ...schema,
  };
}
