import type { Flow } from './flow.ts';

/*
 * Starting points for common workflows. Each recipe is fixed data (no clock,
 * no randomness), uses fictional names, and parses with no errors; tests hold
 * every recipe to that.
 */

export interface FlowRecipe {
  id: string;
  title: string;
  summary: string;
  build(overrides?: { id?: string; name?: string }): Flow;
}

const team = [{ type: 'team' as const, id: 'team', name: 'The team' }];
const leads = [{ type: 'role' as const, id: 'lead', name: 'Team leads' }];

function recipe(
  id: string,
  title: string,
  summary: string,
  flow: Omit<Flow, 'formatVersion' | 'id' | 'name' | 'status'>
): FlowRecipe {
  return {
    id,
    title,
    summary,
    build: (overrides = {}) => ({
      formatVersion: 1,
      id: overrides.id ?? id,
      name: overrides.name ?? title,
      status: 'draft',
      ...structuredClone(flow),
    }),
  };
}

export const FLOW_RECIPES: readonly FlowRecipe[] = [
  recipe(
    'daily-check-in',
    'Daily check-in',
    'Ask the team three questions each workday and share a summary.',
    {
      triggers: [
        {
          id: 'weekday-morning',
          type: 'schedule',
          days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
          time: '09:30',
          timezone: 'local',
        },
      ],
      steps: [
        {
          id: 'ask-team',
          type: 'ask',
          audience: team,
          questions: [
            { id: 'done', kind: 'text', prompt: 'What did you finish yesterday?', required: true },
            { id: 'next', kind: 'text', prompt: 'What are you working on today?', required: true },
            { id: 'blocked', kind: 'boolean', prompt: 'Is anything blocking you?' },
          ],
          deadlineMinutes: 240,
        },
        {
          id: 'summarize',
          type: 'assistant',
          task: 'summarize',
          input: { from: 'step', stepId: 'ask-team' },
        },
        {
          id: 'share-summary',
          type: 'message',
          channel: 'chat',
          to: team,
          text: ['Today’s check-in: ', { ref: { from: 'step', stepId: 'summarize' } }],
        },
      ],
    }
  ),
  recipe(
    'approval-request',
    'Approval request',
    'Collect a request, route it to an approver and tell the requester.',
    {
      triggers: [
        { id: 'request', type: 'manual', label: 'New request', surfaces: ['app', 'link'] },
      ],
      collections: [
        {
          id: 'requests',
          noun: 'request',
          plural: 'requests',
          states: [
            { id: 'pending', label: 'Pending' },
            { id: 'approved', label: 'Approved', final: true },
            { id: 'declined', label: 'Declined', final: true },
          ],
        },
      ],
      steps: [
        {
          id: 'save-request',
          type: 'save_record',
          collection: 'requests',
          title: [{ ref: { from: 'trigger', path: ['summary'] } }],
          state: 'pending',
        },
        {
          id: 'approve',
          type: 'approval',
          approvers: leads,
          prompt: ['Approve this request? ', { ref: { from: 'trigger', path: ['summary'] } }],
        },
        {
          id: 'decide',
          type: 'branch',
          when: {
            type: 'compare',
            left: { ref: { from: 'step', stepId: 'approve', path: ['decision'] } },
            op: 'eq',
            right: { value: 'approved' },
          },
          // biome-ignore lint/suspicious/noThenProperty: a branch arm, not a thenable
          then: [
            { id: 'mark-approved', type: 'set_state', state: 'approved' },
            { id: 'tell-approved', type: 'reply', text: 'Your request was approved.' },
          ],
          otherwise: [
            { id: 'mark-declined', type: 'set_state', state: 'declined' },
            { id: 'tell-declined', type: 'reply', text: 'Your request was declined.' },
          ],
        },
      ],
    }
  ),
  recipe(
    'incoming-triage',
    'Incoming triage',
    'Classify each new record and alert the team about urgent ones.',
    {
      triggers: [{ id: 'new-record', type: 'event', event: 'record.created', source: 'records' }],
      collections: [
        {
          id: 'tickets',
          noun: 'ticket',
          plural: 'tickets',
          states: [
            { id: 'new', label: 'New' },
            { id: 'urgent', label: 'Urgent' },
            { id: 'closed', label: 'Closed', final: true },
          ],
        },
      ],
      steps: [
        {
          id: 'classify',
          type: 'assistant',
          task: 'classify',
          input: { from: 'record', path: ['body'] },
          labels: ['urgent', 'normal', 'spam'],
        },
        {
          id: 'urgent',
          type: 'branch',
          when: {
            type: 'any',
            conditions: [
              {
                type: 'compare',
                left: { ref: { from: 'step', stepId: 'classify', path: ['label'] } },
                op: 'eq',
                right: { value: 'urgent' },
              },
              { type: 'judge', phrase: 'the customer cannot work at all' },
            ],
          },
          // biome-ignore lint/suspicious/noThenProperty: a branch arm, not a thenable
          then: [
            { id: 'mark-urgent', type: 'set_state', state: 'urgent' },
            {
              id: 'alert-team',
              type: 'message',
              channel: 'notification',
              to: team,
              text: ['Urgent: ', { ref: { from: 'record', path: ['title'] } }],
            },
          ],
          otherwise: [],
        },
      ],
    }
  ),
  recipe(
    'weekly-digest',
    'Weekly digest',
    'Every Friday, gather the week’s records and send a digest by email.',
    {
      triggers: [
        { id: 'friday', type: 'schedule', days: ['friday'], time: '16:00', timezone: 'local' },
      ],
      collections: [{ id: 'updates', noun: 'update', states: [] }],
      steps: [
        { id: 'gather', type: 'get_records', collection: 'updates', sinceDays: 7, limit: 100 },
        {
          id: 'any-updates',
          type: 'branch',
          when: { type: 'test', subject: { from: 'step', stepId: 'gather' }, test: 'not_empty' },
          // biome-ignore lint/suspicious/noThenProperty: a branch arm, not a thenable
          then: [
            {
              id: 'digest',
              type: 'assistant',
              task: 'summarize',
              input: { from: 'step', stepId: 'gather' },
            },
            {
              id: 'send-digest',
              type: 'message',
              channel: 'email',
              to: leads,
              subject: 'Weekly digest',
              text: [{ ref: { from: 'step', stepId: 'digest' } }],
            },
          ],
          otherwise: [],
        },
      ],
    }
  ),
  recipe(
    'rotating-host',
    'Rotating host',
    'Each Monday, pick the next host from a list and announce it.',
    {
      triggers: [
        { id: 'monday', type: 'schedule', days: ['monday'], time: '10:00', timezone: 'local' },
      ],
      lists: [{ id: 'hosts', name: 'Hosts', items: ['Ada Example', 'Lin Example', 'Sam Example'] }],
      steps: [
        { id: 'pick-host', type: 'pick_from_list', list: 'hosts', order: 'next_unused' },
        {
          id: 'announce',
          type: 'message',
          channel: 'chat',
          to: team,
          text: ['This week’s host is ', { ref: { from: 'step', stepId: 'pick-host' } }, '.'],
        },
      ],
    }
  ),
];

export function findRecipe(id: string): FlowRecipe | undefined {
  return FLOW_RECIPES.find((r) => r.id === id);
}
