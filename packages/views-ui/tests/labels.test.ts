import { PermissionDeniedError, SimulatedServiceError } from '@protoyard/core';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CommentThread from '../src/activity/CommentThread.svelte';
import NotificationCenter from '../src/notifications/NotificationCenter.svelte';
import { classifyQueryError } from '../src/states/classify.ts';
import QueryState from '../src/states/QueryState.svelte';
import WithLabels from './fixtures/WithLabels.svelte';

afterEach(cleanup);

const children = createRawSnippet(() => ({ render: () => '<p>data</p>' }));

describe('views-ui labels (UG-05)', () => {
  it('classifyQueryError keeps English and takes a message lookup', () => {
    const offline = new SimulatedServiceError('offline', 'deals.list');
    expect(classifyQueryError(offline).title).toBe("You're offline");
    const denied = classifyQueryError(new PermissionDeniedError('deals:read', 'viewer'));
    expect(denied.message).toContain('(deals:read)');
    const spanish = classifyQueryError(offline, (id, english) =>
      id === 'protoyard.views.query-state.offline-title' ? 'Sin conexión' : english
    );
    expect(spanish).toMatchObject({ kind: 'offline', title: 'Sin conexión', retryable: true });
  });

  it('QueryState shows an offline error in the dictionary language', () => {
    const view = render(WithLabels, {
      props: {
        component: QueryState,
        props: {
          query: {
            current: undefined,
            loading: false,
            error: new SimulatedServiceError('offline', 'x'),
          },
          label: 'Loading deals',
          children,
        },
        labels: {
          'protoyard.views.query-state.offline-title': 'Sin conexión',
          'protoyard.views.query-state.offline-message': 'La red simulada está apagada.',
        },
      },
    });
    expect(view.getByText('Sin conexión')).toBeTruthy();
    expect(view.getByText('La red simulada está apagada.')).toBeTruthy();
  });

  it('NotificationCenter forwards dictionary labels to its trigger and the inbox', async () => {
    const view = render(WithLabels, {
      props: {
        component: NotificationCenter,
        props: {
          query: {
            current: [
              {
                id: 'n1',
                kind: 'mention',
                title: 'Ada mentioned you',
                subjectId: 'd1',
                readAt: null,
                at: '2026-03-02T09:00:00Z',
              },
            ],
            loading: false,
            error: undefined,
          },
          onMarkRead: vi.fn(),
          onMarkAllRead: vi.fn(),
          now: '2026-03-02T10:00:00Z',
          labels: { all: 'Todas' },
        },
        labels: {
          'protoyard.views.notification-center.label': 'Notificaciones',
          'protoyard.views.notification-center.unread-trigger': '{count} sin leer, {label}',
          'protoyard.views.notification-center.inbox.mark-all-read': 'Marcar todo como leído',
        },
      },
    });
    const trigger = view.getByRole('button', { name: '1 sin leer, Notificaciones' });
    await fireEvent.click(trigger);
    await waitFor(() =>
      expect(view.getByRole('button', { name: 'Marcar todo como leído' })).toBeTruthy()
    );
    // A `labels` prop entry wins over the dictionary.
    expect(view.getByText('Todas')).toBeTruthy();
  });

  it('CommentThread speaks the dictionary language', () => {
    const view = render(WithLabels, {
      props: {
        component: CommentThread,
        props: {
          query: { current: [], loading: false, error: undefined },
          people: [{ id: 'p1', name: 'Ada Example' }],
          currentUserId: 'p1',
          onSend: vi.fn(),
          now: '2026-03-02T10:00:00Z',
        },
        labels: {
          'protoyard.views.comment-thread.label': 'Comentarios',
          'protoyard.views.comment-thread.empty': 'Aún no hay comentarios.',
          'protoyard.views.composer.submit': 'Comentar',
        },
      },
    });
    expect(view.getByRole('region', { name: 'Comentarios' })).toBeTruthy();
    expect(view.getByText('Aún no hay comentarios.')).toBeTruthy();
    expect(view.getByRole('button', { name: 'Comentar' })).toBeTruthy();
  });
});
