import { conditionRefs } from './conditions.ts';
import type { Flow } from './flow.ts';
import type { DataRef } from './refs.ts';
import { isStepEnabled, type Step } from './steps.ts';
import { textRefs } from './text.ts';
import { formatPath, listSteps, type PathSegment, runsBefore, type StepLocation } from './walk.ts';

export type FlowDiagnosticCode =
  | 'not_plain_data'
  | 'schema'
  | 'duplicate_id'
  | 'unknown_step_ref'
  | 'ref_not_before'
  | 'record_ref_without_collection'
  | 'unknown_collection'
  | 'unknown_state'
  | 'unknown_list'
  | 'choice_without_options'
  | 'options_on_non_choice'
  | 'missing_wait_detail'
  | 'empty_branch'
  | 'starts_itself'
  | 'nothing_to_run';

export interface FlowDiagnostic {
  severity: 'error' | 'warning';
  code: FlowDiagnosticCode;
  /** Where it applies: `steps[0].then[1].only`, `triggers[0]` or `$`. */
  path: string;
  message: string;
  stepId?: string;
}

/** Every reference a step reads, with where it sits inside the step. */
function stepRefs(step: Step): { ref: DataRef; at: PathSegment[] }[] {
  const out: { ref: DataRef; at: PathSegment[] }[] = [];
  const add = (refs: DataRef[], at: PathSegment[]) => {
    for (const ref of refs) out.push({ ref, at });
  };
  if (step.only) add(conditionRefs(step.only), ['only']);
  switch (step.type) {
    case 'branch':
      add(conditionRefs(step.when), ['when']);
      break;
    case 'approval':
      add(textRefs(step.prompt), ['prompt']);
      break;
    case 'message':
    case 'reply':
      add(textRefs(step.text), ['text']);
      break;
    case 'assistant':
      if (step.input) add([step.input], ['input']);
      add(textRefs(step.instructions), ['instructions']);
      break;
    case 'save_record':
      add(textRefs(step.title), ['title']);
      for (const [field, value] of Object.entries(step.fields ?? {}))
        add(textRefs(value), ['fields', field]);
      break;
    case 'update_list':
      add(textRefs(step.value), ['value']);
      break;
    case 'call_tool':
      for (const [field, value] of Object.entries(step.input ?? {}))
        add(textRefs(value), ['input', field]);
      break;
    default:
      break;
  }
  return out;
}

function duplicates(ids: readonly string[]): Set<string> {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const id of ids) (seen.has(id) ? dup : seen).add(id);
  return dup;
}

/**
 * The semantic checks a schema cannot express: unique ids, references that
 * point at steps which have certainly run, collections, states and lists that
 * exist, and shapes that parse but cannot work. Pure and deterministic; the
 * result is ordered by where each problem sits.
 */
export function validateFlow(flow: Flow): FlowDiagnostic[] {
  const out: FlowDiagnostic[] = [];
  const push = (d: FlowDiagnostic) => out.push(d);
  const all = listSteps(flow.steps);
  const order = new Map<string, number>();
  const byId = new Map<string, StepLocation>();
  for (const [i, location] of all.entries()) {
    if (!order.has(location.step.id)) order.set(location.step.id, i);
    if (!byId.has(location.step.id)) byId.set(location.step.id, location);
  }

  const dupSteps = duplicates(all.map((l) => l.step.id));
  const reported = new Set<string>();
  for (const location of all) {
    if (dupSteps.has(location.step.id) && reported.has(location.step.id)) {
      push({
        severity: 'error',
        code: 'duplicate_id',
        path: formatPath(location.path),
        stepId: location.step.id,
        message: `Another step already uses the id "${location.step.id}"`,
      });
    }
    reported.add(location.step.id);
  }
  for (const id of duplicates(flow.triggers.map((t) => t.id))) {
    const index = flow.triggers.findLastIndex((t) => t.id === id);
    push({
      severity: 'error',
      code: 'duplicate_id',
      path: `triggers[${index}]`,
      message: `Another start already uses the id "${id}"`,
    });
  }
  for (const [key, list] of [
    ['collections', flow.collections ?? []],
    ['lists', flow.lists ?? []],
  ] as const) {
    for (const id of duplicates(list.map((item) => item.id))) {
      const index = list.findLastIndex((item) => item.id === id);
      push({
        severity: 'error',
        code: 'duplicate_id',
        path: `${key}[${index}]`,
        message: `The id "${id}" is used twice`,
      });
    }
  }

  const collections = new Map((flow.collections ?? []).map((c) => [c.id, c]));
  const states = new Set((flow.collections ?? []).flatMap((c) => c.states.map((s) => s.id)));
  const lists = new Set((flow.lists ?? []).map((l) => l.id));
  const recordTrigger = flow.triggers.some((t) => t.type === 'event' && t.source === 'records');

  for (const location of all) {
    const { step } = location;
    const at = (...rest: PathSegment[]) => formatPath([...location.path, ...rest]);
    const stepDiag = (
      severity: FlowDiagnostic['severity'],
      code: FlowDiagnosticCode,
      path: string,
      message: string
    ) => push({ severity, code, path, message, stepId: step.id });

    for (const { ref, at: inner } of stepRefs(step)) {
      if (ref.from === 'step') {
        const source = byId.get(ref.stepId);
        if (!source) {
          stepDiag('error', 'unknown_step_ref', at(...inner), `No step has the id "${ref.stepId}"`);
        } else if (!runsBefore(source, location, order)) {
          stepDiag(
            'error',
            'ref_not_before',
            at(...inner),
            `Step "${ref.stepId}" has not certainly run before this step`
          );
        }
      } else if (ref.from === 'record' && collections.size === 0 && !recordTrigger) {
        stepDiag(
          'warning',
          'record_ref_without_collection',
          at(...inner),
          'This reads a record, but the flow keeps no records'
        );
      }
    }

    switch (step.type) {
      case 'ask':
        for (const [i, question] of step.questions.entries()) {
          if (question.kind === 'choice' && (question.choices?.length ?? 0) < 2) {
            stepDiag(
              'error',
              'choice_without_options',
              at('questions', i),
              'A choice question needs at least two options'
            );
          }
          if (question.kind !== 'choice' && question.choices?.length) {
            stepDiag(
              'warning',
              'options_on_non_choice',
              at('questions', i, 'choices'),
              'Options only apply to choice questions'
            );
          }
        }
        for (const id of duplicates(step.questions.map((q) => q.id))) {
          stepDiag('error', 'duplicate_id', at('questions'), `Two questions use the id "${id}"`);
        }
        break;
      case 'save_record':
      case 'get_records':
        if (!collections.has(step.collection)) {
          stepDiag(
            'error',
            'unknown_collection',
            at('collection'),
            `No collection has the id "${step.collection}"`
          );
        } else if (step.type === 'save_record' && step.state) {
          const known = collections.get(step.collection)?.states.some((s) => s.id === step.state);
          if (!known)
            stepDiag(
              'error',
              'unknown_state',
              at('state'),
              `"${step.collection}" has no state "${step.state}"`
            );
        }
        break;
      case 'set_state':
        if (!states.has(step.state)) {
          stepDiag(
            'error',
            'unknown_state',
            at('state'),
            `No collection has the state "${step.state}"`
          );
        }
        break;
      case 'pick_from_list':
      case 'update_list':
        if (!lists.has(step.list)) {
          stepDiag('error', 'unknown_list', at('list'), `No list has the id "${step.list}"`);
        }
        break;
      case 'wait_until':
        if (step.until === 'time' && !step.time) {
          stepDiag('error', 'missing_wait_detail', at('time'), 'Choose the time to wait for');
        }
        if (step.until === 'event' && !step.event) {
          stepDiag('error', 'missing_wait_detail', at('event'), 'Choose the event to wait for');
        }
        break;
      case 'branch':
        if (step.then.length === 0 && step.otherwise.length === 0) {
          stepDiag('warning', 'empty_branch', at(), 'Neither side of this branch does anything');
        }
        break;
      case 'start_flow':
        if (step.flowId === flow.id) {
          stepDiag(
            'warning',
            'starts_itself',
            at('flowId'),
            'This flow starts itself; runs may repeat'
          );
        }
        break;
      default:
        break;
    }
  }

  if (flow.status === 'active' && !all.some((l) => isStepEnabled(l.step))) {
    push({
      severity: 'warning',
      code: 'nothing_to_run',
      path: 'steps',
      message: 'An active flow has no enabled step',
    });
  }
  return out;
}

/** Diagnostics grouped by step id (`$flow` for the ones that belong to no step). */
export function diagnosticsByStep(
  diagnostics: readonly FlowDiagnostic[]
): Record<string, FlowDiagnostic[]> {
  const map: Record<string, FlowDiagnostic[]> = {};
  for (const d of diagnostics) {
    const key = d.stepId ?? '$flow';
    map[key] = [...(map[key] ?? []), d];
  }
  return map;
}
