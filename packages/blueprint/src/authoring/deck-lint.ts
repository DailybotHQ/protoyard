import { forEachBlock } from '@protoyard/blocks';
import { DECK_LAYOUT_BY_ID, parseLayoutProps, stripStepMarkers } from '@protoyard/decks/layouts';
import { checkDeckStatic } from '@protoyard/decks/quality';
import { type Deck, type DeckSlide, safeParseDeck } from '@protoyard/decks/schema';

export type DeckLintSeverity = 'error' | 'warning';

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

function diagnostic(
  code: string,
  path: (string | number)[],
  message: string,
  severity: DeckLintSeverity = 'error'
): DeckLintDiagnostic {
  return { code, severity, path, jsonPath: jsonPath(path), message };
}

function schemaDiagnosticCode(path: readonly (string | number)[]): string | null {
  if (path.at(-1) === 'alt') return 'image-alt';
  if (path.at(-1) === 'label' && (path.includes('cta') || path.includes('actions'))) {
    return 'cta-label';
  }
  return null;
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
    const contentCode = schemaDiagnosticCode(path);
    if (contentCode === 'image-alt') {
      return diagnostic(
        contentCode,
        path,
        'Describe the image in alt text, or mark it decorative.'
      );
    }
    if (contentCode === 'cta-label') {
      return diagnostic(contentCode, path, 'Every call to action needs a visible label.');
    }
    if (invalidStep) {
      return diagnostic(
        'invalid-fragment-order',
        path,
        'Fragment steps must be valid integers from 0 through 32.'
      );
    }
    if (issue.message.startsWith('Too big:')) {
      return diagnostic(
        'layout-capacity',
        path,
        'This slide exceeds a hard capacity declared by its layout catalog entry.'
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

/** Preserve useful CTA paths when a nested schema union reports only its parent. */
function missingCtaLabels(input: unknown): DeckLintDiagnostic[] {
  const diagnostics: DeckLintDiagnostic[] = [];
  const stack: { value: unknown; path: (string | number)[] }[] = [{ value: input, path: [] }];
  let visited = 0;

  while (stack.length > 0 && visited < 20_000) {
    const current = stack.pop();
    if (!current || current.value === null || typeof current.value !== 'object') continue;
    visited += 1;
    const node = current.value;
    if (Array.isArray(node)) {
      for (let index = node.length - 1; index >= 0; index -= 1) {
        const property = Object.getOwnPropertyDescriptor(node, String(index));
        if (property && 'value' in property) {
          stack.push({ value: property.value, path: [...current.path, index] });
        }
      }
      continue;
    }
    const record = node as Record<string, unknown>;
    const descriptor = (key: string): unknown => {
      const property = Object.getOwnPropertyDescriptor(node, key);
      return property && 'value' in property ? property.value : undefined;
    };
    const type = descriptor('type');
    const actions = descriptor('actions');
    if (type === 'cta' && Array.isArray(actions)) {
      actions.forEach((action, index) => {
        if (action === null || typeof action !== 'object') return;
        const label = Object.getOwnPropertyDescriptor(action, 'label');
        if (
          !label ||
          !('value' in label) ||
          typeof label.value !== 'string' ||
          !label.value.trim()
        ) {
          diagnostics.push(
            diagnostic(
              'cta-label',
              [...current.path, 'actions', index, 'label'],
              'Every call to action needs a visible label.'
            )
          );
        }
      });
    }
    const cta = descriptor('cta');
    if (cta !== null && typeof cta === 'object' && !Array.isArray(cta)) {
      const label = Object.getOwnPropertyDescriptor(cta, 'label');
      if (!label || !('value' in label) || typeof label.value !== 'string' || !label.value.trim()) {
        diagnostics.push(
          diagnostic(
            'cta-label',
            [...current.path, 'cta', 'label'],
            'Every call to action needs a visible label.'
          )
        );
      }
    }
    for (const key of Object.keys(record)) {
      const property = Object.getOwnPropertyDescriptor(node, key);
      if (property && 'value' in property) {
        stack.push({ value: property.value, path: [...current.path, key] });
      }
    }
  }

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
    // A custom slide renders an owned component (checked by the schema and checkDeckStatic).
    if (slide.layout === 'custom') {
      // Nothing to check against the catalog.
    } else if (!Object.hasOwn(DECK_LAYOUT_BY_ID, slide.layout)) {
      diagnostics.push(
        diagnostic(
          'unknown-layout',
          layoutPath,
          `Unknown layout "${slide.layout}". Choose a layout from the deck catalog.`
        )
      );
    } else {
      const propsResult = parseLayoutProps(
        slide.layout,
        'blocks' in slide ? { blocks: slide.blocks } : stripStepMarkers(slide.props)
      );
      if (!propsResult.success) {
        for (const issue of propsResult.issues) {
          const issuePath =
            issue.path[0] === 'layout' ? layoutPath : ['slides', index, 'props', ...issue.path];
          diagnostics.push(
            diagnostic(
              issue.message.startsWith('Too big:') ? 'layout-capacity' : 'invalid-layout-props',
              issuePath,
              issue.message.startsWith('Too big:')
                ? 'This slide exceeds a hard capacity declared by its layout catalog entry.'
                : 'Slide props do not match this layout.'
            )
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

const MIN_CHART_DESCRIPTION_LENGTH = 40;

/**
 * Check accessible content and static readability guidance for an untrusted
 * deck. Schema omissions are errors; word-count estimates and missing speaker
 * notes are warnings. Rendered contrast, font size and fit still need visual QA.
 */
export function lintDeckContent(input: unknown): DeckLintResult {
  const structure = lintDeckStructure(input);
  if (!structure.valid) {
    const diagnostics = [...structure.diagnostics];
    const existing = new Set(diagnostics.map((item) => `${item.code}:${item.jsonPath}`));
    for (const issue of missingCtaLabels(input)) {
      const key = `${issue.code}:${issue.jsonPath}`;
      if (!existing.has(key)) diagnostics.push(issue);
    }
    return { valid: false, diagnostics };
  }

  const parsed = safeParseDeck(input);
  if (!parsed.success) return structure;

  const diagnostics = [...structure.diagnostics];
  const quality = checkDeckStatic(parsed.deck);
  for (const issue of quality.issues) {
    diagnostics.push(diagnostic(issue.rule, issue.path, issue.message, issue.severity));
  }

  const checkChartDescription = (description: string | undefined, path: (string | number)[]) => {
    if (!description || description.trim().length === 0) {
      diagnostics.push(
        diagnostic(
          'chart-description',
          path,
          'Add a concise accessible description that explains the chart’s takeaway.'
        )
      );
    } else if (description.trim().length < MIN_CHART_DESCRIPTION_LENGTH) {
      diagnostics.push(
        diagnostic(
          'chart-description-short',
          path,
          `Chart descriptions under ${MIN_CHART_DESCRIPTION_LENGTH} characters may not explain the data clearly.`,
          'warning'
        )
      );
    }
  };

  parsed.deck.slides.forEach((slide, slideIndex) => {
    const base = ['slides', slideIndex];
    if ('props' in slide && slide.layout === 'chart') {
      const props = slide.props as Record<string, unknown>;
      const spec = props.spec;
      const description =
        spec !== null && typeof spec === 'object' && !Array.isArray(spec)
          ? (spec as Record<string, unknown>).description
          : undefined;
      checkChartDescription(typeof description === 'string' ? description : undefined, [
        ...base,
        'props',
        'spec',
        'description',
      ]);
    }
    if ('blocks' in slide) {
      forEachBlock(slide.blocks, (block, path) => {
        if (block.type === 'chart' || block.type === 'chart-controls') {
          checkChartDescription(block.spec.description, [
            ...base,
            'blocks',
            ...path,
            'spec',
            'description',
          ]);
        }
      });
    }
  });

  return {
    valid: diagnostics.every((item) => item.severity !== 'error'),
    diagnostics,
  };
}

type AssetKind = 'image' | 'video';

const MAX_ASSET_URL_LENGTH = 2_048;
const MAX_ASSET_SCAN_NODES = 20_000;
const MAX_ASSET_SCAN_DEPTH = 32;

function ownDataValue(record: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  return descriptor && 'value' in descriptor ? descriptor.value : undefined;
}

function assetUrlProblem(value: unknown, kind: AssetKind): string | null {
  if (typeof value !== 'string' || value.length === 0)
    return 'Asset reference needs a URL or local path.';
  if (value.length > MAX_ASSET_URL_LENGTH)
    return 'Asset references must be at most 2,048 characters.';
  if (value !== value.trim()) return 'Asset references cannot start or end with whitespace.';
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (
      code <= 0x20 ||
      (code >= 0x7f && code <= 0x9f) ||
      (code >= 0x202a && code <= 0x202e) ||
      (code >= 0x2066 && code <= 0x2069)
    ) {
      return 'Asset references cannot contain control or bidirectional characters.';
    }
  }
  if (value.includes('\\')) return 'Asset references cannot contain backslashes.';

  const scheme = /^([a-z][a-z\d+.-]*):/i.exec(value)?.[1]?.toLowerCase();
  if (scheme === 'https') {
    if (!/^https:\/\//i.test(value)) return 'Use a complete HTTPS URL with a host.';
    try {
      const parsed = new URL(value);
      if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) {
        return 'Use HTTPS with a hostname and without embedded credentials.';
      }
      return null;
    } catch {
      return 'Asset URL is not valid.';
    }
  }
  if (scheme === 'avatar') {
    return kind === 'image' && /^avatar:av-(?:00[1-9]|0[1-9]\d|1[0-6]\d|17[0-5])$/.test(value)
      ? null
      : 'Use a valid image avatar reference.';
  }
  if (scheme !== undefined) return `The ${scheme}: protocol is not allowed for slide assets.`;
  if (value.startsWith('//')) return 'Protocol-relative asset URLs are not allowed.';

  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return 'Local asset path has invalid percent encoding.';
  }
  const path = decoded.split(/[?#]/, 1)[0] ?? '';
  const localPath = path.startsWith('./')
    ? path.slice(2)
    : path.startsWith('/')
      ? path.slice(1)
      : path;
  if (
    localPath.length === 0 ||
    path.includes('\\') ||
    path.startsWith('//') ||
    localPath.split('/').some((segment) => segment === '..' || segment === '.' || segment === '')
  ) {
    return 'Use a local asset path without parent-directory traversal.';
  }
  return null;
}

/**
 * Inspect media references in raw deck JSON without fetching, parsing remote
 * content, or invoking object accessors. HTTPS is syntax-checked only; runtime
 * hosts apply their own media policy. Embedded-app data is walked recursively.
 */
export function lintDeckAssets(input: unknown): DeckLintResult {
  const diagnostics: DeckLintDiagnostic[] = [];
  const stack: {
    value: unknown;
    path: (string | number)[];
    key: string | number | null;
    inheritedCredit: unknown;
    depth: number;
  }[] = [{ value: input, path: [], key: null, inheritedCredit: undefined, depth: 0 }];
  let visited = 0;

  const inspect = (value: unknown, kind: AssetKind, path: (string | number)[], credit: unknown) => {
    const problem = assetUrlProblem(value, kind);
    if (problem) {
      diagnostics.push(
        diagnostic(
          problem.startsWith('The ') ? 'unsafe-asset-url' : 'invalid-asset-url',
          path,
          problem
        )
      );
      return;
    }
    if (kind === 'image' && typeof value === 'string' && /^https:\/\//i.test(value)) {
      const creditText = typeof credit === 'string' ? credit.trim() : '';
      if (!creditText) {
        diagnostics.push(
          diagnostic(
            'image-credit',
            path,
            'Add an attribution credit for this external image.',
            'warning'
          )
        );
      }
    }
  };

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    visited += 1;
    if (visited > MAX_ASSET_SCAN_NODES || current.depth > MAX_ASSET_SCAN_DEPTH) {
      diagnostics.push(
        diagnostic(
          'asset-scan-limit',
          current.path,
          'Asset scanning stopped at its depth or node limit to keep validation bounded.'
        )
      );
      break;
    }
    const node = current.value;
    if (node === null || typeof node !== 'object') {
      if (current.key === 'image' && typeof node === 'string') {
        inspect(node, 'image', current.path, current.inheritedCredit);
      } else if (current.key === 'poster' && typeof node === 'string') {
        inspect(node, 'image', current.path, current.inheritedCredit);
      }
      continue;
    }
    if (Array.isArray(node)) {
      for (let index = node.length - 1; index >= 0; index -= 1) {
        const descriptor = Object.getOwnPropertyDescriptor(node, String(index));
        if (descriptor && 'value' in descriptor) {
          stack.push({
            value: descriptor.value,
            path: [...current.path, index],
            key: index,
            inheritedCredit: current.inheritedCredit,
            depth: current.depth + 1,
          });
        }
      }
      continue;
    }

    const record = node as Record<string, unknown>;
    const type = ownDataValue(node, 'type');
    const credit = ownDataValue(node, 'credit') ?? current.inheritedCredit;
    const isImageObject = type === 'image' || current.key === 'image';
    const isVideoObject = type === 'video' || current.key === 'video';
    if (isImageObject || isVideoObject) {
      const mediaKind: AssetKind = isVideoObject ? 'video' : 'image';
      const src = ownDataValue(node, 'src');
      inspect(src, mediaKind, [...current.path, 'src'], credit);
      if (type === 'image') {
        const width = ownDataValue(node, 'width');
        const height = ownDataValue(node, 'height');
        if (typeof width !== 'number' || width <= 0 || typeof height !== 'number' || height <= 0) {
          diagnostics.push(
            diagnostic(
              'image-dimensions',
              current.path,
              'Images need positive width and height values.'
            )
          );
        }
      }
    }
    if (type === 'image' && ownDataValue(node, 'src') === undefined) {
      diagnostics.push(
        diagnostic('invalid-asset-url', [...current.path, 'src'], 'Image block needs a source URL.')
      );
    }
    if (type === 'video' && ownDataValue(node, 'src') === undefined) {
      diagnostics.push(
        diagnostic('invalid-asset-url', [...current.path, 'src'], 'Video block needs a source URL.')
      );
    }

    for (const key of Object.keys(record).reverse()) {
      const descriptor = Object.getOwnPropertyDescriptor(node, key);
      if (!descriptor || !('value' in descriptor)) continue;
      stack.push({
        value: descriptor.value,
        path: [...current.path, key],
        key,
        inheritedCredit: credit,
        depth: current.depth + 1,
      });
    }
  }

  return {
    valid: diagnostics.every((item) => item.severity !== 'error'),
    diagnostics,
  };
}
