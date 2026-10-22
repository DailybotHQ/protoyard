/**
 * Tour session controller.
 *
 * Owns step progression and dismissal. Clock moves are requested through the
 * optional `onClockAdvance` hook so the host can call
 * `runtime.scenarios.advance` (or a test double) without the tour touching
 * the simulation clock.
 */

import {
  type ClockAdvanceRequest,
  initialTourState,
  parseTourDefinition,
  resolveTourTarget,
  stepDay,
  type TourDefinition,
  type TourState,
  type TourStep,
} from './model.ts';

export type TourTargetResolver = (selector: string) => Element | null;
export type TourClockHandler = (request: ClockAdvanceRequest) => void | Promise<void>;

export interface TourControllerOptions {
  /**
   * Fulfills a positive day advance. Required for steps that declare a higher
   * `day` than the previous step; omitted handlers leave the request on
   * `lastClockRequest` for the host to drain.
   */
  onClockAdvance?: TourClockHandler;
  /**
   * Looks up a step target. Defaults to `document.querySelector` with a
   * try/catch that returns null on any failure.
   */
  resolveTarget?: TourTargetResolver;
  /** DOM root for the default resolver (defaults to `document`). */
  root?: ParentNode | null;
}

export interface TourController {
  readonly definition: TourDefinition;
  /** Current snapshot (immutable). */
  getState(): TourState;
  /** The active step, or `null` when idle/dismissed/completed. */
  currentStep(): TourStep | null;
  /**
   * Highlight target for the current step. Always safe: returns `null` when
   * the step has no target, the selector is invalid, or the element is gone.
   */
  currentTarget(): Element | null;
  /**
   * Last clock request produced by `start`/`next`/`goTo`. Cleared after a
   * successful handler run, or when the host calls `clearClockRequest`.
   */
  lastClockRequest(): ClockAdvanceRequest | null;
  clearClockRequest(): void;
  /** Begin at step 0 (runs any day-0→step0 advance). No-op when already active. */
  start(): Promise<TourState>;
  /** Move one step forward; completes after the last step. */
  next(): Promise<TourState>;
  /**
   * Move one step backward. Never reverses the clock — story day stays at the
   * highest day reached so a later `next` only advances the remaining delta.
   */
  back(): TourState;
  /** Jump to a step index (forward may advance the clock; backward never does). */
  goTo(index: number): Promise<TourState>;
  /** Leave the tour without completing it. */
  dismiss(): TourState;
  /** Return to idle and clear story progress (clock is the host's concern). */
  reset(): TourState;
  subscribe(listener: (state: TourState) => void): () => void;
}

/**
 * Create a deterministic tour session from a definition. The definition is
 * validated once up front.
 */
export function createTourController(
  input: TourDefinition,
  options: TourControllerOptions = {}
): TourController {
  const definition = parseTourDefinition(input);
  let state: TourState = initialTourState(definition.id);
  let pendingRequest: ClockAdvanceRequest | null = null;
  const listeners = new Set<(state: TourState) => void>();

  const resolveTarget: TourTargetResolver =
    options.resolveTarget ?? ((selector) => resolveTourTarget(selector, options.root ?? undefined));

  const emit = () => {
    const snapshot = { ...state };
    for (const listener of listeners) listener(snapshot);
  };

  const setState = (next: TourState) => {
    state = next;
    emit();
    return state;
  };

  const applyIndex = async (toIndex: number): Promise<TourState> => {
    if (toIndex < 0 || toIndex >= definition.steps.length) {
      throw new RangeError(`Tour step index out of range: ${toIndex}`);
    }
    const toDay = stepDay(definition.steps, toIndex);
    const fromDay = state.storyDay;
    const days = toDay - fromDay;
    const step = definition.steps[toIndex];
    // Clock requests follow the highest day already reached, so Back then Next
    // does not re-advance time. Step-index helpers remain available for hosts
    // that compute deltas without a live session (`clockRequestForAdvance`).
    const request: ClockAdvanceRequest | null =
      days > 0 && step
        ? {
            days,
            fromDay,
            toDay,
            stepId: step.id,
            tourId: definition.id,
          }
        : null;
    if (request) {
      pendingRequest = request;
      if (options.onClockAdvance) {
        await options.onClockAdvance(request);
        pendingRequest = null;
      }
    } else {
      pendingRequest = null;
    }
    const day = Math.max(state.storyDay, toDay);
    return setState({
      tourId: definition.id,
      status: 'active',
      stepIndex: toIndex,
      storyDay: day,
    });
  };
  return {
    definition,
    getState: () => ({ ...state }),
    currentStep() {
      if (state.status !== 'active' || state.stepIndex < 0) return null;
      return definition.steps[state.stepIndex] ?? null;
    },
    currentTarget() {
      const step = this.currentStep();
      if (!step?.target) return null;
      return resolveTarget(step.target);
    },
    lastClockRequest: () => pendingRequest,
    clearClockRequest() {
      pendingRequest = null;
    },
    async start() {
      if (state.status === 'active') return this.getState();
      pendingRequest = null;
      return applyIndex(0);
    },
    async next() {
      if (state.status === 'dismissed') {
        throw new Error('Tour was dismissed. Call reset() before starting again.');
      }
      if (state.status === 'idle') return this.start();
      if (state.status === 'completed') return this.getState();
      const nextIndex = state.stepIndex + 1;
      if (nextIndex >= definition.steps.length) {
        return setState({
          ...state,
          status: 'completed',
          stepIndex: definition.steps.length - 1,
        });
      }
      return applyIndex(nextIndex);
    },
    back() {
      if (state.status !== 'active' || state.stepIndex <= 0) return this.getState();
      // Story day stays put: time only moves forward through public APIs.
      return setState({
        ...state,
        stepIndex: state.stepIndex - 1,
        status: 'active',
      });
    },
    async goTo(index) {
      if (state.status === 'dismissed') {
        throw new Error('Tour was dismissed. Call reset() before starting again.');
      }
      if (index < 0 || index >= definition.steps.length) {
        throw new RangeError(`Tour step index out of range: ${index}`);
      }
      if (state.status === 'idle' || state.stepIndex < 0) {
        // Start then walk forward so each intermediate day request still fires
        // only for the net delta (clockRequestForAdvance uses fromIndex).
        await applyIndex(0);
        if (index === 0) return this.getState();
      }
      if (index === state.stepIndex) return this.getState();
      if (index < state.stepIndex) {
        return setState({
          ...state,
          stepIndex: index,
          status: 'active',
        });
      }
      return applyIndex(index);
    },
    dismiss() {
      pendingRequest = null;
      return setState({
        tourId: definition.id,
        status: 'dismissed',
        stepIndex: -1,
        storyDay: state.storyDay,
      });
    },
    reset() {
      pendingRequest = null;
      return setState(initialTourState(definition.id));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/**
 * Build an `onClockAdvance` handler that calls the runtime scenario controller.
 * The tour never imports runtime types; the host passes a narrow advance fn.
 */
export function createScenarioClockHandler(
  advance: (duration: { days: number }) => Promise<unknown> | unknown
): TourClockHandler {
  return async (request) => {
    if (!(request.days > 0)) return;
    await advance({ days: request.days });
  };
}
