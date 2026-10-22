/**
 * Minimal and rich examples for every block type. Both parse with
 * `safeParseBlock` (asserted in catalog tests). Fictional data only.
 */

import type { Block, BlockType } from '../schema/index.ts';

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const MP4 = 'data:video/mp4;base64,AAAAIGZ0eXBpc29t';

const n = (value: number) => ({ op: 'num' as const, value });
const v = (name: string) => ({ op: 'var' as const, name });

const APP = {
  formatVersion: 1,
  name: 'Mini tracker',
  entities: [{ name: 'task', fields: [{ name: 'title', kind: 'text', required: true }] }],
  roles: [{ id: 'member', label: 'Member' }],
};

export const MINIMAL_EXAMPLES: Record<BlockType, Block> = {
  heading: { type: 'heading', text: 'Hi' },
  text: { type: 'text', markdown: 'Hello' },
  list: { type: 'list', items: [{ text: 'One item' }] },
  quote: { type: 'quote', quote: 'Keep it short.' },
  callout: { type: 'callout', body: 'Note' },
  divider: { type: 'divider' },
  image: { type: 'image', src: 'assets/cover.webp', alt: 'Cover', width: 1, height: 1 },
  video: { type: 'video', src: './clips/demo.mp4', label: 'Demo', width: 16, height: 9 },
  people: { type: 'people', people: [{ name: 'Ada Example' }] },
  stat: { type: 'stat', items: [{ value: '12', label: 'Items' }] },
  table: {
    type: 'table',
    caption: 'Plans',
    columns: [{ label: 'Name' }],
    rows: [['Starter']],
  },
  chart: {
    type: 'chart',
    spec: {
      kind: 'bar',
      title: 'Count',
      labels: ['A'],
      series: [{ label: 'n', values: [1] }],
    },
  },
  code: { type: 'code', code: 'x', lang: 'text' },
  timeline: {
    type: 'timeline',
    events: [
      { time: '2024', title: 'Start' },
      { time: '2026', title: 'Now' },
    ],
  },
  steps: {
    type: 'steps',
    items: [{ title: 'One' }, { title: 'Two' }],
  },
  comparison: {
    type: 'comparison',
    columns: [{ label: 'A' }, { label: 'B' }],
    rows: [{ label: 'Speed', values: ['Fast', 'Slow'] }],
  },
  cards: { type: 'cards', items: [{ title: 'Card' }] },
  icon: { type: 'icon', icon: 'star', decorative: true },
  cta: {
    type: 'cta',
    actions: [{ label: 'Open', href: 'https://example.com' }],
  },
  columns: {
    type: 'columns',
    columns: [[{ type: 'text', markdown: 'Left' }], [{ type: 'text', markdown: 'Right' }]],
  },
  tabs: {
    type: 'tabs',
    id: 'tabs-min',
    label: 'Tabs',
    panels: [
      { id: 'a', label: 'A', blocks: [{ type: 'text', markdown: 'A' }] },
      { id: 'b', label: 'B', blocks: [{ type: 'divider' }] },
    ],
  },
  reveal: {
    type: 'reveal',
    id: 'reveal-min',
    label: 'Show',
    blocks: [{ type: 'text', markdown: 'Hidden' }],
  },
  poll: {
    type: 'poll',
    id: 'poll-min',
    question: 'Pick one',
    options: [
      { id: 'yes', label: 'Yes' },
      { id: 'no', label: 'No' },
    ],
  },
  quiz: {
    type: 'quiz',
    id: 'quiz-min',
    questions: [
      {
        id: 'q1',
        prompt: 'One?',
        choices: [
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B' },
        ],
        answers: ['a'],
      },
    ],
  },
  calculator: {
    type: 'calculator',
    id: 'calc-min',
    inputs: [{ name: 'x', label: 'X', min: 0, max: 10, step: 1, default: 1 }],
    outputs: [{ id: 'y', label: 'Y', formula: v('x') }],
  },
  counter: { type: 'counter', id: 'counter-min', label: 'Count' },
  'chart-controls': {
    type: 'chart-controls',
    id: 'cc-min',
    spec: {
      kind: 'line',
      title: 'Trend',
      labels: ['a', 'b', 'c'],
      series: [
        { label: 'One', values: [1, 2, 3] },
        { label: 'Two', values: [2, 2, 4] },
      ],
    },
    seriesToggle: true,
  },
  map: {
    type: 'map',
    id: 'map-min',
    label: 'Map',
    basemap: 'port-meridian',
    points: [{ id: 'p1', label: 'Pier', lng: 0, lat: 0 }],
  },
  'embed-app': {
    type: 'embed-app',
    id: 'embed-min',
    title: 'Try it',
    app: APP,
  },
  form: {
    type: 'form',
    id: 'form-min',
    fields: [{ name: 'email', label: 'Email', type: 'email' }],
    submitLabel: 'Submit',
    successMessage: 'Thanks.',
  },
};

export const RICH_EXAMPLES: Record<BlockType, Block> = {
  heading: {
    type: 'heading',
    id: 'intro',
    text: 'Quarterly review',
    level: 1,
    eyebrow: 'Q3 2026',
    subtitle: 'Northwind Labs, fictional data',
    align: 'center',
    tone: 'accent',
  },
  text: {
    type: 'text',
    markdown: 'Revenue grew **18%**.\n\n- New logos\n- Expansion',
    size: 'lg',
    step: 1,
    reveal: 'fade-up',
  },
  list: {
    type: 'list',
    style: 'check',
    items: [
      { text: 'Ship the deck engine', done: true, icon: 'check' },
      { text: 'Measure budgets', done: false },
    ],
  },
  quote: {
    type: 'quote',
    quote: 'One idea per slide.',
    cite: 'Ada Rivera',
    role: 'Designer',
    avatar: 'av-007',
  },
  callout: {
    type: 'callout',
    title: 'Heads up',
    body: 'All numbers are **fictional**.',
    icon: 'info',
    tone: 'warning',
  },
  divider: { type: 'divider', label: 'Part two', variant: 'line' },
  image: {
    type: 'image',
    src: PNG,
    alt: 'A single pixel used as a placeholder',
    width: 640,
    height: 360,
    caption: 'Figure 1',
    credit: 'Fictional studio',
    fit: 'cover',
  },
  video: {
    type: 'video',
    src: MP4,
    label: 'Product walkthrough',
    width: 1280,
    height: 720,
    autoplay: true,
    muted: true,
    loop: true,
    poster: 'avatar:av-012',
  },
  people: {
    type: 'people',
    title: 'Team',
    layout: 'grid',
    people: [
      { name: 'Ada Rivera', role: 'Design', avatar: 'av-001' },
      { name: 'Marco Diaz', role: 'Engineering', bio: 'Builds the engine.' },
    ],
  },
  stat: {
    type: 'stat',
    items: [
      { value: '87%', label: 'Teams kept the habit', delta: '+12 pts', deltaTone: 'success' },
      { value: '$1.2M', label: 'ARR', trend: [10, 12, 15, 14, 19] },
    ],
    source: 'Fictional cohort, n = 412',
  },
  table: {
    type: 'table',
    caption: 'Plans',
    currency: 'USD',
    columns: [
      { label: 'Plan' },
      { label: 'Price', format: 'cents', align: 'end' },
      { label: 'Share', format: 'percent' },
    ],
    rows: [
      ['Starter', 900, 0.4],
      ['Team', 2900, null],
    ],
    highlightRow: 1,
  },
  chart: {
    type: 'chart',
    spec: {
      kind: 'bar',
      title: 'Signups by month',
      labels: ['Jan', 'Feb', 'Mar'],
      series: [{ label: 'Signups', values: [120, 180, 240] }],
    },
    height: 'md',
    showTable: true,
  },
  code: {
    type: 'code',
    lang: 'ts',
    filename: 'hello.ts',
    // biome-ignore lint/suspicious/noTemplateCurlyInString: fixture is TypeScript source.
    code: "const greet = (name: string) => `Hello, ${name}`;\nconsole.log(greet('deck'));",
    highlights: ['1', '2'],
    lineNumbers: true,
  },
  timeline: {
    type: 'timeline',
    orientation: 'horizontal',
    events: [
      { time: '2024', title: 'Prototype' },
      { time: '2026', title: 'Launch', tone: 'accent', icon: 'rocket' },
    ],
  },
  steps: {
    type: 'steps',
    numbered: true,
    items: [
      { title: 'Brief', body: 'Describe the topic.' },
      { title: 'Generate' },
      { title: 'Present', icon: 'presentation' },
    ],
  },
  comparison: {
    type: 'comparison',
    columns: [{ label: 'Option A', highlight: true }, { label: 'Option B' }],
    rows: [
      { label: 'Setup time', values: ['5 min', '1 day'] },
      { label: 'Self-host', values: [true, false] },
    ],
  },
  cards: {
    type: 'cards',
    columns: 3,
    items: [
      { title: 'Fast', icon: 'zap', body: 'Minutes from JSON.' },
      {
        title: 'Safe',
        href: 'https://example.com/docs',
        image: 'avatar:av-020',
        imageAlt: 'A face',
      },
      { title: 'Local', href: '#local', tone: 'success' },
    ],
  },
  icon: { type: 'icon', icon: 'rocket', label: 'Launch', size: 'xl' },
  cta: {
    type: 'cta',
    title: 'Try it',
    body: 'Start from a blueprint.',
    actions: [
      { label: 'Read the docs', href: 'https://example.com/docs', variant: 'primary' },
      { label: 'Email us', href: 'mailto:team@example.com', variant: 'link' },
    ],
    footnote: 'Fictional company.',
  },
  columns: {
    type: 'columns',
    widths: 'wide-start',
    align: 'start',
    columns: [
      [{ type: 'text', markdown: 'Left column' }],
      [{ type: 'icon', icon: 'check', decorative: true }],
    ],
  },
  tabs: {
    type: 'tabs',
    id: 'plans',
    label: 'Plans',
    defaultPanel: 'team',
    panels: [
      { id: 'solo', label: 'Solo', blocks: [{ type: 'text', markdown: 'For one person.' }] },
      { id: 'team', label: 'Team', icon: 'users', blocks: [{ type: 'divider' }] },
    ],
  },
  reveal: {
    type: 'reveal',
    id: 'answer',
    label: 'Show the answer',
    openLabel: 'Hide the answer',
    blocks: [{ type: 'text', markdown: '**42**' }],
  },
  poll: {
    type: 'poll',
    id: 'favorite',
    question: 'Which feature do you use most?',
    options: [
      { id: 'decks', label: 'Decks' },
      { id: 'pages', label: 'Pages' },
      { id: 'apps', label: 'Apps' },
    ],
    maxChoices: 2,
    results: 'after-vote',
  },
  quiz: {
    type: 'quiz',
    id: 'check',
    title: 'Quick check',
    feedback: 'immediate',
    passScore: 0.5,
    shuffle: true,
    questions: [
      {
        id: 'q1',
        prompt: 'What does a **tone** replace?',
        choices: [
          { id: 'css', label: 'CSS colors' },
          { id: 'fonts', label: 'Fonts' },
        ],
        answers: ['css'],
        explanation: 'Blocks never accept CSS.',
      },
    ],
  },
  calculator: {
    type: 'calculator',
    id: 'pricing',
    title: 'What would it cost?',
    currency: 'USD',
    inputs: [
      { name: 'seats', label: 'Seats', control: 'slider', min: 1, max: 200, step: 1, default: 10 },
    ],
    outputs: [
      {
        id: 'monthly',
        label: 'Per month',
        unit: 'cents',
        formula: { op: 'mul', left: v('seats'), right: n(1200) },
      },
    ],
  },
  counter: {
    type: 'counter',
    id: 'claps',
    label: 'Claps',
    start: 0,
    step: 1,
    min: 0,
    max: 100,
    unit: 'claps',
  },
  'chart-controls': {
    type: 'chart-controls',
    id: 'growth',
    spec: {
      kind: 'line',
      title: 'Signups',
      labels: ['Jan', 'Feb', 'Mar', 'Apr'],
      series: [
        { label: 'Organic', values: [10, 14, 20, 26] },
        { label: 'Paid', values: [4, 6, 9, 12] },
      ],
    },
    kinds: ['line', 'bar', 'area'],
    seriesToggle: true,
    range: true,
  },
  map: {
    type: 'map',
    id: 'stores',
    label: 'Stores on the simulated map',
    basemap: 'port-meridian',
    points: [
      { id: 'north', label: 'North pier', lng: -18.6, lat: -30.8, tone: 'accent' },
      { id: 'market', label: 'Market', lng: -18.4, lat: -31.1, icon: 'shopping-cart' },
    ],
    route: ['north', 'market'],
  },
  'embed-app': {
    type: 'embed-app',
    id: 'try-it',
    title: 'Try the tracker',
    height: 'md',
    startLabel: 'Open demo',
    app: APP,
  },
  form: {
    type: 'form',
    id: 'signup',
    title: 'Join the beta',
    submitLabel: 'Request access',
    successMessage: 'Thanks — we will email you.',
    fields: [
      { name: 'email', label: 'Work email', type: 'email', required: true },
      {
        name: 'role',
        label: 'Role',
        type: 'enum',
        options: [
          { value: 'eng', label: 'Engineering' },
          { value: 'design', label: 'Design' },
        ],
      },
    ],
  },
};
