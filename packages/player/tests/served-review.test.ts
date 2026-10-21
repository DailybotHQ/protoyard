import { definePrototypeFromBlueprint, parseBlueprint } from '@protoyard/blueprint';
import { describe, expect, it } from 'vitest';
import analytics from '../../../blueprints/quick/analytics.json';
import { SERVED_REVIEW_ENDPOINT, withServedReview } from '../src/served-review.ts';

const blueprint = parseBlueprint(analytics);
const { definition } = definePrototypeFromBlueprint(blueprint, { namespace: 'bp-served' });

describe('withServedReview', () => {
  it('uses the same-origin HTTP comments API only when quick serve asks for it', () => {
    const served = withServedReview(definition, '?comments=1&review=http');
    expect(served.manifest.build.review).toEqual({
      enabled: true,
      adapter: 'http',
      endpoint: SERVED_REVIEW_ENDPOINT,
    });
    expect(SERVED_REVIEW_ENDPOINT).toBe('/api/comments');
    // The original definition is untouched.
    expect(definition.manifest.build.review).toBeUndefined();
  });

  it('leaves review alone otherwise and never takes an endpoint from the URL', () => {
    expect(withServedReview(definition, '')).toBe(definition);
    expect(withServedReview(definition, '?comments=1')).toBe(definition);
    expect(withServedReview(definition, '?review=local')).toBe(definition);
    const hostile = withServedReview(
      definition,
      '?review=http&endpoint=https://evil.example/api&reviewEndpoint=//evil.example'
    );
    expect(hostile.manifest.build.review?.endpoint).toBe('/api/comments');
  });
});
