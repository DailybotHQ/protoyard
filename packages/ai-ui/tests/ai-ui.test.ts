import { type ApprovalActor, type Suggestion } from '@protoyard/ai';
import { MESSAGE_FORMAT } from '@protoyard/ai/messages';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SuggestionCard from '../src/approvals/SuggestionCard.svelte';
import AssistantComposer from '../src/components/AssistantComposer.svelte';
import ChartAnswer from '../src/components/ChartAnswer.svelte';
import RichAnswer from '../src/components/RichAnswer.svelte';
import MessageList from '../src/MessageList.svelte';
import { ChatMessageBlocks, type MessageActionEvent } from '../src/messages/index.ts';
import VoiceMode from '../src/voice/VoiceMode.svelte';

afterEach(() => cleanup());

describe('AssistantComposer', () => {
  it('shows a sending state while onSubmit is in flight and never sends twice', async () => {
    let release!: () => void;
    const onSubmit = vi.fn(() => new Promise<void>((r) => (release = r)));
    render(AssistantComposer, { onSubmit });
    const prompt = screen.getByRole('textbox', { name: 'Message the simulated assistant' });
    await fireEvent.input(prompt, { target: { value: 'Draft a launch plan' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    const sending = await screen.findByRole('button', { name: 'Sending message' });
    expect(sending.getAttribute('aria-busy')).toBe('true');
    expect((sending as HTMLButtonElement).disabled).toBe(true);
    await fireEvent.keyDown(prompt, { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    release();
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Sending message' })).toBeNull()
    );
  });
});

describe('MessageList', () => {
  const thread = [
    {
      id: 'u1',
      role: 'user' as const,
      content: 'Plan the launch',
      createdAt: '2026-10-17T12:00:00.000Z',
    },
    {
      id: 'a1',
      role: 'assistant' as const,
      content: '**Step one**: pick a date.',
      createdAt: '2026-10-17T12:01:00.000Z',
      branchIndex: 0,
      branchCount: 2,
    },
  ];

  it('marks the last reply as writing while streaming, with its actions held back', () => {
    render(MessageList, {
      messages: thread,
      conversationId: 'c1',
      streaming: true,
      onFeedback: vi.fn(),
      onRegenerate: vi.fn(),
    });
    expect(screen.getByText('Writing…')).toBeTruthy();
    expect(screen.getByText('Writing a reply…')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Helpful response' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Regenerate response' })).toBeNull();
  });
});

describe('RichAnswer', () => {
  it('renders markdown as safe elements and leaves executable markup as text', () => {
    const { container } = render(RichAnswer, {
      content:
        '# Plan\n\n**Ready** <script>alert(1)</script> [unsafe](javascript:alert(1)) ![Cover](assets/cover.webp)',
    });
    expect(screen.getByRole('heading', { name: 'Plan' })).toBeTruthy();
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toContain('<script>alert(1)</script>');
    expect(container.querySelector('a[href^="javascript:"]')).toBeNull();
    expect(container.querySelector('img')?.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(container.querySelector('strong')?.textContent).toBe('Ready');
  });
});

// --- merged from messages.test.ts ---

describe('messages', () => {
  afterEach(cleanup);

  const PNG =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

  const msg = (blocks: unknown[], extra: Record<string, unknown> = {}) => ({
    format: MESSAGE_FORMAT,
    id: 'msg-1',
    blocks,
    ...extra,
  });

  /** A promise the test settles by hand, to observe pending states. */
  function deferred() {
    let resolve!: () => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<void>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  function view(message: unknown, props: Record<string, unknown> = {}) {
    return render(ChatMessageBlocks, { message, ...props });
  }

  describe('chat message blocks: rendering', () => {
    it('renders a link preview that never loads remote media and opens safely', () => {
      const { container } = view(
        msg([
          {
            type: 'link_preview',
            url: 'https://www.example.com/post',
            title: 'Release notes',
            description: 'What changed this week.',
            image: PNG,
          },
          { type: 'link_preview', url: 'https://example.com/plain', image: 'attachment:thumb-1' },
        ])
      );
      const card = screen.getByRole('link', { name: /Release notes/ });
      expect(card.getAttribute('href')).toBe('https://www.example.com/post');
      expect(card.getAttribute('target')).toBe('_blank');
      expect(card.getAttribute('rel')).toBe('noopener noreferrer');
      expect(within(card).getByText('example.com')).toBeTruthy();
      const images = [...container.querySelectorAll('img')].map((img) => img.getAttribute('src'));
      expect(images).toEqual([PNG]);
    });
  });

  describe('chat message blocks: safe fallback', () => {
    it('refuses every unsafe message', () => {
      for (const [_name, input] of [
        ['markup in text', msg([{ type: 'text', text: '<img src=x onerror=alert(1)>' }])],
        [
          'a newer format',
          { format: 'protoyard.message@2', blocks: [{ type: 'text', text: 'hi' }] },
        ],
        ['not JSON', '{"format":'],
        [
          'a remote preview image',
          msg([
            {
              type: 'link_preview',
              url: 'https://example.com',
              image: 'https://evil.example/x.png',
            },
          ]),
        ],
      ]) {
        const { container } = view(input);
        expect(container.querySelector('[data-py-message-invalid]')).not.toBeNull();
        expect(container.querySelector('img')).toBeNull();
      }
    });
  });

  describe('chat message blocks: actions', () => {
    it('reports a typed button event and stays busy until the host settles', async () => {
      const gate = deferred();
      const events: MessageActionEvent[] = [];
      view(
        msg([
          {
            type: 'buttons',
            buttons: [
              { label: 'Approve', action: 'approve', value: 'req-7', style: 'primary' },
              { label: 'Docs', url: 'https://example.com/docs' },
            ],
          },
        ]),
        {
          onAction: (event: MessageActionEvent) => {
            events.push(event);
            return gate.promise;
          },
        }
      );
      const approve = screen.getByRole('button', { name: 'Approve' });
      await fireEvent.click(approve);
      expect(events).toEqual([
        { kind: 'button', messageId: 'msg-1', blockIndex: 0, action: 'approve', value: 'req-7' },
      ]);
      expect(approve.getAttribute('aria-busy')).toBe('true');
      expect((approve as HTMLButtonElement).disabled).toBe(true);
      gate.resolve();
      await waitFor(() => expect(approve.getAttribute('aria-busy')).toBeNull());
      expect((approve as HTMLButtonElement).disabled).toBe(false);
      const docs = screen.getByRole('link', { name: /Docs/ });
      expect(docs.getAttribute('rel')).toBe('noopener noreferrer');
    });
  });
});

// --- merged from chart-answers.test.ts ---

describe('chart-answers', () => {
  class FixedWidthObserver {
    callback: ResizeObserverCallback;
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
    }
    observe(target: Element) {
      this.callback(
        [{ target, contentRect: { width: 480, height: 220 } } as unknown as ResizeObserverEntry],
        this as unknown as ResizeObserver
      );
    }
    unobserve() {}
    disconnect() {}
  }

  beforeEach(() => vi.stubGlobal('ResizeObserver', FixedWidthObserver));
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  describe('ChartAnswer', () => {
    it('shows an error note and the raw data as text for an invalid spec, never markup', () => {
      const text =
        '{"kind":"bar","title":"<img src=x onerror=alert(1)>","labels":["a"],"series":[]}';
      render(ChartAnswer, { text });
      const note = screen.getByRole('note');
      expect(note.textContent).toContain('This chart could not be shown.');
      expect(note.textContent).toContain('series');
      expect(note.querySelector('img')).toBeNull();
      expect(note.querySelector('pre')?.textContent).toBe(text);
    });
  });
});

// --- merged from approvals.test.ts ---

describe('approvals', () => {
  afterEach(cleanup);
  const SUBJECT: ApprovalActor = { id: 'person_oscar', canApprove: false };

  function suggestion(over: Partial<Suggestion> = {}): Suggestion {
    return {
      id: 'approval_sug_resp_1',
      scopeId: 'org_example',
      kind: 'link_record',
      action: 'apply',
      area: 'records',
      subjectId: SUBJECT.id,
      sourceId: 'resp_1',
      summary: 'Link blocker to ENG-12',
      targetId: 'task_12',
      targetKey: 'ENG-12',
      targetLabel: 'Ship onboarding',
      status: 'pending',
      mode: 'suggest',
      levelAtCreation: 2,
      createdAt: '2026-03-15T10:00:00.000Z',
      decidedAt: null,
      decidedBy: null,
      deciderId: null,
      preparedApplySummary: null,
      preparedNotifySummary: null,
      payload: {},
      ...over,
    };
  }

  describe('SuggestionCard', () => {
    it('shows evidence fields and runs confirm with pending feedback', async () => {
      let resolve!: () => void;
      const gate = new Promise<void>((r) => {
        resolve = r;
      });
      const onConfirm = vi.fn(() => gate);
      const view = render(SuggestionCard, {
        props: {
          suggestion: suggestion({
            preparedApplySummary: 'Link to ENG-12',
            preparedNotifySummary: 'Please review ENG-12',
          }),
          viewer: SUBJECT,
          onConfirm,
          onDismiss: vi.fn(),
        },
      });
      expect(view.getByText('Link blocker to ENG-12')).toBeTruthy();
      expect(view.getByText('Prepared change').parentElement?.textContent).toContain(
        'Link to ENG-12'
      );
      expect(view.getByText(/Simulated · no real authority/)).toBeTruthy();

      const button = view.getByRole('button', { name: 'Confirm' });
      await fireEvent.click(button);
      expect(onConfirm).toHaveBeenCalledOnce();
      await waitFor(() => expect(button.getAttribute('aria-busy')).toBe('true'));
      resolve();
      await waitFor(() => expect(button.getAttribute('aria-busy')).not.toBe('true'));
    });
  });
});

// --- merged from voice.test.ts ---

describe('voice', () => {
  afterEach(() => cleanup());

  describe('VoiceMode', () => {
    it('does not request microphone access unless the optional meter is enabled and chosen', async () => {
      const getUserMedia = vi.fn();
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: { getUserMedia },
      });
      render(VoiceMode, {
        clock: { now: () => new Date(0), nowMs: () => 0, sleep: async () => {} },
      });

      expect(screen.queryByRole('button', { name: /local mic level meter/i })).toBeNull();
      expect(getUserMedia).not.toHaveBeenCalled();
    });

    const clock = { now: () => new Date(0), nowMs: () => 0, sleep: async () => {} };

    it('hold-to-talk listens while held and transcribes on release (D-G-045)', async () => {
      const onPress = vi.fn();
      const onRelease = vi.fn();
      const onTranscript = vi.fn();
      render(VoiceMode, {
        clock,
        transcripts: ['Move standup to Friday.'],
        holdToTalk: true,
        onPress,
        onRelease,
        onTranscript,
      });
      const hold = screen.getByRole('button', { name: 'Hold to talk' });
      await fireEvent.pointerDown(hold, { button: 0 });
      expect(onPress).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('button', { name: 'Release to transcribe' })).toBeTruthy();
      await fireEvent.pointerUp(hold, { button: 0 });
      await waitFor(() => expect(onRelease).toHaveBeenCalledWith('Move standup to Friday.'));
      expect(onTranscript).toHaveBeenCalledWith('Move standup to Friday.');
      expect(screen.getByRole('button', { name: 'Hold to talk' })).toBeTruthy();
    });

    it('hold-to-talk works from the keyboard and ignores key repeat', async () => {
      const onPress = vi.fn();
      const onRelease = vi.fn();
      render(VoiceMode, {
        clock,
        transcripts: ['Hello there.'],
        holdToTalk: true,
        onPress,
        onRelease,
      });
      const hold = screen.getByRole('button', { name: 'Hold to talk' });
      await fireEvent.keyDown(hold, { key: ' ' });
      await fireEvent.keyDown(hold, { key: ' ', repeat: true });
      expect(onPress).toHaveBeenCalledTimes(1);
      await fireEvent.keyUp(hold, { key: ' ' });
      await waitFor(() => expect(onRelease).toHaveBeenCalledWith('Hello there.'));
    });

    it('the press and release callbacks also follow the push-to-talk toggle', async () => {
      const onPress = vi.fn();
      const onRelease = vi.fn();
      render(VoiceMode, { clock, transcripts: ['Toggle turn.'], onPress, onRelease });
      await fireEvent.click(screen.getByRole('button', { name: 'Start push to talk' }));
      expect(onPress).toHaveBeenCalledTimes(1);
      await fireEvent.click(screen.getByRole('button', { name: 'Finish and transcribe' }));
      await waitFor(() => expect(onRelease).toHaveBeenCalledWith('Toggle turn.'));
    });

    it('mute drops the turn: release reports null and nothing is sent', async () => {
      const onMuteChange = vi.fn();
      const onRelease = vi.fn();
      const onTranscript = vi.fn();
      render(VoiceMode, {
        clock,
        holdToTalk: true,
        showMute: true,
        onMuteChange,
        onRelease,
        onTranscript,
      });
      const mute = screen.getByRole('button', { name: 'Mute microphone' });
      expect(mute.getAttribute('aria-pressed')).toBe('false');
      await fireEvent.click(mute);
      expect(mute.getAttribute('aria-pressed')).toBe('true');
      await waitFor(() => expect(onMuteChange).toHaveBeenCalledWith(true));
      expect(document.querySelector('[data-voice-muted]')).not.toBeNull();
      const hold = screen.getByRole('button', { name: 'Hold to talk' });
      await fireEvent.pointerDown(hold, { button: 0 });
      await fireEvent.pointerUp(hold, { button: 0 });
      await waitFor(() => expect(onRelease).toHaveBeenCalledWith(null));
      expect(onTranscript).not.toHaveBeenCalled();
    });

    it('starts muted from the muted prop', async () => {
      const onRelease = vi.fn();
      render(VoiceMode, { clock, holdToTalk: true, muted: true, onRelease });
      const hold = screen.getByRole('button', { name: 'Hold to talk' });
      await fireEvent.pointerDown(hold, { button: 0 });
      await fireEvent.pointerUp(hold, { button: 0 });
      await waitFor(() => expect(onRelease).toHaveBeenCalledWith(null));
    });

    it('dictation appends transcripts to the draft instead of sending them', async () => {
      const onDictate = vi.fn();
      const onTranscript = vi.fn();
      render(VoiceMode, {
        clock,
        transcripts: ['First line.', 'Second line.'],
        holdToTalk: true,
        showDictation: true,
        draft: 'Note:',
        onDictate,
        onTranscript,
      });
      await fireEvent.click(screen.getByRole('button', { name: 'Dictate into draft' }));
      const hold = screen.getByRole('button', { name: 'Hold to talk' });
      for (let turn = 0; turn < 2; turn += 1) {
        await fireEvent.pointerDown(hold, { button: 0 });
        await fireEvent.pointerUp(hold, { button: 0 });
        await waitFor(() => expect(onDictate).toHaveBeenCalledTimes(turn + 1));
      }
      expect(onDictate).toHaveBeenNthCalledWith(1, 'First line.', 'Note: First line.');
      expect(onDictate).toHaveBeenNthCalledWith(
        2,
        'Second line.',
        'Note: First line. Second line.'
      );
      expect(onTranscript).not.toHaveBeenCalled();
      const box = document.querySelector('[data-voice-draft]') as HTMLElement;
      expect(box.textContent).toContain('Note: First line. Second line.');
      expect(box.textContent).toContain('not sent');
      await fireEvent.click(screen.getByRole('button', { name: 'Clear draft' }));
      expect(box.textContent).toContain('Dictated words appear here.');
    });
  });
});
