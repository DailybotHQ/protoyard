// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  applyCompletion,
  continueList,
  insertCodeBlock,
  insertLink,
  setHeading,
  type TextState,
  toggleInline,
  toggleLines,
  triggerAt,
} from '../src/editor/index.ts';

/** `"a [b] c"` → text with the bracketed part selected (or `|` as the caret). */
function at(marked: string): TextState {
  if (marked.includes('|')) {
    const start = marked.indexOf('|');
    return { text: marked.replace('|', ''), start, end: start };
  }
  const start = marked.indexOf('[');
  const end = marked.indexOf(']') - 1;
  return { text: marked.replace('[', '').replace(']', ''), start, end };
}

/** The inverse of `at`, for readable expectations. */
function show(state: TextState): string {
  if (state.start === state.end)
    return `${state.text.slice(0, state.start)}|${state.text.slice(state.start)}`;
  return `${state.text.slice(0, state.start)}[${state.text.slice(state.start, state.end)}]${state.text.slice(state.end)}`;
}

describe('inline marks', () => {
  it('wraps the selection and keeps it selected', () => {
    expect(show(toggleInline(at('ship [today] please'), 'bold'))).toBe('ship **[today]** please');
    expect(show(toggleInline(at('ship [today]'), 'italic'))).toBe('ship _[today]_');
    expect(show(toggleInline(at('[x]'), 'code'))).toBe('`[x]`');
    expect(show(toggleInline(at('[old]'), 'strike'))).toBe('~~[old]~~');
  });

  it('unwraps when the selection is already wrapped, inside or out', () => {
    expect(show(toggleInline(at('ship **[today]** please'), 'bold'))).toBe('ship [today] please');
    expect(show(toggleInline(at('ship [**today**] please'), 'bold'))).toBe('ship [today] please');
  });

  it('inserts a selected placeholder at a caret', () => {
    expect(show(toggleInline(at('a |b'), 'bold'))).toBe('a **[bold text]**b');
  });

  it('turns the selection into a link with the URL selected', () => {
    expect(show(insertLink(at('see [the docs]')))).toBe('see [the docs]([https://])');
    expect(show(insertLink(at('|')))).toBe('[link text]([https://])');
  });
});

describe('line formats', () => {
  it('toggles bullets, numbers, tasks and quotes on every selected line', () => {
    const lines = at('[one\ntwo\n\nthree]');
    expect(toggleLines(lines, 'bullet').text).toBe('- one\n- two\n\n- three');
    expect(toggleLines(lines, 'numbered').text).toBe('1. one\n2. two\n\n3. three');
    expect(toggleLines(lines, 'task').text).toBe('- [ ] one\n- [ ] two\n\n- [ ] three');
    expect(toggleLines(lines, 'quote').text).toBe('> one\n> two\n\n> three');
    const bulleted = toggleLines(lines, 'bullet');
    expect(toggleLines(bulleted, 'bullet').text).toBe('one\ntwo\n\nthree');
    // Switching list kinds replaces the old marker.
    expect(toggleLines(bulleted, 'numbered').text).toBe('1. one\n2. two\n\n3. three');
  });

  it('formats the caret line only, keeping indentation', () => {
    expect(toggleLines(at('intro\n  ne|sted\nend'), 'bullet').text).toBe('intro\n  - nested\nend');
  });

  it('sets, changes and removes headings', () => {
    expect(setHeading(at('Ti|tle'), 2).text).toBe('## Title');
    expect(setHeading(at('## Ti|tle'), 3).text).toBe('### Title');
    expect(setHeading(at('## Ti|tle'), 2).text).toBe('Title');
  });

  it('wraps a selection in a fenced code block on its own lines', () => {
    expect(show(insertCodeBlock(at('run [npm test]'), 'sh'))).toBe(
      'run \n```sh\n[npm test]\n```\n'
    );
    expect(show(insertCodeBlock(at('|')))).toBe('```\n[code]\n```\n');
  });
});

describe('list continuation', () => {
  it('continues bullets, numbers and tasks', () => {
    expect(show(continueList(at('- milk|')) as TextState)).toBe('- milk\n- |');
    expect(show(continueList(at('9. nine|')) as TextState)).toBe('9. nine\n10. |');
    expect(show(continueList(at('- [x] done|')) as TextState)).toBe('- [x] done\n- [ ] |');
    expect(show(continueList(at('  - nested|')) as TextState)).toBe('  - nested\n  - |');
  });

  it('ends the list on an empty item and ignores plain lines', () => {
    expect(show(continueList(at('- milk\n- |')) as TextState)).toBe('- milk\n|');
    expect(continueList(at('plain|'))).toBeNull();
    expect(continueList(at('- [a]'))).toBeNull();
  });
});

describe('mentions and references', () => {
  it('finds the trigger being typed at the caret', () => {
    expect(triggerAt(at('hi @mar|'))).toEqual({ trigger: '@', query: 'mar', start: 3 });
    expect(triggerAt(at('see #|'))).toEqual({ trigger: '#', query: '', start: 4 });
    expect(triggerAt(at('(@ana|'))).toEqual({ trigger: '@', query: 'ana', start: 1 });
  });

  it('ignores emails, mid-word symbols, spaces and other triggers', () => {
    expect(triggerAt(at('mail ana@example.com|'))).toBeNull();
    expect(triggerAt(at('C#|'))).toBeNull();
    expect(triggerAt(at('@ana |'))).toBeNull();
    expect(triggerAt(at('cost $5|'))).toBeNull();
    expect(triggerAt(at('[@ana]'))).toBeNull();
  });

  it('replaces the typed query with the completion and a space', () => {
    const state = at('ping @ma| today');
    const match = triggerAt(state);
    expect(match).not.toBeNull();
    expect(show(applyCompletion(state, match as NonNullable<typeof match>, 'marta.ruiz'))).toBe(
      'ping @marta.ruiz | today'
    );
  });
});
