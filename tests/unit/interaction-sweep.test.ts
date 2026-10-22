import { describe, expect, it } from 'vitest';
import {
  classifyActivation,
  type InteractionFinding,
  type PageSnapshot,
  snapshotChanged,
  summarizeFindings,
} from '../e2e/support/interaction-sweep.ts';

const base: PageSnapshot = {
  url: 'http://127.0.0.1/',
  title: 't',
  bodyText: 'hello',
  focusName: 'BUTTON:x',
  markers: 'a',
};

describe('interaction-sweep pure helpers', () => {
  it('detects snapshot changes', () => {
    expect(snapshotChanged(base, base)).toBe(false);
    expect(snapshotChanged(base, { ...base, bodyText: 'bye' })).toBe(true);
    expect(snapshotChanged(base, { ...base, url: 'http://127.0.0.1/#x' })).toBe(true);
  });

  it('classifies live, dead and inert expectations', () => {
    expect(
      classifyActivation({ name: 'a', kind: 'click', changed: true, expectLive: true }).outcome
    ).toBe('changed');
    expect(
      classifyActivation({ name: 'b', kind: 'click', changed: false, expectLive: true }).detail
    ).toBe('expected a visible effect');
    expect(
      classifyActivation({ name: 'c', kind: 'click', changed: false, expectDead: true }).detail
    ).toBe('inert as expected');
    expect(
      classifyActivation({ name: 'd', kind: 'click', changed: true, expectDead: true }).detail
    ).toBe('inert control produced a change');
  });

  it('summarizes dead vs live findings', () => {
    const findings: InteractionFinding[] = [
      { name: 'live', kind: 'click', outcome: 'changed' },
      {
        name: 'dead',
        kind: 'click',
        outcome: 'unchanged',
        detail: 'expected a visible effect',
      },
    ];
    const report = summarizeFindings(findings);
    expect(report.live).toHaveLength(1);
    expect(report.dead).toHaveLength(1);
  });
});
