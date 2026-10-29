import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CounterBlock, PollBlock, QuizBlock, TabsBlock } from '@protoyard/blocks';
import { MINIMAL_EXAMPLES, RICH_EXAMPLES } from '@protoyard/blocks/catalog';
import {
  type BlockStateHost,
  createMemoryBlockStateHost,
  pollResults,
  readBlockState,
  stateKey,
} from '@protoyard/blocks/interactive';
import { DECK_INTERACTIVE_ATTRIBUTE } from '@protoyard/decks';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import InteractiveHarness from './fixtures/InteractiveHarness.svelte';

afterEach(() => cleanup());

/** Family chunks pull charts-ui / ui; first load is slow under Vitest. */
const long = { timeout: 45_000 };

const poll = MINIMAL_EXAMPLES.poll as PollBlock;
const counter = MINIMAL_EXAMPLES.counter as CounterBlock;
const quiz = MINIMAL_EXAMPLES.quiz as QuizBlock;
const tabs = MINIMAL_EXAMPLES.tabs as TabsBlock;

describe('interactive family through BlockStateHost', () => {
  it('uses Texuli NumberField controls for chart label ranges', async () => {
    const chartControls = {
      ...MINIMAL_EXAMPLES['chart-controls'],
      range: true,
    };
    const stateHost = createMemoryBlockStateHost();
    render(InteractiveHarness, {
      props: { blocks: [chartControls], stateHost, documentId: 'chart-range' },
    });
    const start = await screen.findByRole('spinbutton', { name: 'Label range start' }, long);
    const end = screen.getByRole('spinbutton', { name: 'Label range end' });
    expect(start.classList.contains('tx-number-field__input')).toBe(true);
    expect(end.classList.contains('tx-number-field__input')).toBe(true);
    await fireEvent.keyDown(start, { key: 'ArrowUp' });
    await waitFor(() => expect((start as HTMLInputElement).value).toBe('1'), long);
  }, 60_000);

  it('votes through a spy host, shows pending, and announces results', async () => {
    // Keep this behavior test independent of the cold lazy chunk transform. The
    // renderer's lazy boundary is covered separately; under the combined package
    // suite, compiling this family can outlast the DOM assertion's wait window.
    const { loadBlockFamily } = await import('../src/registry.ts');
    expect(await loadBlockFamily('interactive')).toBeTypeOf('function');

    const memory = createMemoryBlockStateHost();
    const dispatch = vi.fn(
      (key: string, block: Parameters<BlockStateHost['dispatch']>[1], action: unknown) =>
        memory.dispatch(key, block, action)
    );
    const host: BlockStateHost = {
      read: (key) => memory.read(key),
      dispatch: dispatch as BlockStateHost['dispatch'],
      subscribe: (key, listener) => memory.subscribe(key, listener),
    };
    render(InteractiveHarness, {
      props: {
        blocks: [poll],
        stateHost: host,
        documentId: 'deck-1',
        viewerId: 'ada',
      },
    });

    await waitFor(() => expect(screen.getByText(poll.question)).toBeTruthy(), long);
    const yes = screen.getByRole('button', { name: /Yes/i });
    await fireEvent.click(yes);
    const vote = screen.getByRole('button', { name: /^Vote$/i });
    await fireEvent.click(vote);

    await waitFor(() => expect(dispatch).toHaveBeenCalled(), long);
    const call = dispatch.mock.calls.find((c) => (c[2] as { type?: string })?.type === 'vote');
    expect(call?.[0]).toBe(stateKey('deck-1', poll.id));
    expect(call?.[2]).toMatchObject({
      type: 'vote',
      viewer: 'ada',
      options: ['yes'],
    });

    await waitFor(() => {
      expect(screen.getByText(/vote saved/i)).toBeTruthy();
    }, long);

    const state = readBlockState(host, stateKey('deck-1', poll.id), poll);
    expect(pollResults(poll, state, 'ada').mine).toEqual(['yes']);
  }, 60_000);

  it('keeps an unsubmitted poll choice when the state changes under it', async () => {
    // Regression: the draft followed every state update, so a host attaching or
    // another viewer voting wiped a choice before the viewer pressed Vote.
    const stateHost = createMemoryBlockStateHost();
    render(InteractiveHarness, {
      props: { blocks: [poll], stateHost, documentId: 'deck-2', viewerId: 'ada' },
    });
    await waitFor(() => expect(screen.getByText(poll.question)).toBeTruthy(), long);
    const [first, second] = poll.options;
    if (!first || !second) throw new Error('the poll example needs two options');
    await fireEvent.click(screen.getByRole('button', { name: new RegExp(first.label, 'i') }));
    expect(
      screen
        .getByRole('button', { name: new RegExp(first.label, 'i') })
        .getAttribute('aria-pressed')
    ).toBe('true');

    await stateHost.dispatch(stateKey('deck-2', poll.id), poll, {
      type: 'vote',
      viewer: 'grace',
      options: [second.id],
    });
    await waitFor(() =>
      expect(
        pollResults(poll, readBlockState(stateHost, stateKey('deck-2', poll.id), poll), 'ada').mine
      ).toBeNull()
    );
    expect(
      screen
        .getByRole('button', { name: new RegExp(first.label, 'i') })
        .getAttribute('aria-pressed')
    ).toBe('true');
    expect(screen.getByRole('button', { name: /^Vote$/i }).hasAttribute('disabled')).toBe(false);
  }, 60_000);

  it('keeps counter state across a re-render with a memory host', async () => {
    const stateHost = createMemoryBlockStateHost();
    const first = render(InteractiveHarness, {
      props: { blocks: [counter], stateHost, documentId: 'doc-a' },
    });
    await waitFor(() => expect(screen.getByText(counter.label)).toBeTruthy(), long);
    const inc = screen.getByRole('button', { name: /Increase/i });
    await fireEvent.click(inc);
    await fireEvent.click(inc);
    await waitFor(() => {
      expect(readBlockState(stateHost, stateKey('doc-a', counter.id), counter).value).toBe(2);
    }, long);
    first.unmount();

    render(InteractiveHarness, {
      props: { blocks: [counter], stateHost, documentId: 'doc-a' },
    });
    await waitFor(() => {
      expect(screen.getByText('2')).toBeTruthy();
    }, long);
  }, 60_000);

  it('answers a quiz with text feedback (not color alone) and live score', async () => {
    const stateHost = createMemoryBlockStateHost();
    render(InteractiveHarness, {
      props: {
        blocks: [quiz],
        stateHost,
        documentId: 'quiz-doc',
        viewerId: 'bob',
      },
    });
    await waitFor(() => expect(screen.getByText(/One\?/)).toBeTruthy(), long);
    await fireEvent.click(screen.getByRole('button', { name: /^A$/i }));
    await waitFor(() => expect(screen.getByText(/Correct/i)).toBeTruthy(), long);
    expect(screen.getByText(/Correct/i).getAttribute('data-correct')).toBe('true');
  }, 60_000);

  it('formats the Markdown of a quiz prompt instead of showing its markers', async () => {
    // The catalog's own rich quiz asks "What does a **tone** replace?".
    render(InteractiveHarness, {
      props: {
        blocks: [RICH_EXAMPLES.quiz],
        stateHost: createMemoryBlockStateHost(),
        documentId: 'quiz-rich',
        viewerId: 'ana',
      },
    });
    const legend = await screen.findByText(
      (_, element) => element?.tagName === 'LEGEND' && /tone/.test(element.textContent ?? ''),
      {},
      long
    );
    expect(legend.textContent).toBe('What does a tone replace?');
    expect(legend.querySelector('strong')?.textContent).toBe('tone');
  }, 60_000);

  it('calculator slider exposes aria-valuetext with formatted units', async () => {
    const stateHost = createMemoryBlockStateHost();
    const calc = {
      type: 'calculator' as const,
      id: 'calc-units',
      title: 'Pricing',
      inputs: [
        {
          name: 'price',
          label: 'Price',
          min: 0,
          max: 100,
          step: 5,
          default: 50,
          unit: 'percent' as const,
          control: 'slider' as const,
        },
      ],
      outputs: [
        {
          id: 'out',
          label: 'Same',
          formula: { op: 'var' as const, name: 'price' },
        },
      ],
    };
    render(InteractiveHarness, {
      props: { blocks: [calc], stateHost, documentId: 'calc-doc' },
    });
    await waitFor(() => expect(screen.getByText('Pricing')).toBeTruthy(), long);
    const slider = screen.getByRole('slider');
    expect(slider.getAttribute('aria-valuetext')).toMatch(/%/);
  }, 60_000);

  it('calculator inputs stay enabled and keep focus while a value saves', async () => {
    const memory = createMemoryBlockStateHost();
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    // A slow host: every save waits until the test releases it.
    const stateHost: BlockStateHost = {
      read: (key) => memory.read(key),
      dispatch: (async (key, block, action) => {
        await gate;
        return memory.dispatch(key, block, action);
      }) as BlockStateHost['dispatch'],
      subscribe: (key, listener) => memory.subscribe(key, listener),
    };
    const calc = {
      type: 'calculator' as const,
      id: 'calc-focus',
      title: 'Savings',
      inputs: [
        {
          name: 'a',
          label: 'Ideas',
          min: 1,
          max: 40,
          step: 1,
          default: 8,
          control: 'slider' as const,
        },
        {
          name: 'b',
          label: 'Hours',
          min: 1,
          max: 40,
          step: 1,
          default: 4,
          control: 'number' as const,
        },
      ],
      outputs: [{ id: 'out', label: 'Total', formula: { op: 'var' as const, name: 'a' } }],
    };
    render(InteractiveHarness, {
      props: { blocks: [calc], stateHost, documentId: 'calc-doc' },
    });
    await waitFor(() => expect(screen.getByText('Savings')).toBeTruthy(), long);
    const slider = screen.getByRole('slider');
    slider.focus();
    await fireEvent.keyDown(slider, { key: 'ArrowRight' });
    const section = slider.closest('[data-py-block="calculator"]');
    await waitFor(() => expect(section?.getAttribute('aria-busy')).toBe('true'), long);
    for (const input of section?.querySelectorAll('input') ?? []) {
      expect(input.disabled, input.getAttribute('aria-label') ?? '').toBe(false);
    }
    expect(slider.getAttribute('aria-disabled')).not.toBe('true');
    expect(document.activeElement).toBe(slider);
    release();
    await waitFor(() => expect(section?.hasAttribute('aria-busy')).toBe(false), long);
    expect(document.activeElement).toBe(slider);
  }, 60_000);

  it('calculator slider is a Texuli Slider: named, keyboard-operable, saved through the block state', async () => {
    const memory = createMemoryBlockStateHost();
    const dispatch = vi.fn(
      (key: string, block: Parameters<BlockStateHost['dispatch']>[1], action: unknown) =>
        memory.dispatch(key, block, action)
    );
    const stateHost: BlockStateHost = {
      read: (key) => memory.read(key),
      dispatch: dispatch as BlockStateHost['dispatch'],
      subscribe: (key, listener) => memory.subscribe(key, listener),
    };
    const calc = {
      type: 'calculator' as const,
      id: 'calc-slider',
      title: 'Team cost',
      inputs: [
        {
          name: 'seats',
          label: 'Seats',
          min: 1,
          max: 50,
          step: 1,
          default: 10,
          control: 'slider' as const,
        },
      ],
      outputs: [
        {
          id: 'total',
          label: 'Total seats',
          formula: { op: 'var' as const, name: 'seats' },
        },
      ],
    };
    render(InteractiveHarness, {
      props: { blocks: [calc], stateHost, documentId: 'calc-slider-doc' },
    });
    await waitFor(() => expect(screen.getByText('Team cost')).toBeTruthy(), long);
    const slider = screen.getByRole('slider', { name: 'Seats' });
    // Texuli's slider thumb, not a text-field-styled <input type="range">.
    expect(slider.hasAttribute('data-tx-slider-thumb')).toBe(true);
    expect(
      slider.closest('[data-py-block="calculator"]')?.querySelector('input[type="range"]')
    ).toBeNull();
    expect(slider.getAttribute('aria-valuenow')).toBe('10');

    slider.focus();
    await fireEvent.keyDown(slider, { key: 'ArrowRight' });
    await waitFor(() => expect(dispatch).toHaveBeenCalled(), long);
    expect(dispatch.mock.calls.at(-1)?.[2]).toEqual({ type: 'set', name: 'seats', value: 11 });
    await waitFor(
      () =>
        expect(
          readBlockState(stateHost, stateKey('calc-slider-doc', calc.id), calc as never)
        ).toMatchObject({ values: { seats: 11 } }),
      long
    );
    expect(slider.getAttribute('aria-valuenow')).toBe('11');
    expect(screen.getByText('(11)')).toBeTruthy();

    await fireEvent.keyDown(slider, { key: 'End' });
    await waitFor(() => expect(slider.getAttribute('aria-valuenow')).toBe('50'), long);
    expect(dispatch.mock.calls.at(-1)?.[2]).toEqual({ type: 'set', name: 'seats', value: 50 });
    expect(document.activeElement).toBe(slider);
  }, 60_000);

  it('long quiz and poll choices wrap instead of clipping (nowrap is reset)', async () => {
    const long_ = 'an answer long enough to pass a phone width';
    const longQuiz = {
      ...quiz,
      id: 'quiz-wrap',
      questions: quiz.questions.map((question) => ({
        ...question,
        choices: question.choices.map((choice) => ({
          ...choice,
          label: `${choice.label} ${long_}`,
        })),
      })),
    } as QuizBlock;
    const longPoll = {
      ...poll,
      id: 'poll-wrap',
      options: poll.options.map((option) => ({ ...option, label: `${option.label} ${long_}` })),
    } as PollBlock;
    render(InteractiveHarness, {
      props: {
        blocks: [longQuiz, longPoll],
        stateHost: createMemoryBlockStateHost(),
        documentId: 'wrap-doc',
        viewerId: 'ada',
      },
    });
    await waitFor(() => expect(screen.getByText(poll.question)).toBeTruthy(), long);
    const choices = screen
      .getAllByRole('button')
      .filter((button) => button.textContent?.includes(long_));
    expect(choices.length).toBe(
      longQuiz.questions.reduce((sum, q) => sum + q.choices.length, 0) + longPoll.options.length
    );
    for (const choice of choices) {
      expect(choice.className).toMatch(/\bwhitespace-normal\b/);
      expect(choice.className).toMatch(/\bbreak-words\b/);
      expect(choice.className).toMatch(/\btext-left\b/);
      expect(choice.className).toMatch(/\bh-auto\b/);
    }
  }, 60_000);

  it('switches tabs through dispatch', async () => {
    const stateHost = createMemoryBlockStateHost();
    render(InteractiveHarness, {
      props: { blocks: [tabs], stateHost, documentId: 'tabs-doc' },
    });
    await waitFor(() => expect(screen.getByRole('tab', { name: 'B' })).toBeTruthy(), long);
    await fireEvent.click(screen.getByRole('tab', { name: 'B' }));
    await waitFor(() => {
      expect(readBlockState(stateHost, stateKey('tabs-doc', tabs.id), tabs).panel).toBe('b');
    }, long);
  }, 60_000);

  it('loads the interactive family renderer for each interactive type', async () => {
    const { loadBlockFamily } = await import('../src/registry.ts');
    const family = await loadBlockFamily('interactive');
    expect(family).toBeTypeOf('function');
    const map = await loadBlockFamily('map');
    expect(map).toBeTypeOf('function');
  }, 60_000);

  it('marks interactive roots with data-py-deck-interactive so deck clicks do not advance', async () => {
    expect(DECK_INTERACTIVE_ATTRIBUTE).toBe('data-py-deck-interactive');
    const components = [
      ['interactive/PollBlock.svelte', 'poll'],
      ['interactive/QuizBlock.svelte', 'quiz'],
      ['interactive/CalculatorBlock.svelte', 'calculator'],
      ['interactive/CounterBlock.svelte', 'counter'],
      ['interactive/TabsBlockView.svelte', 'tabs'],
      ['interactive/RevealBlockView.svelte', 'reveal'],
      ['interactive/ChartControlsBlock.svelte', 'chart-controls'],
      ['interactive/FormBlockView.svelte', 'form'],
      ['map/MapBlockView.svelte', 'map'],
      ['embed/EmbedApp.svelte', 'embed-app'],
    ] as const;
    for (const [component, type] of components) {
      const source = readFileSync(join(import.meta.dirname, '../src', component), 'utf8');
      const root = source.match(/<(?:section|div|article)\b[\s\S]*?>/)?.[0];
      expect(root, `${component} should have a root element`).toBeTruthy();
      expect(root).toContain(`data-py-block="${type}"`);
      expect(root).toContain('DECK_INTERACTIVE_ATTRIBUTE');
    }
  }, 60_000);
});

describe('AC-blocks-no-direct-db', () => {
  it('blocks-ui source never imports @protoyard/database or dexie', () => {
    const root = join(import.meta.dirname, '../src');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/\.(ts|svelte|js)$/.test(entry.name)) files.push(path);
      }
    };
    walk(root);
    const hits: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      if (/@protoyard\/database|from ['"]dexie['"]|from ['"]dexie\//.test(text)) {
        hits.push(file);
      }
    }
    expect(hits).toEqual([]);
  });
});
