import { describe, expect, it } from 'vitest';
import {
  createMemoryPresenterTransport,
  createPresenterLink,
  PresenterMessageSchema,
  parsePresenterMessage,
  presenterChannelName,
  presenterMessage,
  sanitizeNamespace,
} from '../src/presenter/index.ts';

describe('presenter protocol', () => {
  it('accepts only { type, slideId, step }', () => {
    expect(
      PresenterMessageSchema.safeParse({ type: 'sync', slideId: 'intro', step: 1 }).success
    ).toBe(true);
    expect(parsePresenterMessage({ type: 'hello', slideId: 'body', step: 0 })).toEqual({
      type: 'hello',
      slideId: 'body',
      step: 0,
    });
  });

  it('rejects malformed and hostile payloads', () => {
    expect(parsePresenterMessage(null)).toBeNull();
    expect(parsePresenterMessage('sync')).toBeNull();
    expect(parsePresenterMessage({ type: 'sync', slideId: 'Intro', step: 0 })).toBeNull();
    expect(parsePresenterMessage({ type: 'sync', slideId: '../x', step: 0 })).toBeNull();
    expect(parsePresenterMessage({ type: 'sync', slideId: 'intro', step: -1 })).toBeNull();
    expect(parsePresenterMessage({ type: 'sync', slideId: 'intro', step: 99 })).toBeNull();
    expect(
      parsePresenterMessage({ type: 'sync', slideId: 'intro', step: 0, extra: true })
    ).toBeNull();
    expect(parsePresenterMessage({ type: 'eval', slideId: 'intro', step: 0 })).toBeNull();
    expect(
      parsePresenterMessage({ type: 'sync', slideId: 'intro', step: 0, code: 'alert(1)' })
    ).toBeNull();
  });

  it('scopes channel names by sanitized namespace', () => {
    expect(presenterChannelName('My Deck')).toBe('protoyard.deck.presenter.v1:my-deck');
    expect(sanitizeNamespace('')).toBe('default');
    expect(presenterChannelName('a/b')).toContain('a-b');
  });

  it('syncs position over a shared memory transport both ways', () => {
    const shared = createMemoryPresenterTransport('shared');
    const positions: string[] = [];
    const makeSide = (label: string) =>
      createPresenterLink({
        transport: {
          name: shared.name,
          post: (m) => shared.post(m),
          subscribe: (h) => shared.subscribe(h),
          close: () => {},
        },
        onRemote: (p) => positions.push(`${label}:${p.slideId}/${p.step}`),
        initial: { slideId: 'intro', step: 0 },
      });

    const a = makeSide('a');
    const b = makeSide('b');
    a.publish({ slideId: 'body', step: 0 });
    expect(positions).toContain('b:body/0');
    b.publish({ slideId: 'close', step: 0 });
    expect(positions).toContain('a:close/0');
    a.destroy();
    b.destroy();
    shared.close();
  });

  it('request causes a peer to reply with sync of its last position', () => {
    const shared = createMemoryPresenterTransport('req');
    const a = createPresenterLink({
      transport: shared,
      onRemote: () => {},
      initial: { slideId: 'intro', step: 2 },
    });
    const peerHits: string[] = [];
    const stop = shared.subscribe((m) => {
      if (m.type === 'sync') peerHits.push(`${m.slideId}/${m.step}`);
    });
    shared.post(presenterMessage('request', 'intro', 0));
    expect(peerHits).toContain('intro/2');
    stop();
    a.destroy();
  });
});
