import { AI_MODELS, type ApprovalActor, type Suggestion } from '@protoyard/ai';
import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { areaLabel, auditActionLabel, autonomyLevelLabel } from '../src/approvals/labels.ts';
import SuggestionCard from '../src/approvals/SuggestionCard.svelte';
import AssistantComposer from '../src/components/AssistantComposer.svelte';
import AssistantWorkspace from '../src/components/AssistantWorkspace.svelte';
import RichAnswer from '../src/components/RichAnswer.svelte';
import MessageList from '../src/MessageList.svelte';
import VoiceMode from '../src/voice/VoiceMode.svelte';
import AssistantWidget from '../src/widget/AssistantWidget.svelte';
import WithLabels from './fixtures/WithLabels.svelte';

afterEach(cleanup);

const viewer: ApprovalActor = { id: 'person_oscar', canApprove: false };
const suggestion: Suggestion = {
  id: 'approval_sug_resp_1',
  scopeId: 'org_example',
  kind: 'link_record',
  action: 'apply',
  area: 'records',
  subjectId: viewer.id,
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
};

describe('ai-ui labels (UG-11)', () => {
  it('composer: model options, input and send through the dictionary', async () => {
    render(WithLabels, {
      props: {
        component: AssistantComposer,
        props: { onSubmit: vi.fn(), onModelChange: vi.fn() },
        labels: {
          'protoyard.ai.composer.model-option': '{name} · Simulado',
          'protoyard.ai.composer.input': 'Escribe al asistente simulado',
          'protoyard.ai.composer.send': 'Enviar mensaje',
          'protoyard.ai.composer.model': 'Modelo simulado',
        },
      },
    });
    expect(screen.getByRole('textbox', { name: 'Escribe al asistente simulado' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Enviar mensaje' })).toBeTruthy();
    const trigger = screen.getByRole('combobox', { name: 'Modelo simulado' });
    expect(trigger.textContent).toContain(`${AI_MODELS[0]?.name} · Simulado`);
  });

  it('message list: empty text and message names through the dictionary', () => {
    const view = render(WithLabels, {
      props: {
        component: MessageList,
        props: { messages: [], conversationId: 'conv_labels' },
        labels: {
          'protoyard.ai.message-list.empty': 'Aún no hay mensajes.',
          'protoyard.ai.message-list.label': 'Mensajes de la conversación',
        },
      },
    });
    expect(view.getByText('Aún no hay mensajes.')).toBeTruthy();
  });

  it('approvals: card actions and helper labels through the dictionary', () => {
    const view = render(WithLabels, {
      props: {
        component: SuggestionCard,
        props: { suggestion, viewer, onConfirm: vi.fn(), onDismiss: vi.fn() },
        labels: {
          'protoyard.ai.approval.confirm': 'Confirmar',
          'protoyard.ai.approval.dismiss': 'Descartar',
          'protoyard.ai.suggestion.status.pending': 'En espera',
        },
      },
    });
    expect(view.getByRole('button', { name: 'Confirmar' })).toBeTruthy();
    expect(view.getByRole('button', { name: 'Descartar' })).toBeTruthy();
    expect(view.getByText('En espera')).toBeTruthy();

    const es = (id: string, english: string) =>
      ({
        'protoyard.ai.autonomy.level-2.name': 'Sugerir',
        'protoyard.ai.audit.auto-handled': 'Gestionado automáticamente',
        'protoyard.ai.autonomy.area.records': 'Registros',
      })[id] ?? english;
    expect(autonomyLevelLabel(2, es).name).toBe('Sugerir');
    expect(autonomyLevelLabel(3).name).toBe('Act with approval');
    expect(auditActionLabel('auto_handled', es)).toBe('Gestionado automáticamente');
    expect(areaLabel('records', es)).toBe('Registros');
    expect(areaLabel('custom-area', es)).toBe('custom-area');
  });

  it('rich answer and widget: labels through the dictionary', () => {
    const answer = render(WithLabels, {
      props: {
        component: RichAnswer,
        props: { content: 'Hello' },
        labels: { 'protoyard.ai.rich-answer.label': 'Respuesta del asistente' },
      },
    });
    expect(answer.container.querySelector('[aria-label="Respuesta del asistente"]')).toBeTruthy();
    cleanup();
    render(WithLabels, {
      props: {
        component: AssistantWidget,
        props: { prototypeId: 'labels-demo', onSend: vi.fn() },
        labels: { 'protoyard.ai.widget.open': 'Abrir asistente simulado' },
      },
    });
    expect(screen.getByRole('button', { name: 'Abrir asistente simulado' })).toBeTruthy();
  });

  it('workspace and voice: labels through the dictionary', () => {
    const workspace = render(WithLabels, {
      props: {
        component: AssistantWorkspace,
        props: { conversations: [], messages: [], onSend: vi.fn() },
        labels: {
          'protoyard.ai.workspace.empty-title': '¿Qué quieres explorar?',
          'protoyard.ai.workspace.suggestion-1': 'Ayúdame a convertir una idea en un plan',
        },
      },
    });
    expect(workspace.getByText('¿Qué quieres explorar?')).toBeTruthy();
    expect(workspace.getByText('Ayúdame a convertir una idea en un plan')).toBeTruthy();
    cleanup();
    render(WithLabels, {
      props: {
        component: VoiceMode,
        props: { clock: { now: () => new Date(0), nowMs: () => 0, sleep: async () => {} } },
        labels: { 'protoyard.ai.voice.push-to-talk': 'Pulsar para hablar' },
      },
    });
    expect(screen.getByRole('button', { name: 'Pulsar para hablar' })).toBeTruthy();
  });
});
