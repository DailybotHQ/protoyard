# @protoyard/ai-ui

Svelte 5 components for prototypes that simulate AI assistants. The package renders conversations and interaction controls; it does not call a model provider, create database rows, or implement sharing itself. Mutations are callback props so the prototype can route them through its own services. Model labels and UI copy keep the simulated boundary visible.

**Platform guide:** [docs/AI_KITS.md](../../docs/AI_KITS.md) (workspace, virtual threads, widget launcher→sidebar→fullscreen, voice panel). **Measured bundles and long threads:** [docs/PERFORMANCE.md → AI kits](../../docs/PERFORMANCE.md#ai-kits).

## Install in a workspace prototype

Add `"@protoyard/ai-ui": "workspace:*"` to the prototype dependencies. Import the styles after Tailwind and the theme/UI styles:

```css
@import 'tailwindcss';
@import '@protoyard/themes/base.css';
@import '@protoyard/ui/styles.css';
@import '@protoyard/ai-ui/styles.css';
```

## Assistant workspace

`AssistantWorkspace` accepts conversation summaries and the active branch's messages. Send, stop, rename, pin, folder, feedback, branch, regenerate, edit and share operations are callbacks. The component does not persist changes. `onShare` must return a URL created by the consuming prototype; the UI then offers a copy action.

The workspace renders its conversation through `MessageList`, which virtualizes rows using measured heights and a small overscan window. It keeps the visible message anchored as streamed content changes and restores that message and offset from session storage when the same conversation is reopened in the tab. The saved position is presentation state; conversation messages remain owned by the prototype.

```svelte
<script lang="ts">
  import { AssistantWorkspace, type AssistantConversation, type AssistantMessage, type AssistantSendInput } from '@protoyard/ai-ui';

  let conversations: AssistantConversation[] = $state([]);
  let messages: AssistantMessage[] = $state([]);
  let streaming = $state(false);

  async function send(conversationId: string, input: AssistantSendInput) {
    // A real prototype calls its own service and persists its own attachment metadata.
    await assistantService.send(conversationId, input);
  }
</script>

<AssistantWorkspace
  {conversations}
  {messages}
  {streaming}
  onSend={send}
  onStop={() => assistantService.stop()}
  onRenameConversation={(id, title) => assistantService.rename(id, title)}
  onTogglePin={(id) => assistantService.togglePin(id)}
/>
```

The composer supports Enter to send, Shift+Enter for a newline, Escape to stop a stream, model selection, file selection, slash-command suggestions, and @mention suggestions. The parent owns streaming state and should update `messages` as deterministic chunks arrive. `RichAnswer` renders the plain-data AST from `parseMarkdown` using text nodes and Svelte elements; it never uses `{@html}`. `CanvasPanel` displays code or editable document text in a responsive side panel.

**Scrollable code regions.** Overflowing `<pre>` blocks in `RichAnswer` (fenced code), `ChartAnswer` (invalid chart data), and `CanvasPanel` (code kind) use `tabindex="0"` and an `aria-label`, matching the ui-kit `CodeBlock` pattern, so keyboard users can reach them (axe `scrollable-region-focusable` / WCAG 2.1.1). Covered by `packages/ai-ui/tests/scroll-regions.test.ts`.

**Chart answers.** `RichAnswer` parses with `{ charts: true }`.
- A ```` ```chart ```` fence (see `@protoyard/ai/chart`) shows "Preparing
  chart…" while it streams.
- When the fence closes, `ChartAnswer` loads on demand. It validates the spec,
  shows a table of the values at once, then the matching `@protoyard/charts-ui`
  chart (bar, line, area, donut, pie or funnel), which brings keyboard
  navigation, tooltips and its own table toggle.
- An invalid spec shows a note with the reason and the raw data as text.
- The charts kit and the zod schema are lazy chunks; only the small parser and
  renderer branch ship with `RichAnswer`. In nova-assistant-demo initial JS
  went from 169.40 KB to 169.93 KB gzip.
- `styles.css` registers the charts-ui class sources, so prototypes need no
  extra import.

Conversation folder controls require `folders`, `onCreateFolder`, and `onMoveToFolder` callbacks. Features without a callback are disabled. The caller supplies `onRegenerate`, `onEditMessage`, `onBranchChange`, `onFeedback`, and `onShare` only when those operations are implemented.

All components use Svelte 5 runes and theme token utility classes. Import `styles.css` to register this package's class sources with Tailwind. Components accept data-only messages from `@protoyard/ai`; no credentials, provider SDKs, generated models or external network calls are included.

## Simulated voice mode

Load the voice panel from its lazy subpath when the user opens voice mode:

```ts
const { VoiceMode } = await import('@protoyard/ai-ui/voice');
```

Pass the injected `AiClock`, scripted transcript options, the latest simulated assistant reply and an `onTranscript` handler. Captions are always visible. Browser `speechSynthesis` speaks replies locally when available; otherwise output stays muted and the reply caption remains visible. The panel does not request a microphone by default. A consumer may opt into showing the local mic level meter; enabling it asks for microphone permission and reads amplitude only with Web Audio, without recording, storing or uploading audio. Stop the meter to release its stream; component teardown also stops it.

## Widget modes

```ts
const { AssistantWidget } = await import('@protoyard/ai-ui/widget');
```

`AssistantWidget` hosts the same workspace callbacks inside **launcher → sidebar → fullscreen** chrome. The panel module loads on first open. Mode is stored per `prototypeId` in `localStorage` when the browser allows it. Escape collapses one level. No model or network call is introduced by the widget shell.

## Package output

The repository keeps source exports for workspace development. `pnpm build:packages --filter svelte` creates the compiled ESM, declarations and Svelte components under `dist/` that the packed manifest exposes.


## Suggestion approvals (lazy)

Import from `@protoyard/ai-ui/approvals` so the approval surface stays out of the
assistant boot chunk. Pair with `@protoyard/ai/approvals` pure helpers.

| Export | Purpose |
| --- | --- |
| `SuggestionCard` | Waiting or decided suggestion with evidence and decision buttons |
| `ChatApprovalCard` | Compact chat-row approval |
| `AutonomyLevelPicker` | Per-area autonomy radios (`setLevel` via `onChange`) |
| `AuditTrail` | Newest-first audit table |

Callbacks are required for every decision. Show pending state is built in.
Label the UI as simulated — these controls are prototype UX, not security.

```ts
import {
  AuditTrail,
  AutonomyLevelPicker,
  ChatApprovalCard,
  SuggestionCard,
} from '@protoyard/ai-ui/approvals';
```

Bundle note: the approvals subpath is optional; assistant workspace entry graphs
do not import it until a screen does.
