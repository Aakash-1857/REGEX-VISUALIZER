/**
 * usePipeline.ts — Reactive pipeline hook.
 *
 * Watches regexA/regexB and runs the full pipeline:
 *   parse → toNFA → toDFA → minimize
 *
 * Dispatches PIPELINE_COMPLETE and SET_PARSE_ERRORS.
 * Debounced at 300ms to avoid excessive recomputation while typing.
 */

import { useEffect, useRef } from 'react';
import { useAutomata } from './useAutomata';
import { parse } from '../logic/RegexParser';
import { toNFA, toDFA, minimize, validateDFAInvariant } from '../logic/AutomataEngine';
import { checkEquivalence } from '../logic/EquivalenceChecker';

/**
 * Hook that automatically runs the automata pipeline when regex inputs change.
 * Must be called inside an AutomataProvider.
 */
export function usePipeline(): void {
  const { state, dispatch } = useAutomata();
  const timerA = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timerB = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Pipeline A: react to regexA changes ──
  useEffect(() => {
    if (timerA.current) clearTimeout(timerA.current);

    timerA.current = setTimeout(() => {
      runPipeline(state.regexA, 'A');
    }, 300);

    return () => {
      if (timerA.current) clearTimeout(timerA.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.regexA]);

  // ── Pipeline B: react to regexB changes (comparison mode only) ──
  useEffect(() => {
    if (state.mode !== 'comparison') return;
    if (timerB.current) clearTimeout(timerB.current);

    timerB.current = setTimeout(() => {
      runPipeline(state.regexB, 'B');
    }, 300);

    return () => {
      if (timerB.current) clearTimeout(timerB.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.regexB, state.mode]);

  // ── Equivalence check: runs when both pipelines complete ──
  useEffect(() => {
    if (state.mode !== 'comparison') return;
    if (!state.pipeline.minDfa || !state.pipelineB?.minDfa) return;

    const result = checkEquivalence(state.pipeline.minDfa, state.pipelineB.minDfa);
    dispatch({ type: 'SET_EQUIVALENCE', payload: result });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.pipeline.minDfa, state.pipelineB?.minDfa, state.mode]);

  /**
   * Run the full pipeline for a given regex input.
   * parse → NFA → DFA → MinDFA, then dispatch results.
   */
  function runPipeline(regex: string, which: 'A' | 'B') {
    if (regex.trim() === '') {
      dispatch({
        type: 'PIPELINE_COMPLETE',
        payload: { pipeline: { nfa: null, dfa: null, minDfa: null }, which },
      });
      dispatch({ type: 'SET_PARSE_ERRORS', payload: { errors: [], which } });
      return;
    }

    const parseResult = parse(regex);

    dispatch({
      type: 'SET_PARSE_ERRORS',
      payload: { errors: parseResult.errors, which },
    });

    if (parseResult.ast === null) {
      dispatch({
        type: 'PIPELINE_COMPLETE',
        payload: { pipeline: { nfa: null, dfa: null, minDfa: null }, which },
      });
      return;
    }

    try {
      const nfa = toNFA(parseResult.ast);
      const dfa = toDFA(nfa);

      // ── Validation pass: verify 5-tuple invariants ──
      const dfaErrors = validateDFAInvariant(dfa);
      if (dfaErrors.length > 0) {
        console.warn(`[Pipeline ${which}] DFA validation failed:`, dfaErrors);
      }

      const minDfa = minimize(dfa);

      const minErrors = validateDFAInvariant(minDfa);
      if (minErrors.length > 0) {
        console.warn(`[Pipeline ${which}] MinDFA validation failed:`, minErrors);
      }

      dispatch({
        type: 'PIPELINE_COMPLETE',
        payload: { pipeline: { nfa, dfa, minDfa }, which },
      });
    } catch (err) {
      console.error(`Pipeline error (${which}):`, err);
      dispatch({
        type: 'PIPELINE_COMPLETE',
        payload: { pipeline: { nfa: null, dfa: null, minDfa: null }, which },
      });
    }
  }
}
