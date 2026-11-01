// @vitest-environment happy-dom

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { type ReviewComment, type ReviewContext } from '@protoyard/core/review';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createReviewOverlay, type ReviewOverlayOptions } from '../src/overlay/index.ts';
import ReviewPanel from '../src/panel/ReviewPanel.svelte';
import ReviewThread from '../src/thread/ReviewThread.svelte';

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

const ROOT_ID = 'thread_root_123456789';
const OTHER_ID = 'reply_item_123456789';
const AUTHOR = { name: 'Alex Reviewer', clientId: 'review_123456789abcdef0' };
const anchor: ReviewComment['anchor'] = {
  route: { pattern: '/', path: '/' },
  locators: [{ kind: 'id', value: 'target' }],
  offset: { x: 0.5, y: 0.5 },
};
const comments: ReviewComment[] = [
  {
    formatVersion: 1,
    id: ROOT_ID,
    threadId: ROOT_ID,
    slug: 'demo-app',
    body: '<script>window.pwned = true</script> See <a href="javascript:alert(1)">unsafe</a>',
    author: AUTHOR,
    createdAt: '2026-10-19T12:00:00Z',
    anchor,
    context: { viewport: { width: 1280, height: 800 } },
  },
  {
    formatVersion: 1,
    id: OTHER_ID,
    threadId: ROOT_ID,
    slug: 'demo-app',
    body: 'I will take a look.',
    author: { name: 'Marta Reviewer', clientId: 'review_abcdef0123456789' },
    createdAt: '2026-10-19T12:05:00Z',
  },
];

function setup(props: Record<string, unknown> = {}) {
  const handlers = {
    onSend: vi.fn(async () => {}),
    onEdit: vi.fn(async () => {}),
    onDelete: vi.fn(async () => {}),
    onResolve: vi.fn(async () => {}),
  };
  const result = render(ReviewThread, {
    slug: 'demo-app',
    threadId: ROOT_ID,
    comments,
    now: '2026-10-19T13:00:00Z',
    onResolve: handlers.onResolve,
    onSend: handlers.onSend,
    onEdit: handlers.onEdit,
    onDelete: handlers.onDelete,
    ...props,
  });
  return { ...handlers, ...result };
}

describe('review pin thread', () => {
  it('renders untrusted script bodies as text and filters javascript links', async () => {
    localStorage.setItem('py-review-author:demo-app', JSON.stringify(AUTHOR));
    setup();
    expect(await screen.findByText(/<script>window.pwned = true<\/script>/)).toBeTruthy();
    expect(document.querySelector('script')).toBeNull();
    await waitFor(() => expect(document.querySelector('a[href^="javascript:"]')).toBeNull());
    expect(document.querySelector('[href="javascript:alert(1)"]')).toBeNull();
  });

  it('only exposes edit and delete actions for comments written by this reviewer', async () => {
    localStorage.setItem('py-review-author:demo-app', JSON.stringify(AUTHOR));
    const { onEdit, onDelete } = setup();
    expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Delete' })).toHaveLength(1);
    await fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await fireEvent.input(screen.getByLabelText('Edit comment by Alex Reviewer'), {
      target: { value: 'Updated review note' },
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onEdit).toHaveBeenCalledWith(comments[0], 'Updated review note'));
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('restores a failed reply draft after pending feedback', async () => {
    localStorage.setItem('py-review-author:demo-app', JSON.stringify(AUTHOR));
    let rejectSend: (error: Error) => void = () => {};
    const onSend = vi.fn(
      () =>
        new Promise<void>((_, reject) => {
          rejectSend = reject;
        })
    );
    setup({ onSend });
    await fireEvent.click(screen.getByRole('button', { name: 'Reply' }));
    const field = screen.getByLabelText('Reply to Alex Reviewer') as HTMLTextAreaElement;
    await fireEvent.input(field, { target: { value: 'Please check this again.' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Send reply' }));
    expect(screen.getByRole('article', { name: 'Sending comment' }).getAttribute('aria-busy')).toBe(
      'true'
    );
    rejectSend(new Error('Offline'));
    expect((await screen.findByRole('alert')).textContent).toContain('Offline');
    expect(field.value).toBe('Please check this again.');
  });
});

// --- merged from overlay.test.ts ---

describe('overlay', () => {
  const handles: Array<{ destroy: () => void }> = [];

  afterEach(() => {
    for (const handle of handles.splice(0)) handle.destroy();
    document.body.innerHTML = '';
    window.location.hash = '';
  });

  function setup(options: Partial<ReviewOverlayOptions> = {}) {
    const root = document.createElement('main');
    const target = document.createElement('button');
    target.textContent = 'Open invoice';
    root.append(target);
    document.body.append(root);
    vi.spyOn(root, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 320, 240));
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(new DOMRect(40, 30, 80, 32));
    const onPlace = vi.fn();
    const handle = createReviewOverlay({ ...options, root, onPlace });
    handles.push(handle);
    return { root, target, onPlace };
  }

  describe('review comment overlay', () => {
    it('captures clicks beneath the overlay and reports an anchor to the caller', async () => {
      const { root, target, onPlace } = setup();
      const appClick = vi.fn();
      target.addEventListener('click', appClick);
      const elementsFromPoint = vi.fn(() => [
        document.querySelector('[data-py-review-capture]')!,
        target,
      ]);
      Object.defineProperty(document, 'elementsFromPoint', {
        configurable: true,
        value: elementsFromPoint,
      });
      document.querySelector<HTMLButtonElement>('[data-py-review-toggle]')?.click();
      const capture = document.querySelector('[data-py-review-capture]');
      expect((capture as HTMLElement).style.width).toBe('320px');
      expect((capture as HTMLElement).style.height).toBe('240px');
      capture?.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 48, clientY: 40 }));
      await Promise.resolve();
      expect(elementsFromPoint).toHaveBeenCalledWith(48, 40);
      expect(appClick).not.toHaveBeenCalled();
      expect(onPlace).toHaveBeenCalledTimes(1);
      expect(onPlace.mock.calls[0]?.[0]).toMatchObject({
        locators: expect.any(Array),
        offset: { x: 0.1, y: 0.3125 },
      });
      expect(root.contains(target)).toBe(true);
    });

    it('shows pending feedback while the caller saves a newly placed anchor', async () => {
      const root = document.createElement('main');
      const target = document.createElement('button');
      root.append(target);
      document.body.append(root);
      vi.spyOn(root, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 320, 240));
      vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(new DOMRect(40, 30, 80, 32));
      let finishSave: (() => void) | undefined;
      const onPlace = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            finishSave = resolve;
          })
      );
      const handle = createReviewOverlay({ root, onPlace });
      handles.push(handle);
      const elementsFromPoint = vi.fn(() => [
        document.querySelector('[data-py-review-capture]')!,
        target,
      ]);
      Object.defineProperty(document, 'elementsFromPoint', {
        configurable: true,
        value: elementsFromPoint,
      });
      document.querySelector<HTMLButtonElement>('[data-py-review-toggle]')?.click();
      document
        .querySelector('[data-py-review-capture]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 48, clientY: 40 }));
      const toggle = document.querySelector<HTMLButtonElement>('[data-py-review-toggle]');
      expect(toggle?.textContent).toBe('Saving comment…');
      expect(toggle?.disabled).toBe(true);
      finishSave?.();
      await Promise.resolve();
      await Promise.resolve();
      expect(toggle?.textContent).toBe('Add comment');
      expect(toggle?.disabled).toBe(false);
    });
  });
});

// --- merged from panel.test.ts ---

describe('panel', () => {
  afterEach(cleanup);

  const anchor = (path: string, locator: string): ReviewComment['anchor'] => ({
    route: { pattern: path, path },
    locators: [{ kind: 'id', value: locator }],
    offset: { x: 0.5, y: 0.5 },
  });
  const context: ReviewContext = {
    scenario: 'busy-week',
    persona: 'persona_alex',
    shell: 'browser',
    theme: 'midnight',
    mode: 'dark',
    viewport: { width: 1280, height: 800 },
  };
  const comments: ReviewComment[] = [
    {
      formatVersion: 1,
      id: 'thread_root_123456789',
      threadId: 'thread_root_123456789',
      slug: 'demo-app',
      body: 'Review the quarterly report',
      author: { name: 'Alex Reviewer', clientId: 'review_alex_123456789' },
      createdAt: '2026-10-19T12:00:00Z',
      anchor: anchor('/reports', 'quarterly-report'),
      context,
    },
    {
      formatVersion: 1,
      id: 'thread_root_987654321',
      threadId: 'thread_root_987654321',
      slug: 'demo-app',
      body: 'Looks good now',
      author: { name: 'Marta Reviewer', clientId: 'review_marta_123456789' },
      createdAt: '2026-10-19T12:10:00Z',
      resolvedAt: '2026-10-19T12:30:00Z',
      anchor: anchor('/settings', 'settings-heading'),
      context: { ...context, scenario: 'quiet-week' },
    },
  ];

  function runtimeMock(activeScenario = 'busy-week') {
    return {
      scenarios: {
        active: () => ({ scenario: { id: activeScenario } }),
        load: vi.fn(async (_id: string, _options?: { snapshotFirst?: boolean }) => {}),
      },
      session: {
        principal: () => ({ persona: { id: 'persona_current' } }),
        switchActor: vi.fn(async () => {}),
      },
      theme: {
        appearance: () => ({
          theme: { value: 'daylight' },
          mode: { value: 'light' as const },
          shell: { value: 'browser' as const },
        }),
        setOverride: vi.fn(async () => {}),
      },
    };
  }

  describe('review comments panel', () => {
    async function chooseFilter(label: string, option: string): Promise<void> {
      await fireEvent.click(screen.getByRole('combobox', { name: label }));
      await fireEvent.click(await screen.findByRole('option', { name: option }));
    }

    it('confirms destructive scenario changes and requests a safety snapshot', async () => {
      const runtime = runtimeMock();
      render(ReviewPanel, { comments, currentContext: context, runtime, onNavigate: vi.fn() });
      await chooseFilter('Filter by state', 'Resolved');
      await fireEvent.click(screen.getByRole('button', { name: /Looks good now/ }));
      expect(runtime.scenarios.load).not.toHaveBeenCalled();
      expect(screen.getByRole('alertdialog').textContent).toContain(
        'replaces this prototype’s current data'
      );
      await fireEvent.click(
        screen.getByRole('button', { name: 'Switch scenario and open comment' })
      );
      await waitFor(() =>
        expect(runtime.scenarios.load).toHaveBeenCalledWith('quiet-week', { snapshotFirst: true })
      );
    });
  });
});

// --- merged from bundle-hygiene.test.ts ---

describe('bundle-hygiene', () => {
  /**
   * Review comments must cost 0 bytes until review is enabled and must run where
   * they are deployed (ADR on review comments; docs/PERFORMANCE.md, Shells):
   *  - a dynamic `import('@protoyard/ui')` would turn the ui barrel into a shared
   *    chunk that every prototype's entry loads;
   *  - the `@protoyard/review/server` handler is bundled into a Cloudflare Pages
   *    worker and unit-tested in Node, so it may use only Web APIs: no Svelte, no
   *    UI packages, no Dexie or database, no `node:` modules, no DOM globals;
   *  - the rest of `@protoyard/review` is framework-free (anchors may read the DOM
   *    they are given, but never import Svelte or UI);
   *  - overlay, panel and toolbar stay separate chunks; `mount` composes them.
   */
  const ROOT = join(import.meta.dirname, '../..');
  const ENGINE = join(ROOT, 'review');
  const SOURCE = /\.(ts|svelte|js)$/;

  function sourceFiles(dir: string, out: string[] = []): string[] {
    if (!existsSync(dir)) return out;
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) sourceFiles(path, out);
      else if (SOURCE.test(name)) out.push(path);
    }
    return out;
  }

  /** Module specifiers: static imports, re-exports and dynamic imports. */
  function specifiers(text: string): string[] {
    const found: string[] = [];
    for (const match of text.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)['"]([^'"]+)['"]/g)) {
      if (match[1]) found.push(match[1]);
    }
    return found;
  }

  /** Source without comments or string contents, so words in docs never count as code. */
  function codeOnly(text: string): string {
    return text
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1')
      .replace(/(['"`])(?:\\.|(?!\1)[^\\])*\1/g, "''");
  }

  const FRAMEWORK =
    /^svelte(\/|$)|\.svelte$|^@protoyard\/(ui|review-ui|renderer-svelte|devtools)(\/|$)/;
  const SERVER_FORBIDDEN =
    /^svelte(\/|$)|\.svelte$|^@protoyard\/(ui|review-ui|renderer-svelte|devtools|database)(\/|$)|^dexie$|^node:/;
  const DOM_GLOBALS =
    /\b(window|document|navigator|localStorage|sessionStorage|indexedDB|location|HTMLElement)\b/;

  function serverViolations(text: string): string[] {
    const imports = specifiers(text).filter((spec) => SERVER_FORBIDDEN.test(spec));
    const dom = DOM_GLOBALS.exec(codeOnly(text));
    return dom ? [...imports, dom[1] as string] : imports;
  }

  describe('review packages: imports', () => {
    const engineFiles = sourceFiles(join(ENGINE, 'src'));
    const serverFiles = sourceFiles(join(ENGINE, 'src/server'));

    it('keeps the server handler to Web APIs only', () => {
      const offenders = serverFiles.flatMap((f) =>
        serverViolations(readFileSync(f, 'utf8')).map((v) => `${relative(ROOT, f)} → ${v}`)
      );
      expect(offenders).toEqual([]);
    });

    it('keeps the review engine free of Svelte and UI packages', () => {
      const offenders = engineFiles.flatMap((f) =>
        specifiers(readFileSync(f, 'utf8'))
          .filter((spec) => FRAMEWORK.test(spec))
          .map((spec) => `${relative(ROOT, f)} → ${spec}`)
      );
      expect(offenders).toEqual([]);
    });
  });
});
