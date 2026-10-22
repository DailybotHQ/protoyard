import { afterEach, describe, expect, it } from 'vitest';
import { artifactLinkSearch, consumeArtifactLink } from '../src/shell/artifact-link.ts';

const OPTIONS = {
  scenarios: ['signup', 'first-week', 'month'],
  personas: ['avery', 'maria', 'user_0002'],
  themes: ['ocean-blue', 'violet'],
};

describe('artifactLinkSearch', () => {
  it('maps known scenario, optional persona, and optional theme tokens', () => {
    expect(artifactLinkSearch('#month', OPTIONS)).toBe('?scenario=month');
    expect(artifactLinkSearch('#month--maria', OPTIONS)).toBe('?scenario=month&actor=maria');
    expect(artifactLinkSearch('#month--ocean-blue', OPTIONS)).toBe(
      '?scenario=month&theme=ocean-blue'
    );
    expect(artifactLinkSearch('#first-week--user_0002--violet', OPTIONS)).toBe(
      '?scenario=first-week&actor=user_0002&theme=violet'
    );
  });

  it('ignores unknown values while retaining known scenario and token fields', () => {
    expect(artifactLinkSearch('#month--unknown', OPTIONS)).toBe('?scenario=month');
    expect(artifactLinkSearch('#month--unknown--violet', OPTIONS)).toBe(
      '?scenario=month&theme=violet'
    );
    expect(artifactLinkSearch('#month--maria--unknown', OPTIONS)).toBe(
      '?scenario=month&actor=maria'
    );
    expect(artifactLinkSearch('#missing--maria--violet', OPTIONS)).toBeNull();
  });

  it('preserves ordinary routes and deck slide hashes', () => {
    expect(artifactLinkSearch('#/settings/profile', OPTIONS)).toBeNull();
    expect(artifactLinkSearch('#/slides/slide-2/1', OPTIONS)).toBeNull();
    expect(artifactLinkSearch('#slide-2', OPTIONS)).toBeNull();
    expect(artifactLinkSearch('#month--maria--violet--extra', OPTIONS)).toBeNull();
  });
});

describe('consumeArtifactLink', () => {
  afterEach(() => history.replaceState(null, '', '/'));

  it('returns validated query parameters and resets the consumed hash to the app root', () => {
    history.replaceState(null, '', '/?devtools=0#month--maria--violet');
    expect(consumeArtifactLink(OPTIONS)).toBe('?scenario=month&actor=maria&theme=violet');
    expect(location.hash).toBe('#/');
    expect(location.search).toBe('?devtools=0');
  });

  it('does not consume a route hash', () => {
    history.replaceState(null, '', '/#/slides/slide-2/1');
    expect(consumeArtifactLink(OPTIONS)).toBeUndefined();
    expect(location.hash).toBe('#/slides/slide-2/1');
  });
});
