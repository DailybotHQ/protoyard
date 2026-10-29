/**
 * `@protoyard/decks/markdown`: a Markdown deck (the `@texuli/deck` dialect:
 * frontmatter, `---` slides, `Note:`, fragments, `layout=` slides with `:::`
 * regions) read into a Protoyard deck. `parseDeckMarkdown` builds and
 * validates the deck model (every issue with its line and column); the deck
 * is then written in Protoyard's shape and checked with `safeParseDeck`, so
 * it passes the same schema and offline media policy as a JSON deck.
 *
 * What a Protoyard deck cannot hold is reported, never dropped silently:
 * component slides and items, math, vertical stacks, embedded themes, and
 * slide backgrounds outside Protoyard's background spec (for example a
 * remote image under the offline media policy).
 */
import { parseDeckMarkdown } from '@texuli/deck/markdown';
import { DECK_TRANSITIONS, type Deck as ModelDeck } from '@texuli/deck/model';
import { DeckBackgroundSpecSchema } from './backgrounds/schema.ts';
import { type Deck, safeParseDeck } from './schema/index.ts';

export interface MarkdownDeckIssue {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  /** Path in the deck model (`['slides', 2, 'props', 'title']`). */
  path: (string | number)[];
  /** 1-based source position, when the Markdown reader knows it. */
  line?: number;
  column?: number;
}

export interface MarkdownDeckResult {
  ok: boolean;
  /** The Protoyard deck (only when `ok`). */
  deck?: Deck;
  /** The deck title (`title:` in the frontmatter, or the first heading). */
  title: string;
  description?: string;
  issues: MarkdownDeckIssue[];
}

type Bag = Record<string, unknown>;

const STYLE_KEYS = [
  'fontPair',
  'aspect',
  'density',
  'radius',
  'motion',
  'background',
  'logo',
  'footer',
  'slideNumbers',
  'progress',
] as const;
const SLIDE_KEYS = ['id', 'title', 'layout', 'props', 'blocks', 'steps', 'notes', 'hidden'];
const TRANSITIONS: ReadonlySet<string> = new Set(DECK_TRANSITIONS);

const isBag = (value: unknown): value is Bag =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

function transition(
  value: unknown,
  path: (string | number)[],
  issues: MarkdownDeckIssue[]
): unknown {
  if (value === undefined || (typeof value === 'string' && TRANSITIONS.has(value))) return value;
  issues.push({
    severity: 'warning',
    code: 'transition',
    message: `The "${String(value)}" transition plays as "fade" in a Protoyard deck.`,
    path,
  });
  return 'fade';
}

function hasMath(blocks: unknown): boolean {
  return Array.isArray(blocks) && blocks.some((block) => isBag(block) && block.type === 'math');
}

/** The model deck in Protoyard's shape, with what it cannot hold reported. */
function toProtoyardShape(model: ModelDeck, issues: MarkdownDeckIssue[]): Bag {
  const source = model as unknown as Bag;
  const styleIn = isBag(source.style) ? source.style : {};
  const style: Bag = {};
  for (const key of STYLE_KEYS) if (styleIn[key] !== undefined) style[key] = styleIn[key];
  if (typeof styleIn.theme === 'string') style.theme = styleIn.theme;
  else if (styleIn.theme !== undefined) {
    issues.push({
      severity: 'warning',
      code: 'theme',
      message: 'Only a theme id is kept (an embedded or seed theme is not a Protoyard theme).',
      path: ['style', 'theme'],
    });
  }
  const deckTransition = transition(styleIn.transition, ['style', 'transition'], issues);
  if (deckTransition !== undefined) style.transition = deckTransition;

  const slides = (Array.isArray(source.slides) ? source.slides : []).map((raw, index) => {
    const slide = isBag(raw) ? raw : {};
    const path = ['slides', index];
    if (
      slide.layout === 'component' ||
      (Array.isArray(slide.blocks) &&
        slide.blocks.some((block) => isBag(block) && block.type === 'component'))
    ) {
      issues.push({
        severity: 'error',
        code: 'component',
        message: 'Protoyard decks do not take component slides or `::: component` items yet.',
        path,
      });
    }
    if (hasMath(slide.blocks)) {
      issues.push({
        severity: 'error',
        code: 'math',
        message: 'Protoyard decks do not render `$$` math blocks yet.',
        path,
      });
    }
    if (slide.master !== undefined) {
      issues.push({
        severity: 'warning',
        code: 'master',
        message: 'A free slide master is not kept: Protoyard free slides stack their blocks.',
        path: [...path, 'master'],
      });
    }
    const out: Bag = {};
    for (const key of SLIDE_KEYS) if (slide[key] !== undefined) out[key] = slide[key];
    if (typeof slide.background === 'string') out.background = slide.background;
    else if (slide.background !== undefined) {
      // `data-background-*` attributes give an object background (solid, gradient, pattern,
      // image, video): keep it when Protoyard's spec takes it, else report it.
      const background = DeckBackgroundSpecSchema.safeParse(slide.background);
      if (background.success) out.background = background.data;
      else {
        issues.push({
          severity: 'warning',
          code: 'background',
          message: `This slide background is not kept: ${background.error.issues[0]?.message ?? 'it is outside the Protoyard background spec'}.`,
          path: [...path, 'background'],
        });
      }
    }
    const slideTransition = transition(slide.transition, [...path, 'transition'], issues);
    if (slideTransition !== undefined) out.transition = slideTransition;
    return out;
  });

  const meta = isBag(source.meta) ? source.meta : {};
  const outlineIn = isBag(source.outline) ? source.outline : undefined;
  const sections = Array.isArray(outlineIn?.sections)
    ? (outlineIn.sections as Bag[]).map(({ stack, ...section }) => {
        if (stack === true) {
          issues.push({
            severity: 'warning',
            code: 'stack',
            message: 'A vertical stack (`--`) plays as consecutive slides in a Protoyard deck.',
            path: ['outline', 'sections'],
          });
        }
        return section;
      })
    : [{ id: 'main', slideIds: slides.map((slide) => slide.id) }];
  const outline: Bag = { sections };
  const title = typeof outlineIn?.title === 'string' ? outlineIn.title : meta.title;
  if (typeof title === 'string') outline.title = title.slice(0, 120);
  return { style, slides, outline };
}

/** Read a Markdown deck into a validated Protoyard deck. Never throws. */
export function parseMarkdownDeck(source: string): MarkdownDeckResult {
  const parsed = parseDeckMarkdown(source);
  const issues: MarkdownDeckIssue[] = parsed.issues.map((issue) => ({
    severity: issue.severity === 'error' ? 'error' : 'warning',
    code: issue.code,
    message: issue.message,
    path: [...issue.path],
    ...(issue.source ? { line: issue.source.line, column: issue.source.column } : {}),
  }));
  const meta = parsed.deck?.meta;
  const title = meta?.title ?? 'Untitled deck';
  const description = typeof meta?.description === 'string' ? meta.description : undefined;
  if (!parsed.ok || !parsed.deck) {
    return { ok: false, title, ...(description ? { description } : {}), issues };
  }
  const shaped = toProtoyardShape(parsed.deck, issues);
  const checked = safeParseDeck(shaped);
  if (!checked.success) {
    for (const issue of checked.issues) {
      issues.push({
        severity: 'error',
        code: issue.code,
        message: issue.message,
        path: issue.path,
      });
    }
  }
  const ok = checked.success && !issues.some((issue) => issue.severity === 'error');
  return {
    ok,
    ...(ok && checked.success ? { deck: checked.deck } : {}),
    title,
    ...(description ? { description } : {}),
    issues,
  };
}
