/**
 * Deterministic deck outline templates (ADR-036, ADR-038): pitch, QBR,
 * launch, status, training, talk, report and lesson. A brief picks a template
 * by whole-word cues (or an explicit `outline`) and an optional slide count
 * ("12 slides", "a 10-minute talk"); the result is a deck body of free slides
 * built from `@protoyard/blocks` blocks, plus a per-slide plan (role, pacing,
 * purpose) that layout selection reads.
 *
 * Honest scaffolding, never research: every slide body is a placeholder marked
 * `*Draft:*` that says what to write. No facts, numbers, quotes, names or
 * chart data are invented; metrics show "—", charts are a note asking for
 * real data, quizzes and polls hold placeholder questions.
 *
 * Pacing follows the developer's keynote method: punch (≤ 8 s, one line),
 * idea (≤ 25 s, one concept), diagram (a structure to walk through) and story
 * (an example told in sequence).
 */
import { hasPhrase, normalize } from './text.ts';

export const DECK_OUTLINE_IDS = [
  'pitch',
  'qbr',
  'launch',
  'status',
  'training',
  'lesson',
  'report',
  'talk',
] as const;
export type DeckOutlineId = (typeof DECK_OUTLINE_IDS)[number];

/** How long a slide holds the room (A punch, B idea, C diagram, D story). */
export type DeckPacing = 'punch' | 'idea' | 'diagram' | 'story';

/** Caps for synthesized outlines (far inside the deck schema's own limits). */
export const DECK_OUTLINE_LIMITS = Object.freeze({
  /** No template has more slides than this. */
  maxSlides: 16,
  /** Title text taken from the brief. */
  titleLength: 80,
  /** Characters of the brief read when picking a template. */
  briefLength: 5_000,
});

/** The block builders a template slide can use. */
type SlideBody =
  | 'title'
  | 'agenda'
  | 'statement'
  | 'bullets'
  | 'checklist'
  | 'metrics'
  | 'chart-note'
  | 'steps'
  | 'timeline'
  | 'comparison'
  | 'cards'
  | 'quote'
  | 'people'
  | 'risk'
  | 'poll'
  | 'quiz'
  | 'close';

interface TemplateSlide {
  /** Stable id suffix: the slide id is `slide-<key>`. */
  key: string;
  /** Semantic role, read by layout selection. */
  role: string;
  pacing: DeckPacing;
  title: string;
  body: SlideBody;
  /** What the author should put here (also the speaker-note guidance). */
  purpose: string;
  /** Core slides are always included; optional ones fill a requested count. */
  core: boolean;
}

interface DeckOutlineTemplate {
  id: DeckOutlineId;
  label: string;
  /** Whole-word phrases in the brief that select this template. */
  cues: readonly string[];
  slides: readonly TemplateSlide[];
}

const s = (
  key: string,
  role: string,
  pacing: DeckPacing,
  title: string,
  body: SlideBody,
  purpose: string,
  core = true
): TemplateSlide => ({ key, role, pacing, title, body, purpose, core });

const TITLE = s(
  'title',
  'title',
  'punch',
  '',
  'title',
  'Open with the title and who is presenting.'
);

export const DECK_OUTLINES: readonly DeckOutlineTemplate[] = [
  {
    id: 'pitch',
    label: 'Pitch',
    cues: [
      'pitch',
      'pitch deck',
      'investor',
      'investors',
      'fundraising',
      'fundraise',
      'seed round',
      'series a',
      'raise',
    ],
    slides: [
      TITLE,
      s(
        'problem',
        'problem',
        'story',
        'The problem',
        'statement',
        'State the problem in one sentence: who has it, and how often.'
      ),
      s(
        'solution',
        'solution',
        'idea',
        'Our solution',
        'bullets',
        'Explain how the product solves the problem, in three points.'
      ),
      s(
        'why-now',
        'why-now',
        'idea',
        'Why now',
        'bullets',
        'Name the change that makes this possible or urgent today.',
        false
      ),
      s(
        'product',
        'demo',
        'story',
        'How it works',
        'steps',
        'Walk through the product in three steps a customer takes.',
        false
      ),
      s(
        'traction',
        'metrics',
        'punch',
        'Traction',
        'metrics',
        'Show the few numbers that prove demand. Cite a source for each.'
      ),
      s(
        'model',
        'business-model',
        'idea',
        'Business model',
        'bullets',
        'Explain who pays, how much, and why they keep paying.',
        false
      ),
      s(
        'competition',
        'comparison',
        'diagram',
        'Competition',
        'comparison',
        'Compare your approach with the main alternatives, honestly.',
        false
      ),
      s(
        'team',
        'team',
        'idea',
        'Team',
        'people',
        'Introduce the people and why they can build this.'
      ),
      s(
        'roadmap',
        'roadmap',
        'diagram',
        'Roadmap',
        'timeline',
        'Show the next milestones and what each one proves.',
        false
      ),
      s(
        'ask',
        'ask',
        'punch',
        'The ask',
        'statement',
        'Say exactly what you are asking for and what it unlocks.'
      ),
      s('close', 'close', 'punch', 'Thank you', 'close', 'Close with how to follow up.'),
    ],
  },
  {
    id: 'qbr',
    label: 'Quarterly business review',
    cues: [
      'qbr',
      'quarterly business review',
      'quarterly review',
      'business review',
      'quarter in review',
      'quarterly',
    ],
    slides: [
      TITLE,
      s('agenda', 'agenda', 'idea', 'Agenda', 'agenda', 'List what the review covers.'),
      s(
        'highlights',
        'metrics',
        'punch',
        'Quarter highlights',
        'metrics',
        'Show the headline numbers for the quarter, with sources.'
      ),
      s(
        'trend',
        'chart',
        'diagram',
        'Trend',
        'chart-note',
        'Chart the key metric over the quarter from your own data.',
        false
      ),
      s('wins', 'wins', 'idea', 'Wins', 'checklist', 'List what went well and why.'),
      s(
        'misses',
        'misses',
        'idea',
        'Misses',
        'bullets',
        'List what fell short and what you learned.'
      ),
      s(
        'customer',
        'quote',
        'story',
        'Customer voice',
        'quote',
        'Share a quote you have permission to use.',
        false
      ),
      s(
        'risks',
        'risks',
        'idea',
        'Risks',
        'risk',
        'Name the risks for next quarter and how you will handle them.',
        false
      ),
      s(
        'next',
        'plan',
        'diagram',
        'Next quarter',
        'steps',
        'Lay out the priorities for next quarter.'
      ),
      s(
        'asks',
        'ask',
        'punch',
        'What we need',
        'statement',
        'Ask for the decisions or support you need.',
        false
      ),
      s(
        'close',
        'close',
        'punch',
        'Questions',
        'close',
        'Open the floor and say how to follow up.'
      ),
    ],
  },
  {
    id: 'launch',
    label: 'Launch',
    cues: [
      'launch',
      'launching',
      'product launch',
      'go to market',
      'gtm',
      'announcement',
      'announce',
      'unveil',
      'release',
    ],
    slides: [
      TITLE,
      s(
        'why',
        'problem',
        'story',
        'Why we built it',
        'statement',
        'Tell the need that led to this launch.'
      ),
      s(
        'what',
        'solution',
        'idea',
        'What is new',
        'cards',
        'Introduce the main capabilities, one card each.'
      ),
      s(
        'how',
        'demo',
        'diagram',
        'How it works',
        'steps',
        'Walk through the first use in three steps.'
      ),
      s(
        'who',
        'audience',
        'idea',
        'Who it is for',
        'bullets',
        'Describe who benefits most.',
        false
      ),
      s(
        'compare',
        'comparison',
        'diagram',
        'Before and after',
        'comparison',
        'Compare the old way with the new one.',
        false
      ),
      s(
        'availability',
        'roadmap',
        'diagram',
        'Availability',
        'timeline',
        'Say when and where it is available, phase by phase.'
      ),
      s(
        'pricing',
        'pricing',
        'idea',
        'Pricing',
        'bullets',
        'Summarize plans and prices once they are final.',
        false
      ),
      s('close', 'close', 'punch', 'Try it', 'close', 'Tell people how to get started.'),
    ],
  },
  {
    id: 'status',
    label: 'Status update',
    cues: [
      'status update',
      'status report',
      'weekly update',
      'project update',
      'progress update',
      'progress report',
      'sprint review',
      'standup',
      'status',
    ],
    slides: [
      TITLE,
      s(
        'summary',
        'metrics',
        'punch',
        'Summary',
        'metrics',
        'Give the overall status and the few numbers behind it.'
      ),
      s(
        'progress',
        'progress',
        'diagram',
        'Progress',
        'timeline',
        'Show where the work stands against the plan.'
      ),
      s(
        'done',
        'wins',
        'idea',
        'Done',
        'checklist',
        'List what was completed since the last update.'
      ),
      s('next', 'plan', 'idea', 'Next', 'bullets', 'List what happens before the next update.'),
      s(
        'risks',
        'risks',
        'idea',
        'Risks and blockers',
        'risk',
        'Name each blocker, its owner and the help you need.'
      ),
      s(
        'decisions',
        'ask',
        'punch',
        'Decisions needed',
        'statement',
        'Ask for the decisions you need, with a deadline.',
        false
      ),
      s('close', 'close', 'punch', 'Questions', 'close', 'Say when the next update is.', false),
    ],
  },
  {
    id: 'training',
    label: 'Training',
    cues: [
      'training',
      'onboarding',
      'workshop',
      'tutorial',
      'enablement',
      'how to',
      'course',
      'bootcamp',
    ],
    slides: [
      TITLE,
      s(
        'objectives',
        'objectives',
        'idea',
        'What you will learn',
        'checklist',
        'List three things people can do after this session.'
      ),
      s('agenda', 'agenda', 'idea', 'Agenda', 'agenda', 'List the parts of the session.'),
      s(
        'concept',
        'concept',
        'idea',
        'Key idea',
        'statement',
        'Explain the main concept in plain words.'
      ),
      s(
        'walkthrough',
        'demo',
        'diagram',
        'Step by step',
        'steps',
        'Show the procedure step by step.'
      ),
      s(
        'example',
        'example',
        'story',
        'Example',
        'statement',
        'Work through one realistic, fictional example.',
        false
      ),
      s(
        'practice',
        'quiz',
        'idea',
        'Check your understanding',
        'quiz',
        'Ask one question that shows whether the idea landed.'
      ),
      s(
        'mistakes',
        'risks',
        'idea',
        'Common mistakes',
        'risk',
        'Warn about the mistakes beginners make.',
        false
      ),
      s(
        'recap',
        'recap',
        'idea',
        'Recap',
        'checklist',
        'Repeat the objectives as things people can now do.'
      ),
      s(
        'resources',
        'resources',
        'idea',
        'Resources',
        'bullets',
        'Point to further reading or help.',
        false
      ),
      s('close', 'close', 'punch', 'Questions', 'close', 'Say where to ask questions later.'),
    ],
  },
  {
    id: 'lesson',
    label: 'Lesson',
    cues: [
      'lesson',
      'lecture',
      'class',
      'classroom',
      'students',
      'teach',
      'teaching',
      'curriculum',
      'syllabus',
    ],
    slides: [
      TITLE,
      s(
        'objectives',
        'objectives',
        'idea',
        'Learning objectives',
        'checklist',
        'List what students will be able to do.'
      ),
      s(
        'warm-up',
        'poll',
        'punch',
        'Warm-up',
        'poll',
        'Ask a quick question to see what the class already knows.',
        false
      ),
      s(
        'concept',
        'concept',
        'idea',
        'Concept',
        'statement',
        'Introduce the concept in one clear sentence.'
      ),
      s(
        'example',
        'example',
        'story',
        'Worked example',
        'steps',
        'Solve one example step by step.'
      ),
      s('check', 'quiz', 'idea', 'Quick check', 'quiz', 'Ask one question to check understanding.'),
      s(
        'activity',
        'activity',
        'diagram',
        'Activity',
        'steps',
        'Describe a short activity students do now.',
        false
      ),
      s('recap', 'recap', 'idea', 'Recap', 'checklist', 'Summarize what was learned.'),
      s(
        'homework',
        'homework',
        'idea',
        'Practice at home',
        'bullets',
        'Give the follow-up practice.',
        false
      ),
    ],
  },
  {
    id: 'report',
    label: 'Report',
    cues: [
      'report',
      'findings',
      'results',
      'analysis',
      'research',
      'survey results',
      'annual report',
      'retrospective',
      'retro',
      'postmortem',
    ],
    slides: [
      TITLE,
      s(
        'summary',
        'metrics',
        'punch',
        'Key findings',
        'metrics',
        'Lead with the headline results and their sources.'
      ),
      s('context', 'context', 'idea', 'Context', 'statement', 'Say what was studied and why.'),
      s(
        'method',
        'method',
        'diagram',
        'Method',
        'steps',
        'Describe how the data was gathered.',
        false
      ),
      s(
        'findings',
        'findings',
        'idea',
        'Findings',
        'cards',
        'Present each finding on its own card.'
      ),
      s(
        'evidence',
        'chart',
        'diagram',
        'Evidence',
        'chart-note',
        'Chart the strongest finding from your own data.',
        false
      ),
      s(
        'recommendations',
        'recommendations',
        'idea',
        'Recommendations',
        'checklist',
        'Turn the findings into recommendations.'
      ),
      s('next', 'plan', 'diagram', 'Next steps', 'timeline', 'Lay out who does what, and when.'),
      s(
        'limits',
        'risks',
        'idea',
        'Limitations',
        'risk',
        'State what the data cannot tell you.',
        false
      ),
      s(
        'close',
        'close',
        'punch',
        'Questions',
        'close',
        'Say where to find the full report.',
        false
      ),
    ],
  },
  {
    id: 'talk',
    label: 'Talk',
    cues: [
      'talk',
      'keynote',
      'conference',
      'meetup',
      'speech',
      'presentation',
      'slides',
      'slide deck',
      'deck',
    ],
    slides: [
      TITLE,
      s(
        'hook',
        'hook',
        'punch',
        'The hook',
        'statement',
        'Open with one surprising line that frames the talk.'
      ),
      s(
        'speaker',
        'team',
        'idea',
        'About me',
        'people',
        'Say who you are and why you are giving this talk.',
        false
      ),
      s('agenda', 'agenda', 'idea', 'Agenda', 'agenda', 'List the parts of the talk.', false),
      s(
        'idea-1',
        'concept',
        'idea',
        'First idea',
        'statement',
        'Make the first point, one idea per slide.'
      ),
      s('story', 'story', 'story', 'A story', 'steps', 'Tell an example in three beats.', false),
      s(
        'idea-2',
        'concept',
        'idea',
        'Second idea',
        'bullets',
        'Make the second point with up to three supports.'
      ),
      s(
        'poll',
        'poll',
        'punch',
        'Quick poll',
        'poll',
        'Ask the audience a question to keep them involved.',
        false
      ),
      s(
        'idea-3',
        'concept',
        'diagram',
        'Third idea',
        'steps',
        'Show the third point as a sequence.',
        false
      ),
      s(
        'takeaways',
        'recap',
        'idea',
        'Takeaways',
        'checklist',
        'List the three things to remember.'
      ),
      s('close', 'close', 'punch', 'Thank you', 'close', 'Say how to reach you.'),
    ],
  },
];

const BY_ID = new Map(DECK_OUTLINES.map((template) => [template.id, template]));

// ── brief reading ─────────────────────────────────────────────────────────

const NUMBER_WORDS: Readonly<Record<string, number>> = {
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  twenty: 20,
  thirty: 30,
};

/** A slide count the brief asks for: "12 slides", "ten-slide", "a 15-minute talk" (one slide a minute). */
export function requestedSlideCount(brief: string): number | null {
  const text = brief.slice(0, DECK_OUTLINE_LIMITS.briefLength).toLowerCase();
  const count = /\b(\d{1,3}|[a-z]+)[\s-]*slides?\b/.exec(text);
  if (count) {
    const value = Number.isNaN(Number(count[1]))
      ? NUMBER_WORDS[count[1] as string]
      : Number(count[1]);
    if (value !== undefined && value > 0) return value;
  }
  const minutes = /\b(\d{1,3}|[a-z]+)[\s-]*(?:minutes?|min)\b/.exec(text);
  if (minutes) {
    const value = Number.isNaN(Number(minutes[1]))
      ? NUMBER_WORDS[minutes[1] as string]
      : Number(minutes[1]);
    if (value !== undefined && value > 0) return value;
  }
  return null;
}

/** The template a brief asks for, with the cues that matched (longest phrase wins ties). */
export function chooseDeckOutline(brief: string): { id: DeckOutlineId; cues: string[] } {
  const normalized = normalize(brief.slice(0, DECK_OUTLINE_LIMITS.briefLength));
  let best: { id: DeckOutlineId; cues: string[]; score: number } | null = null;
  for (const template of DECK_OUTLINES) {
    const cues = template.cues.filter((cue) => hasPhrase(normalized, cue));
    // Multi-word cues count more: "status update" beats "update", "pitch deck" beats "deck".
    const score = cues.reduce((sum, cue) => sum + cue.split(' ').length, 0);
    if (score > 0 && (best === null || score > best.score)) best = { id: template.id, cues, score };
  }
  return best ? { id: best.id, cues: best.cues } : { id: 'talk', cues: [] };
}

// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping them is the point.
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g;

/** A deck title from the brief: the topic after "about/on/for", else the first sentence. */
export function deckTitleFromBrief(brief: string, fallback = 'Untitled deck'): string {
  const text = brief
    .slice(0, DECK_OUTLINE_LIMITS.briefLength)
    .replace(CONTROL, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const sentence = text.split(/(?<=[.!?])\s/)[0] ?? '';
  const topic = /\b(?:about|on|covering|for)\s+(.{3,}?)\s*[.!?]?$/i.exec(sentence)?.[1];
  const raw = (topic ?? sentence).replace(/[.!?]+$/, '').trim();
  if (!raw) return fallback;
  const title = raw.charAt(0).toUpperCase() + raw.slice(1);
  if (title.length <= DECK_OUTLINE_LIMITS.titleLength) return title;
  const cut = title.slice(0, DECK_OUTLINE_LIMITS.titleLength - 1);
  return `${cut.slice(0, cut.lastIndexOf(' ') > 40 ? cut.lastIndexOf(' ') : cut.length).trimEnd()}…`;
}

// ── slide bodies (data for @protoyard/blocks) ─────────────────────────────

/** Plain JSON blocks; the test validates every one with `@protoyard/blocks`. */
type BlockJson = Record<string, unknown>;

const draft = (text: string) => `*Draft:* ${text}`;
const heading = (text: string, level = 2): BlockJson => ({ type: 'heading', text, level });

function bodyBlocks(
  slide: TemplateSlide,
  deckTitle: string,
  agenda: readonly string[]
): BlockJson[] {
  const id = (suffix: string) => `${slide.key}-${suffix}`;
  const items = (count: number, style?: 'check') => ({
    type: 'list',
    ...(style ? { style } : {}),
    items: Array.from({ length: count }, (_, i) => ({ text: draft(`point ${i + 1}.`) })),
  });
  switch (slide.body) {
    case 'title':
      return [
        { type: 'heading', text: deckTitle, level: 1 },
        { type: 'text', markdown: draft('presenter name and date.'), size: 'lg' },
      ];
    case 'agenda':
      return [
        heading(slide.title),
        { type: 'list', style: 'number', items: agenda.map((text) => ({ text })) },
      ];
    case 'statement':
      return [heading(slide.title), { type: 'text', markdown: draft(slide.purpose), size: 'lg' }];
    case 'bullets':
      return [heading(slide.title), { type: 'text', markdown: draft(slide.purpose) }, items(3)];
    case 'checklist':
      return [
        heading(slide.title),
        { type: 'text', markdown: draft(slide.purpose) },
        items(3, 'check'),
      ];
    case 'metrics':
      return [
        heading(slide.title),
        {
          type: 'stat',
          items: [1, 2, 3].map((n) => ({
            value: '—',
            label: `Metric ${n}`,
            context: 'Draft: add a sourced value.',
          })),
          source: 'Draft: cite where each number comes from.',
        },
      ];
    case 'chart-note':
      return [
        heading(slide.title),
        {
          type: 'callout',
          tone: 'info',
          title: 'Add your data',
          body: draft(
            `${slide.purpose} Replace this note with a chart block; no data was generated.`
          ),
        },
      ];
    case 'steps':
      return [
        heading(slide.title),
        {
          type: 'steps',
          items: [1, 2, 3].map((n) => ({ title: `Step ${n}`, body: draft('describe this step.') })),
        },
      ];
    case 'timeline':
      return [
        heading(slide.title),
        {
          type: 'timeline',
          events: [1, 2, 3].map((n) => ({
            time: `Phase ${n}`,
            title: `Milestone ${n}`,
            body: draft('add the date and outcome.'),
          })),
        },
      ];
    case 'comparison':
      return [
        heading(slide.title),
        { type: 'text', markdown: draft(slide.purpose) },
        {
          type: 'comparison',
          columns: [{ label: 'Our approach', highlight: true }, { label: 'Alternative' }],
          rows: [1, 2, 3].map((n) => ({ label: `Criterion ${n}`, values: ['—', '—'] })),
        },
      ];
    case 'cards':
      return [
        heading(slide.title),
        {
          type: 'cards',
          columns: 3,
          items: [1, 2, 3].map((n) => ({
            title: `Item ${n}`,
            body: draft('one or two sentences.'),
          })),
        },
      ];
    case 'quote':
      return [
        heading(slide.title),
        { type: 'quote', quote: draft('a quote you have permission to use.'), cite: 'Source' },
      ];
    case 'people':
      return [
        heading(slide.title),
        {
          type: 'people',
          people: [1, 2, 3].map((n) => ({
            name: `Person ${n}`,
            role: 'Role',
            bio: 'Draft: one line of relevant experience.',
          })),
        },
      ];
    case 'risk':
      return [
        heading(slide.title),
        { type: 'callout', tone: 'warning', title: 'Draft', body: draft(slide.purpose) },
        items(2),
      ];
    case 'poll':
      return [
        heading(slide.title),
        {
          type: 'poll',
          id: id('poll'),
          question: 'Draft: replace with your question',
          options: [
            { id: 'option-a', label: 'Option A' },
            { id: 'option-b', label: 'Option B' },
            { id: 'option-c', label: 'Option C' },
          ],
        },
      ];
    case 'quiz':
      return [
        heading(slide.title),
        {
          type: 'quiz',
          id: id('quiz'),
          questions: [
            {
              id: 'question-1',
              prompt: draft('replace with a question that checks the key idea.'),
              choices: [
                { id: 'choice-a', label: 'Draft: correct answer' },
                { id: 'choice-b', label: 'Draft: plausible wrong answer' },
                { id: 'choice-c', label: 'Draft: another wrong answer' },
              ],
              answers: ['choice-a'],
              explanation: draft('explain why the answer is right.'),
            },
          ],
        },
      ];
    case 'close':
      return [heading(slide.title), { type: 'text', markdown: draft(slide.purpose), size: 'lg' }];
  }
}

const PACING_NOTES: Readonly<Record<DeckPacing, string>> = {
  punch: 'Punch slide: one line, about 8 seconds. Say it and move on.',
  idea: 'Idea slide: one concept, up to about 25 seconds.',
  diagram: 'Diagram slide: walk through the structure in order.',
  story: 'Story slide: tell it as a short sequence with a clear point.',
};

// ── synthesis ─────────────────────────────────────────────────────────────

export interface DeckOutlineOptions {
  /** Use this template instead of reading cues from the brief. */
  outline?: DeckOutlineId;
  /** Slide count; overrides a count read from the brief. Clamped to the template. */
  slides?: number;
  /** Deck title; default: the topic of the brief. */
  title?: string;
}

/** One slide of the synthesized deck body: a free slide of blocks. */
export interface DeckOutlineSlide {
  id: string;
  title: string;
  layout: 'free';
  blocks: BlockJson[];
  notes: string;
}

/** Per-slide data for layout selection and lint. */
export interface DeckSlidePlan {
  id: string;
  role: string;
  pacing: DeckPacing;
  purpose: string;
  core: boolean;
}

export interface DeckOutlineResult {
  outline: DeckOutlineId;
  label: string;
  /** The deck body (the blueprint's `deck` key). */
  deck: { title: string; aspect: '16:9'; slides: DeckOutlineSlide[] };
  plan: DeckSlidePlan[];
  rationale: string[];
  /** The count asked for (options or brief), before clamping; null when none. */
  requestedSlides: number | null;
}

/** The slide-count range a template supports: its core slides up to all slides. */
export function deckOutlineRange(id: DeckOutlineId): { min: number; max: number } {
  const template = BY_ID.get(id) as DeckOutlineTemplate;
  return { min: template.slides.filter((slide) => slide.core).length, max: template.slides.length };
}

/**
 * Builds a draft deck outline from a brief. Pure and deterministic: the same
 * brief and options give the same slide ids, order, blocks and rationale.
 */
export function synthesizeDeckOutline(
  brief: string,
  options: DeckOutlineOptions = {}
): DeckOutlineResult {
  const chosen = options.outline ? { id: options.outline, cues: [] } : chooseDeckOutline(brief);
  const template = BY_ID.get(chosen.id) as DeckOutlineTemplate;
  const range = deckOutlineRange(template.id);
  const asked = options.slides ?? requestedSlideCount(brief);
  const target =
    asked === null ? range.min : Math.min(range.max, Math.max(range.min, Math.floor(asked)));

  // Core slides always; optional slides in template order until the target is met.
  let optionalLeft = target - range.min;
  const slides = template.slides.filter((slide) => {
    if (slide.core) return true;
    if (optionalLeft <= 0) return false;
    optionalLeft -= 1;
    return true;
  });

  const title = (
    options.title?.trim() || deckTitleFromBrief(brief, `${template.label} deck`)
  ).slice(0, DECK_OUTLINE_LIMITS.titleLength);
  const agenda = slides
    .filter((slide) => !['title', 'agenda', 'close'].includes(slide.role))
    .map((slide) => slide.title)
    .slice(0, 6);

  const rationale = [
    options.outline
      ? `Outline: ${template.label} (chosen explicitly).`
      : chosen.cues.length > 0
        ? `Outline: ${template.label} (matched ${chosen.cues.map((cue) => `"${cue}"`).join(', ')}).`
        : `Outline: ${template.label} (no outline cue in the brief; the general talk outline fits any topic).`,
    asked === null
      ? `Slides: ${slides.length}, the core of the ${template.label.toLowerCase()} outline (it supports ${range.min}–${range.max}).`
      : asked === slides.length
        ? `Slides: ${slides.length}, as asked.`
        : `Slides: ${slides.length}; asked for ${asked}, and this outline supports ${range.min}–${range.max}.`,
    'Draft scaffolding: every slide body is a placeholder marked "Draft:". No facts, numbers, quotes, names or chart data were invented; replace them with sourced content.',
    'Slides use the free layout (blocks); each slide plan carries a role and pacing that layout selection can map to catalog layouts.',
  ];

  return {
    outline: template.id,
    label: template.label,
    requestedSlides: asked,
    rationale,
    plan: slides.map((slide) => ({
      id: `slide-${slide.key}`,
      role: slide.role,
      pacing: slide.pacing,
      purpose: slide.purpose,
      core: slide.core,
    })),
    deck: {
      title,
      aspect: '16:9',
      slides: slides.map((slide) => ({
        id: `slide-${slide.key}`,
        title: slide.body === 'title' ? title : slide.title,
        layout: 'free',
        blocks: bodyBlocks(slide, title, agenda),
        notes: `${slide.purpose} ${PACING_NOTES[slide.pacing]}`,
      })),
    },
  };
}
