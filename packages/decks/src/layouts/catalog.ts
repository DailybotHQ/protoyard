/**
 * Deck layout catalog — the developer's 19 layouts plus `chart` and `free`.
 *
 * Data only: id, prop schema, limits, useWhen / dontUseWhen, pacing fit.
 * No brand hex values and no site-specific class names. AUTHORING reads this
 * catalog; decks-ui renders each id lazily.
 */
import {
  BigStatPropsSchema,
  ChartLayoutPropsSchema,
  ClosingCtaPropsSchema,
  CodeWithCalloutPropsSchema,
  ComparisonTablePropsSchema,
  FreeLayoutPropsSchema,
  ImageCenteredPropsSchema,
  ImageFullBleedPropsSchema,
  ImageSidePropsSchema,
  ProcessStepsPropsSchema,
  QuotePropsSchema,
  SectionDividerPropsSchema,
  TeamAvatarsPropsSchema,
  ThreeColumnCardsPropsSchema,
  TimelinePropsSchema,
  TitleHeroPropsSchema,
  TwoColumnSplitPropsSchema,
  VideoCenteredPropsSchema,
  VideoSidePropsSchema,
} from './props.ts';
import type { DeckLayoutEntry, LayoutPacing } from './types.ts';

function entry<T>(
  def: Omit<DeckLayoutEntry<T>, 'limits'> & { limits: readonly string[] }
): DeckLayoutEntry<T> {
  return {
    ...def,
    limits: { summary: def.limits },
  };
}

const IMG = {
  src: 'assets/diagram.webp',
  alt: 'Diagram placeholder',
  width: 640,
  height: 480,
} as const;

const VID = {
  src: './clips/demo.mp4',
  label: 'Demo clip',
  width: 960,
  height: 540,
  muted: true,
} as const;

export const titleHero = entry({
  id: 'title-hero',
  label: 'Title hero',
  description: 'Opening cover: title, subtitle and meta line.',
  useWhen: ['Opening slide of a deck — title + subtitle + author + event line.'],
  dontUseWhen: ['Any slide other than the cover.'],
  pacing: ['punch', 'story'] satisfies LayoutPacing[],
  limits: ['title ≤ 100 characters', 'optional subtitle and meta'],
  propsSchema: TitleHeroPropsSchema,
  sample: {
    title: 'Your talk title',
    subtitle: 'A short one-line subtitle',
    meta: 'Author · Event · Year',
  },
});

export const sectionDivider = entry({
  id: 'section-divider',
  label: 'Section divider',
  description: 'Chapter break with optional eyebrow.',
  useWhen: ['Announcing a new chapter or section in the deck.'],
  dontUseWhen: ['As a content slide — it should pause the audience, not inform.'],
  pacing: ['punch'] satisfies LayoutPacing[],
  limits: ['title ≤ 120 characters', 'optional eyebrow'],
  propsSchema: SectionDividerPropsSchema,
  sample: { eyebrow: 'Chapter 02', title: 'The section title' },
});

export const twoColumnSplit = entry({
  id: 'two-column-split',
  label: 'Two-column split',
  description: 'Two parallel text columns.',
  useWhen: ['Comparing two ideas, before/after, problem/solution, text+text.'],
  dontUseWhen: ['More than two items (use three-column-cards).'],
  pacing: ['idea', 'diagram'] satisfies LayoutPacing[],
  limits: ['exactly two columns', 'body ≤ 600 characters each'],
  propsSchema: TwoColumnSplitPropsSchema,
  sample: {
    title: 'Two sides',
    left: { heading: 'Left', body: 'Short paragraph about the left idea.' },
    right: { heading: 'Right', body: 'Short paragraph about the right idea.' },
  },
});

export const threeColumnCards = entry({
  id: 'three-column-cards',
  label: 'Three-column cards',
  description: 'Three parallel cards with icon, heading and body.',
  useWhen: ['Three parallel concepts (pillars, features, principles).'],
  dontUseWhen: ['More than three — use a list or two slides instead.'],
  pacing: ['idea', 'diagram'] satisfies LayoutPacing[],
  limits: ['exactly 3 cards'],
  propsSchema: ThreeColumnCardsPropsSchema,
  sample: {
    title: 'Three pillars',
    cards: [
      { icon: 'zap', heading: 'Speed', body: 'Ship the smallest valuable thing first.' },
      { icon: 'compass', heading: 'Clarity', body: 'One sentence should explain it.' },
      { icon: 'users', heading: 'Trust', body: 'Make the next step obvious.' },
    ],
  },
});

export const imageLeft = entry({
  id: 'image-left',
  label: 'Image left',
  description: 'Image with explanatory text on the right.',
  useWhen: ['Walking through a screenshot, photo or diagram with text.'],
  dontUseWhen: ['The image is the whole message (use image-full-bleed).'],
  pacing: ['idea', 'diagram'] satisfies LayoutPacing[],
  limits: ['one image with alt', 'body ≤ 600 characters'],
  propsSchema: ImageSidePropsSchema,
  sample: {
    title: 'Image on the left',
    image: IMG,
    heading: 'What you are looking at',
    body: 'One short paragraph that anchors the image to the talk.',
  },
});

export const imageRight = entry({
  id: 'image-right',
  label: 'Image right',
  description: 'Text first, image second (Western reading flow).',
  useWhen: ['Same as image-left but text-first reading flow.'],
  dontUseWhen: ['See image-left.'],
  pacing: ['idea', 'story'] satisfies LayoutPacing[],
  limits: ['one image with alt', 'body ≤ 600 characters'],
  propsSchema: ImageSidePropsSchema,
  sample: {
    title: 'Image on the right',
    image: IMG,
    heading: 'Lead with the idea',
    body: 'Say it first, then anchor it visually.',
  },
});

export const imageCentered = entry({
  id: 'image-centered',
  label: 'Image centered',
  description: 'A single image is the focus.',
  useWhen: ['A single image is the focus — chart, diagram, screenshot with title.'],
  dontUseWhen: [
    'You need text alongside the image (use image-left / image-right).',
    'Image as background (use image-full-bleed).',
  ],
  pacing: ['diagram', 'punch'] satisfies LayoutPacing[],
  limits: ['one image with alt', 'optional caption'],
  propsSchema: ImageCenteredPropsSchema,
  sample: { title: 'Image title', image: IMG, caption: 'Optional caption' },
});

export const imageFullBleed = entry({
  id: 'image-full-bleed',
  label: 'Image full bleed',
  description: 'Image is the message, with optional caption.',
  useWhen: ['Image is the message (hero photo, quote-on-image).'],
  dontUseWhen: ['You have substantial content to say — use image-left/right.'],
  pacing: ['punch', 'story'] satisfies LayoutPacing[],
  limits: ['one image with alt', 'optional caption and credit'],
  propsSchema: ImageFullBleedPropsSchema,
  sample: { image: IMG, caption: 'Optional caption', credit: 'Credit line', overlay: 'dark' },
});

export const quote = entry({
  id: 'quote',
  label: 'Quote',
  description: 'A single short pull quote.',
  useWhen: ['A single short quote that earns the air it takes up.'],
  dontUseWhen: ['You cannot attribute it, or it is longer than two lines.'],
  pacing: ['punch', 'story'] satisfies LayoutPacing[],
  limits: ['quote ≤ 280 characters', 'optional cite'],
  propsSchema: QuotePropsSchema,
  sample: {
    quote: 'Build it small, kind, and on purpose.',
    cite: 'Author Name',
  },
});

export const codeWithCallout = entry({
  id: 'code-with-callout',
  label: 'Code with callout',
  description: 'Code block beside an explanation.',
  useWhen: ['Explaining what a code block does, side-by-side.'],
  dontUseWhen: ['Code is too long for a slide — use stepped highlights on one block.'],
  pacing: ['diagram', 'idea'] satisfies LayoutPacing[],
  limits: ['source ≤ 8,000 characters', '1–6 bullets', '≤ 16 highlight steps'],
  propsSchema: CodeWithCalloutPropsSchema,
  sample: {
    title: 'Code with callout',
    code: { lang: 'ts', source: 'const n = 1;\nconsole.log(n);', highlights: ['1'] },
    heading: 'What is happening',
    bullets: ['Declare a value', 'Log it for the demo'],
  },
});

export const bigStat = entry({
  id: 'big-stat',
  label: 'Big stat',
  description: 'A single number that lands a point.',
  useWhen: ['A single number that lands a point — adoption, scale, time saved.'],
  dontUseWhen: ['The number needs a full chart instead (use chart).'],
  pacing: ['punch'] satisfies LayoutPacing[],
  limits: ['one number and label', 'optional context and source'],
  propsSchema: BigStatPropsSchema,
  sample: {
    number: '87%',
    label: 'of teams kept the habit after 60 days',
    context: 'Fictional cohort',
    source: 'n = 412',
  },
});

export const comparisonTable = entry({
  id: 'comparison-table',
  label: 'Comparison table',
  description: '2–4 options across 3–5 attributes.',
  useWhen: ['Comparing 2–4 options across 3–5 attributes.'],
  dontUseWhen: ['More than four columns or a table that will not fit on a slide.'],
  pacing: ['diagram', 'idea'] satisfies LayoutPacing[],
  limits: ['2–4 columns', '3–5 rows', 'row value counts must match column count'],
  propsSchema: ComparisonTablePropsSchema,
  sample: {
    title: 'Comparison',
    columns: ['Option A', 'Option B'],
    rows: [
      { label: 'Setup', values: ['5 min', '1 day'] },
      { label: 'Self-host', values: [true, false] },
      { label: 'Best for', values: ['Solo', 'Teams'] },
    ],
  },
});

export const processSteps = entry({
  id: 'process-steps',
  label: 'Process steps',
  description: 'A 3–5 step linear process.',
  useWhen: ['A 3–5 step linear process or workflow.'],
  dontUseWhen: ['More than five steps (use timeline) or unordered items.'],
  pacing: ['idea', 'diagram'] satisfies LayoutPacing[],
  limits: ['3–5 steps'],
  propsSchema: ProcessStepsPropsSchema,
  sample: {
    title: 'How it works',
    steps: [
      { title: 'Define', body: 'Schemas and constraints.' },
      { title: 'Scaffold', body: 'Draft the structure.' },
      { title: 'Review', body: 'Read the diff.' },
      { title: 'Ship', body: 'Validate and publish.' },
    ],
  },
});

export const timeline = entry({
  id: 'timeline',
  label: 'Timeline',
  description: '4–8 dated events on a story arc.',
  useWhen: ['4–8 dated events forming a story arc.'],
  dontUseWhen: ['Dates are not important, or there are too many entries.'],
  pacing: ['story', 'diagram'] satisfies LayoutPacing[],
  limits: ['4–8 events'],
  propsSchema: TimelinePropsSchema,
  sample: {
    title: 'Timeline',
    events: [
      { time: '2017', text: 'First prototype' },
      { time: '2019', text: 'Public launch' },
      { time: '2022', text: 'Scale milestone' },
      { time: '2026', text: 'Today' },
    ],
  },
});

export const teamAvatars = entry({
  id: 'team-avatars',
  label: 'Team avatars',
  description: 'Up to eight people with optional avatars.',
  useWhen: ['Introducing your team or co-presenters.'],
  dontUseWhen: ['More than eight people (use a logo strip instead).'],
  pacing: ['idea', 'story'] satisfies LayoutPacing[],
  limits: ['1–8 people', 'optional avatar id'],
  propsSchema: TeamAvatarsPropsSchema,
  sample: {
    title: 'The team',
    people: [
      { name: 'Ada Example', role: 'Design', avatar: 'av-001' },
      { name: 'Marco Example', role: 'Engineering', avatar: 'av-002' },
    ],
  },
});

export const closingCta = entry({
  id: 'closing-cta',
  label: 'Closing CTA',
  description: 'Final slide with a primary action.',
  useWhen: ['Final slide — handle, CTA, contact channels.'],
  dontUseWhen: ['Mid-deck (use section-divider for breaks).'],
  pacing: ['punch', 'story'] satisfies LayoutPacing[],
  limits: ['one primary CTA link', 'optional footnote'],
  propsSchema: ClosingCtaPropsSchema,
  sample: {
    title: 'Thank you',
    text: 'Questions welcome after the talk.',
    cta: { label: 'Read the docs', href: 'https://example.com/docs' },
    footnote: 'Fictional company.',
  },
});

export const videoCentered = entry({
  id: 'video-centered',
  label: 'Video centered',
  description: 'A single video is the focus.',
  useWhen: ['A single video is the focus — demo, trailer, explainer clip.'],
  dontUseWhen: ['You need text alongside the video (use video-left / video-right).'],
  pacing: ['diagram', 'story'] satisfies LayoutPacing[],
  limits: ['one local/embedded video', 'optional caption'],
  propsSchema: VideoCenteredPropsSchema,
  sample: { title: 'Video title', video: VID, caption: 'Optional caption' },
});

export const videoLeft = entry({
  id: 'video-left',
  label: 'Video left',
  description: 'Video with explanatory text on the right.',
  useWhen: ['Walking through a demo or clip with explanatory text alongside.'],
  dontUseWhen: ['Video is the sole focus (use video-centered).'],
  pacing: ['idea', 'diagram'] satisfies LayoutPacing[],
  limits: ['one video', 'body ≤ 600 characters'],
  propsSchema: VideoSidePropsSchema,
  sample: {
    title: 'Video on the left',
    video: VID,
    heading: 'What you are watching',
    body: 'One short paragraph explaining the clip.',
  },
});

export const videoRight = entry({
  id: 'video-right',
  label: 'Video right',
  description: 'Text first, video second.',
  useWhen: ['Same as video-left but text-first reading flow.'],
  dontUseWhen: ['See video-left.'],
  pacing: ['idea', 'story'] satisfies LayoutPacing[],
  limits: ['one video', 'body ≤ 600 characters'],
  propsSchema: VideoSidePropsSchema,
  sample: {
    title: 'Video on the right',
    video: VID,
    heading: 'Lead with the idea',
    body: 'Say it first, then anchor with the clip.',
  },
});

export const chart = entry({
  id: 'chart',
  label: 'Chart',
  description: 'Bounded ChartSpec (line, area, bar, donut, pie, funnel).',
  useWhen: ['A real chart is clearer than a big-stat or table.'],
  dontUseWhen: ['A single number (use big-stat) or unvalidated chart JSON.'],
  pacing: ['diagram', 'idea'] satisfies LayoutPacing[],
  limits: ['ChartSpecSchema caps (≤ 366 points, ≤ 8 series)', 'optional data table'],
  propsSchema: ChartLayoutPropsSchema,
  sample: {
    title: 'Signups',
    spec: {
      kind: 'bar' as const,
      title: 'Signups by month',
      labels: ['Jan', 'Feb', 'Mar'],
      series: [{ label: 'Signups', values: [120, 180, 240] }],
    },
    height: 'md' as const,
    showTable: true,
  },
});

export const free = entry({
  id: 'free',
  label: 'Free blocks',
  description: 'Escape hatch: a list of validated content blocks.',
  useWhen: ['The catalog has no layout for this idea; compose from @protoyard/blocks.'],
  dontUseWhen: ['A catalog layout already fits — prefer it for lint and pacing.'],
  pacing: ['idea', 'diagram', 'story', 'punch'] satisfies LayoutPacing[],
  limits: ['1–48 blocks', 'full BlockListSchema rules'],
  propsSchema: FreeLayoutPropsSchema,
  sample: {
    blocks: [
      { type: 'heading' as const, text: 'Free layout', level: 2 as const },
      { type: 'text' as const, markdown: 'Compose any validated blocks here.' },
    ],
  },
});

/** All catalog layouts in stable order (19 site layouts + chart + free = 21). */
export const DECK_LAYOUTS = Object.freeze([
  titleHero,
  sectionDivider,
  twoColumnSplit,
  threeColumnCards,
  imageLeft,
  imageRight,
  imageCentered,
  imageFullBleed,
  quote,
  codeWithCallout,
  bigStat,
  comparisonTable,
  processSteps,
  timeline,
  teamAvatars,
  closingCta,
  videoCentered,
  videoLeft,
  videoRight,
  chart,
  free,
] as const satisfies readonly DeckLayoutEntry[]);

export type DeckLayoutId = (typeof DECK_LAYOUTS)[number]['id'];

/** Lookup map by layout id. */
export const DECK_LAYOUT_BY_ID: Readonly<Record<string, DeckLayoutEntry>> = Object.freeze(
  Object.fromEntries(DECK_LAYOUTS.map((layout) => [layout.id, layout]))
);

export function getDeckLayout(id: string): DeckLayoutEntry | undefined {
  // Own keys only: an untrusted id such as `constructor` must never resolve through the prototype.
  return Object.hasOwn(DECK_LAYOUT_BY_ID, id) ? DECK_LAYOUT_BY_ID[id] : undefined;
}

export const DECK_LAYOUT_IDS: readonly string[] = Object.freeze(DECK_LAYOUTS.map((l) => l.id));

export type LayoutPropsIssue = {
  path: (string | number)[];
  message: string;
};

/**
 * Validate props for a known layout id. Unknown ids fail with a stable message.
 */
export function parseLayoutProps(
  id: string,
  props: unknown
):
  | { success: true; data: unknown; issues: [] }
  | { success: false; data: null; issues: LayoutPropsIssue[] } {
  const layout = getDeckLayout(id);
  if (!layout) {
    return {
      success: false,
      data: null,
      issues: [
        {
          path: ['layout'],
          message: `Unknown layout "${id}". Use one of: ${DECK_LAYOUT_IDS.join(', ')}.`,
        },
      ],
    };
  }
  const result = layout.propsSchema.safeParse(props);
  if (result.success) return { success: true, data: result.data, issues: [] };
  return {
    success: false,
    data: null,
    issues: result.error.issues.map((issue) => ({
      path: issue.path.filter(
        (segment): segment is string | number =>
          typeof segment === 'string' || typeof segment === 'number'
      ),
      message: issue.message,
    })),
  };
}

/** Agent-readable summary of every layout (id, when to use, limits). */
export function describeLayouts(): string {
  const lines = [
    'Deck layout catalog (@protoyard/decks/layouts)',
    `${DECK_LAYOUTS.length} layouts: 19 content primitives + chart + free.`,
    '',
  ];
  for (const layout of DECK_LAYOUTS) {
    lines.push(`## ${layout.id} — ${layout.label}`);
    lines.push(layout.description);
    lines.push(`Pacing: ${layout.pacing.join(', ')}`);
    lines.push('Use when:');
    for (const item of layout.useWhen) lines.push(`- ${item}`);
    lines.push("Don't use when:");
    for (const item of layout.dontUseWhen) lines.push(`- ${item}`);
    lines.push('Limits:');
    for (const item of layout.limits.summary) lines.push(`- ${item}`);
    lines.push('');
  }
  return lines.join('\n');
}
