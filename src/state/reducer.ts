/**
 * reducer.ts — State management reducer for the Formal Language Laboratory.
 *
 * Pure function: (state, action) → newState
 * Handles all state transitions for the application.
 */

import type {
  AutomataState,
  PipelineStage,
  AppMode,
  NFA,
  DFA,
  MinDFA,
  ParseError,
  StateId,
  EquivalenceResult,
  TestTraceResult,
} from '../types/automata';

// ═══════════════════════════════════════════════════════════
// Action Types
// ═══════════════════════════════════════════════════════════

export type AutomataAction =
  | { type: 'SET_REGEX_A'; payload: string }
  | { type: 'SET_REGEX_B'; payload: string }
  | { type: 'SET_STAGE'; payload: PipelineStage }
  | { type: 'SET_MODE'; payload: AppMode }
  | {
      type: 'PIPELINE_COMPLETE';
      payload: {
        pipeline: { nfa: NFA | null; dfa: DFA | null; minDfa: MinDFA | null };
        which: 'A' | 'B';
      };
    }
  | { type: 'SET_PARSE_ERRORS'; payload: { errors: ParseError[]; which: 'A' | 'B' } }
  | { type: 'SET_HIGHLIGHTED'; payload: Set<StateId> }
  | { type: 'SET_TEST_STRING'; payload: string }
  | { type: 'SET_TEST_TRACE'; payload: TestTraceResult }
  | { type: 'RESET_TEST' }
  | { type: 'SET_EQUIVALENCE'; payload: EquivalenceResult | null };

// ═══════════════════════════════════════════════════════════
// Initial State
// ═══════════════════════════════════════════════════════════

export const initialState: AutomataState = {
  regexA: '',
  regexB: '',
  mode: 'single',
  pipeline: { nfa: null, dfa: null, minDfa: null },
  pipelineB: null,
  activeStage: 'nfa',
  highlightedStates: new Set(),
  equivalenceResult: null,
  testString: '',
  testResult: { kind: 'idle' },
  testStatus: 'idle',
  parseErrors: [],
  parseErrorsB: [],
};

// ═══════════════════════════════════════════════════════════
// Reducer
// ═══════════════════════════════════════════════════════════

/**
 * Pure reducer function.
 *
 * @param state - Current application state.
 * @param action - Dispatched action.
 * @returns New state (immutable update).
 */
export function automataReducer(
  state: AutomataState,
  action: AutomataAction
): AutomataState {
  switch (action.type) {
    case 'SET_REGEX_A':
      return {
        ...state,
        regexA: action.payload,
        testStatus: 'idle',
        testResult: { kind: 'idle' } as TestTraceResult,
        equivalenceResult: null,
      };

    case 'SET_REGEX_B':
      return {
        ...state,
        regexB: action.payload,
        testStatus: 'idle',
        testResult: { kind: 'idle' } as TestTraceResult,
        equivalenceResult: null,
      };

    case 'SET_STAGE':
      return {
        ...state,
        activeStage: action.payload,
        highlightedStates: new Set(),
      };

    case 'SET_MODE':
      return {
        ...state,
        mode: action.payload,
        pipelineB: action.payload === 'comparison' ? { nfa: null, dfa: null, minDfa: null } : null,
        equivalenceResult: null,
        highlightedStates: new Set(),
      };

    case 'PIPELINE_COMPLETE':
      if (action.payload.which === 'A') {
        return {
          ...state,
          pipeline: action.payload.pipeline,
        };
      } else {
        return {
          ...state,
          pipelineB: action.payload.pipeline,
        };
      }

    case 'SET_PARSE_ERRORS':
      if (action.payload.which === 'A') {
        return { ...state, parseErrors: action.payload.errors };
      } else {
        return { ...state, parseErrorsB: action.payload.errors };
      }

    case 'SET_HIGHLIGHTED':
      return { ...state, highlightedStates: action.payload };

    case 'SET_TEST_STRING':
      return {
        ...state,
        testString: action.payload,
        testStatus: 'idle',
        testResult: { kind: 'idle' } as TestTraceResult,
      };

    case 'SET_TEST_TRACE': {
      const result = action.payload;
      const accepted = result.kind !== 'idle' ? result.accepted : false;
      return {
        ...state,
        testResult: result,
        testStatus: accepted ? 'accepted' : 'rejected',
      };
    }

    case 'RESET_TEST':
      return {
        ...state,
        testString: '',
        testResult: { kind: 'idle' } as TestTraceResult,
        testStatus: 'idle',
      };

    case 'SET_EQUIVALENCE':
      return {
        ...state,
        equivalenceResult: action.payload,
      };

    default:
      return state;
  }
}
