import { DECK_LAYOUT_BY_ID, parseLayoutProps } from '@protoyard/decks/layouts';
import { type Deck, type DeckSlide, safeParseDeck } from '@protoyard/decks/schema';

export type DeckLintSeverity = 'error';

/** Stable structural diagnostic returned by the deck authoring lint. */
export type DeckLintDiagnostic = {
  code: string;
  severity: DeckLintSeverity;
  path: (string | number)[];
  jsonPath: string;
  message: string;
};

/** Pure result suitable for CLI output and editor integrations. */
export type DeckLintResult = {
  valid: boolean;
  diagnostics: DeckLintDiagnostic[];
};

type FragmentMark = { step: number; path: (string | number)[] };
type LinkMark = { href: string; path: (string | number)[] };
type FragmentProblem = { path: (string | number)[]; message: string };

const FRAGMENT_EFFECTS = new Set([
  'fade-up',
  'in',
  'out',
  'in-then-out',
  'grow',
  'shrink',
  'highlight',
  'strike',
]);
const REVEAL_EFFECTS = new Set(['fade', 'fade-up', 'grow', 'highlight', 'strike']);

function jsonPath(path: readonly (string | number)[]): string {
  return path.reduce<string>(
    (result, part) =>
      typeof part === 'number' ? `${result}[${part}]` : `${result}[${JSON.stringify(part)}]`,
    '$'
  );
}

function diagnostic(code: string, path: (string | number)[], message: string): DeckLintDiagnostic {
  return { code, severity: 'error', path, jsonPath: jsonPath(path), message };
}

function schemaDiagnostics(
  issues: readonly {
    code: string;
    message: string;
    path: readonly PropertyKey[];
  }[]
): DeckLintDiagnostic[] {
  return issues.map((issue) => {
    const path = issue.path.filter(
      (segment): segment is string | number =>
        typeof segment === 'string' || typeof segment === 'number'
    );
    const isSlideId = path[0] === 'slides' && path.at(-1) === 'id';
    const duplicate = issue.message.startsWith('Duplicate slide id');
    const missing =
      (isSlideId || (path[0] === 'slides' && path.length === 2)) &&
      issue.code === 'invalid_type' &&
      !duplicate;
    const invalidStep = path.at(-1) === 'step';

    if (duplicate) {
      return diagnostic('duplicate-slide-id', path, 'Slide ids must be unique within a deck.');
    }
    if (missing) {
      const missingPath = isSlideId ? path : [...path, 'id'];
      return diagnostic('missing-slide-id', missingPath, 'Every slide needs a valid id.');
    }
    if (invalidStep) {
      return diagnostic(
        'invalid-fragment-order',
        path,
        'Fragment steps must be valid integers from 0 through 32.'
      );
    }
    // DeckSchema enforces the layout catalog; keep its findings under the lint's specific codes.
    if (path[0] === 'slides' && path.length === 3 && path[2] === 'layout') {
      return diagnostic('unknown-layout', path, issue.message);
    }
    if (path[0] === 'slides' && path[2] === 'props') {
      return diagnostic('invalid-layout-props', path.slice(0, 3), issue.message);
    }
    return diagnostic('invalid-deck-structure', path, 'This value does not match the deck schema.');
  });
}

function missingSlideIds(input: unknown): DeckLintDiagnostic[] {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return [];
  const slidesDescriptor = Object.getOwnPropertyDescriptor(input, 'slides');
  const slides = slidesDescriptor && 'value' in slidesDescriptor ? slidesDescriptor.value : null;
  if (!Array.isArray(slides)) return [];
  const diagnostics: DeckLintDiagnostic[] = [];
  slides.forEach((slide, index) => {
    if (slide === null || typeof slide !== 'object' || Array.isArray(slide)) return;
    const idDescriptor = Object.getOwnPropertyDescriptor(slide, 'id');
    if (!idDescriptor || !('value' in idDescriptor) || idDescriptor.value === undefined) {
      diagnostics.push(
        diagnostic('missing-slide-id', ['slides', index, 'id'], 'Every slide needs a valid id.')
      );
    }
  });
  return diagnostics;
}

/** Walk JSON data in author order without invoking getters or changing it. */
function marks(
  value: unknown,
  base: (string | number)[]
): {
  fragments: FragmentMark[];
  links: LinkMark[];
  fragmentProblems: FragmentProblem[];
} {
  const fragments: FragmentMark[] = [];
  const links: LinkMark[] = [];
  const fragmentProblems: FragmentProblem[] = [];
  const stack: { value: unknown; path: (string | number)[] }[] = [{ value, path: base }];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    const node = current.value;
    if (Array.isArray(node)) {
      for (let index = node.length - 1; index >= 0; index -= 1) {
        stack.push({ value: node[index], path: [...current.path, index] });
      }
      continue;
    }
    if (node === null || typeof node !== 'object') continue;

    const record = node as Record<string, unknown>;
    if (typeof record.href === 'string') {
      links.push({ href: record.href, path: [...current.path, 'href'] });
    }
    const hasStep = Object.hasOwn(record, 'step');
    const hasFragment = Object.hasOwn(record, 'fragment');
    const hasReveal = Object.hasOwn(record, 'reveal');
    if (hasStep && typeof record.step === 'number') {
      fragments.push({ step: record.step, path: [...current.path, 'step'] });
    } else if (hasStep) {
      fragmentProblems.push({
        path: [...current.path, 'step'],
        message: 'Fragment steps must be integers from 0 through 32.',
      });
    } else if (hasFragment || hasReveal) {
      fragmentProblems.push({
        path: [...current.path, hasFragment ? 'fragment' : 'reveal'],
        message: 'A fragment effect requires a step value.',
      });
    }
    if (hasStep && hasFragment && !FRAGMENT_EFFECTS.has(String(record.fragment))) {
      fragmentProblems.push({
        path: [...current.path, 'fragment'],
        message: 'Fragment effect is not supported by the deck motion model.',
      });
    }
    if (hasStep && hasReveal && !REVEAL_EFFECTS.has(String(record.reveal))) {
      fragmentProblems.push({
        path: [...current.path, 'reveal'],
        message: 'Reveal effect is not supported by the block vocabulary.',
      });
    }
    if (record.type === 'code' && Array.isArray(record.highlights)) {
      const firstStep = typeof record.step === 'number' ? record.step : 0;
      record.highlights.forEach((_, index) => {
        fragments.push({
          step: firstStep + index,
          path: [...current.path, 'highlights', index],
        });
      });
    }
    for (const key of Object.keys(record).reverse()) {
      if (key === 'step' || key === 'fragment' || key === 'reveal' || key === 'href') continue;
      stack.push({ value: record[key], path: [...current.path, key] });
    }
  }
  return { fragments, links, fragmentProblems };
}

function slideMarks(slide: DeckSlide, index: number): ReturnType<typeof marks> {
  const content = 'blocks' in slide ? slide.blocks : slide.props;
  const base = ['slides', index, 'blocks' in slide ? 'blocks' : 'props'];
  return marks(content, base);
}

function stepCount(slide: DeckSlide, fragments: readonly FragmentMark[]): number {
  const authored = new Set(fragments.map(({ step }) => step).filter((step) => step > 0));
  return Math.min(32, Math.max(slide.steps?.length ?? 0, authored.size));
}

function slideLink(href: string): { slideId: string; step: number } | null {
  if (href === '#/') return null;
  const match = /^#\/([a-z0-9][a-z0-9-]{0,63})(?:\/(\d{1,2}))?$/.exec(href);
  if (!match) return href.startsWith('#/') ? { slideId: '', step: -1 } : null;
  const step = match[2] === undefined ? 0 : Number(match[2]);
  return step <= 32 ? { slideId: match[1] as string, step } : { slideId: '', step };
}

/**
 * Check the structure and navigation references in an untrusted deck body.
 * This function is deterministic, does not mutate input, render content or
 * access the network. Diagnostics use paths relative to the deck object.
 */
export function lintDeckStructure(input: unknown): DeckLintResult {
  const missingIds = missingSlideIds(input);
  if (missingIds.length > 0) return { valid: false, diagnostics: missingIds };
  const parsed = safeParseDeck(input);
  if (!parsed.success) {
    const diagnostics = schemaDiagnostics(parsed.issues);
    return { valid: false, diagnostics };
  }

  const deck: Deck = parsed.deck;
  const diagnostics: DeckLintDiagnostic[] = [];
  const slidesById = new Map(deck.slides.map((slide, index) => [slide.id, { slide, index }]));
  const perSlide = deck.slides.map((slide, index) => slideMarks(slide, index));

  deck.slides.forEach((slide, index) => {
    const layoutPath = ['slides', index, 'layout'];
    if (!Object.hasOwn(DECK_LAYOUT_BY_ID, slide.layout)) {
      diagnostics.push(
        diagnostic(
          'unknown-layout',
          layoutPath,
          `Unknown layout "${slide.layout}". Choose a layout from the deck catalog.`
        )
      );
    } else if (!('blocks' in slide)) {
      const propsResult = parseLayoutProps(slide.layout, slide.props);
      if (!propsResult.success) {
        for (const issue of propsResult.issues) {
          const issuePath =
            issue.path[0] === 'layout' ? layoutPath : ['slides', index, 'props', ...issue.path];
          diagnostics.push(
            diagnostic('invalid-layout-props', issuePath, 'Slide props do not match this layout.')
          );
        }
      }
    }

    let previousStep = -1;
    for (const fragment of perSlide[index]?.fragments ?? []) {
      if (!Number.isInteger(fragment.step) || fragment.step < 0 || fragment.step > 32) {
        diagnostics.push(
          diagnostic(
            'invalid-fragment-order',
            fragment.path,
            'Fragment steps must be integers from 0 through 32.'
          )
        );
        continue;
      }
      if (fragment.step < previousStep) {
        diagnostics.push(
          diagnostic(
            'invalid-fragment-order',
            fragment.path,
            'Fragment steps must follow non-decreasing visual order.'
          )
        );
      }
      previousStep = fragment.step;
    }
    for (const problem of perSlide[index]?.fragmentProblems ?? []) {
      diagnostics.push(diagnostic('invalid-fragment-order', problem.path, problem.message));
    }
  });

  if (deck.outline) {
    let previousIndex = -1;
    const assigned = new Set<string>();
    deck.outline.sections.forEach((section, sectionIndex) => {
      section.slideIds.forEach((slideId, slideIndex) => {
        const referencePath = ['outline', 'sections', sectionIndex, 'slideIds', slideIndex];
        const targetIndex = slidesById.get(slideId)?.index;
        if (targetIndex === undefined) return;
        if (assigned.has(slideId)) {
          diagnostics.push(
            diagnostic(
              'duplicate-outline-slide',
              referencePath,
              'A slide may appear only once in the outline.'
            )
          );
        }
        if (targetIndex < previousIndex) {
          diagnostics.push(
            diagnostic(
              'invalid-slide-order',
              referencePath,
              'Outline sections must follow the deck slide order.'
            )
          );
        }
        assigned.add(slideId);
        previousIndex = targetIndex;
      });
    });
  }

  deck.slides.forEach((_slide, index) => {
    for (const link of perSlide[index]?.links ?? []) {
      const parsedLink = slideLink(link.href);
      if (!parsedLink) continue;
      const target = slidesById.get(parsedLink.slideId);
      if (!target || parsedLink.step < 0 || target.slide.hidden === true) {
        diagnostics.push(
          diagnostic(
            'broken-slide-link',
            link.path,
            'Internal slide link does not resolve to a visible slide.'
          )
        );
        continue;
      }
      if (parsedLink.step > stepCount(target.slide, perSlide[target.index]?.fragments ?? [])) {
        diagnostics.push(
          diagnostic(
            'broken-slide-link',
            link.path,
            'Internal slide link points to a step that does not exist.'
          )
        );
      }
    }
  });

  return { valid: diagnostics.length === 0, diagnostics };
}
