import { SANDBOX_PATTERN as CORE_SANDBOX_PATTERN } from '@protoyard/core';
import { describe, expect, it } from 'vitest';
import {
  defaultScenarios,
  paneUrl,
  paramsFromState,
  SANDBOX_PATTERN,
  sandboxName,
  stateFromParams,
} from '../src/lib/compare';

const scenarios = ['new-company', 'growing-team', 'mature-company'];

describe('compare scenarios', () => {
  it('uses exactly the runtime sandbox pattern from @protoyard/core', () => {
    // Duplicated to keep zod out of the gallery's client bundle; this pins them together.
    expect(SANDBOX_PATTERN.source).toBe(CORE_SANDBOX_PATTERN.source);
    expect(SANDBOX_PATTERN.flags).toBe(CORE_SANDBOX_PATTERN.flags);
  });

  it('names sandboxes per pane and generation within the runtime pattern', () => {
    expect(sandboxName('a', 0)).toBe('compare-a');
    expect(sandboxName('b', 3)).toBe('compare-b-3');
    expect(SANDBOX_PATTERN.test(sandboxName('c', 9999))).toBe(true);
  });

  it('builds frame URLs for relative (showcase) and absolute (dev) app URLs', () => {
    expect(paneUrl('/protoyard/p/crm-demo/app/', 'a', 'growing-team', 0)).toBe(
      '/protoyard/p/crm-demo/app/?sandbox=compare-a&scenario=growing-team&devtools=0'
    );
    expect(paneUrl('http://localhost:5173/', 'b', 'new-company', 2)).toBe(
      'http://localhost:5173/?sandbox=compare-b-2&scenario=new-company&devtools=0'
    );
  });

  it('defaults to the default scenario plus the next distinct one', () => {
    expect(defaultScenarios(scenarios, 'growing-team')).toEqual(['growing-team', 'new-company']);
    expect(defaultScenarios(['only'], null)).toEqual(['only', 'only']);
  });

  it('round-trips deep links and ignores unknown values', () => {
    const state = stateFromParams(
      new URLSearchParams('a=mature-company&b=new-company&c=growing-team&device=iphone&gen=2'),
      scenarios,
      'growing-team'
    );
    expect(state).toEqual({
      scenarios: ['mature-company', 'new-company', 'growing-team'],
      // Legacy viewport aliases normalize to the core catalog.
      device: 'phone-pill',
      generation: 2,
    });
    expect(paramsFromState(state)).toBe(
      '?a=mature-company&b=new-company&c=growing-team&device=phone-pill&gen=2'
    );
    const junk = stateFromParams(
      new URLSearchParams('a=nope&b=../x&device=watch&gen=-4'),
      scenarios,
      'growing-team'
    );
    expect(junk).toEqual({
      scenarios: ['growing-team', 'new-company'],
      device: 'laptop-window',
      generation: 0,
    });
  });
});
