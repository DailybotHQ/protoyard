# @protoyard/ai-ui

Svelte 5 components for prototypes that simulate AI assistants. The package renders conversations and interaction controls; it does not call a model provider, create database rows, or implement sharing itself. Mutations are callback props so the prototype can route them through its own services. Model labels and UI copy keep the simulated boundary visible.

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

Conversation folder controls require `folders`, `onCreateFolder`, and `onMoveToFolder` callbacks. Features without a callback are disabled. The caller supplies `onRegenerate`, `onEditMessage`, `onBranchChange`, `onFeedback`, and `onShare` only when those operations are implemented.

All components use Svelte 5 runes and theme token utility classes. Import `styles.css` to register this package's class sources with Tailwind. Components accept data-only messages from `@protoyard/ai`; no credentials, provider SDKs, generated models or external network calls are included.
