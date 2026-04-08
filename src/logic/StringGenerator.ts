/**
 * StringGenerator.ts — String simulation and generation for automata.
 *
 * Contains:
 * 1. simulateTrace — DFA step-by-step deterministic trace
 * 2. simulateNFATrace — NFA step-by-step nondeterministic trace (ε-closure)
 * 3. simulateAccepts — Quick DFA acceptance check
 * 4. generateAccepted — Breadth-limited BFS for accepted string samples
 * 5. generateRejected — BFS enumeration for rejected string samples
 *
 * ZERO React imports. Pure TypeScript.
 */

import type { NFA, MinDFA, StateId, TestTraceResult } from '../types/automata';
import { epsilonClosure } from './AutomataEngine';

// ═══════════════════════════════════════════════════════════
// §1. DFA Simulation (deterministic trace)
// ═══════════════════════════════════════════════════════════

/**
 * Simulate a string step-by-step on a DFA, returning the trace of states visited.
 *
 * Each step consumes one input symbol and follows δ(q, a) → q'.
 * The trace includes the start state as the first element.
 *
 * @param dfa - The DFA (or MinDFA).
 * @param input - The string to simulate.
 * @returns TestTraceResult with kind 'dfa'.
 */
export function simulateTrace(
  dfa: { transitions: Map<StateId, Map<string, StateId>>; startState: StateId; acceptStates: Set<StateId> },
  input: string
): TestTraceResult {
  const trace: StateId[] = [dfa.startState];
  let current = dfa.startState;

  for (const ch of input) {
    const next = dfa.transitions.get(current)?.get(ch);
    if (next === undefined) {
      // No transition defined — reject (should only happen if δ is partial)
      return { kind: 'dfa', trace, accepted: false };
    }
    current = next;
    trace.push(current);
  }

  return { kind: 'dfa', trace, accepted: dfa.acceptStates.has(current) };
}

// ═══════════════════════════════════════════════════════════
// §2. NFA Simulation (nondeterministic trace via ε-closure)
// ═══════════════════════════════════════════════════════════

/**
 * Simulate a string step-by-step on an NFA using ε-closure expansion.
 *
 * **Algorithm:**
 *   1. Start with ε-CLOSURE({q₀})
 *   2. For each input symbol a:
 *      - Compute move(currentStates, a) = ∪_{q∈S} δ(q, a)
 *      - Compute ε-CLOSURE(move(currentStates, a))
 *   3. Accept if final state-set ∩ F ≠ ∅
 *
 * The trace is an array of state-sets, one per step (including initial).
 *
 * @param nfa - The NFA.
 * @param input - The string to simulate.
 * @returns TestTraceResult with kind 'nfa'.
 */
export function simulateNFATrace(
  nfa: NFA,
  input: string
): TestTraceResult {
  // Step 0: ε-CLOSURE({q₀})
  let currentStates = epsilonClosure(nfa, new Set([nfa.startState]));
  const trace: Set<StateId>[] = [new Set(currentStates)];

  for (const ch of input) {
    // Compute move(S, a)
    const moved = new Set<StateId>();
    for (const state of currentStates) {
      const targets = nfa.transitions.get(state)?.get(ch);
      if (targets) {
        for (const t of targets) moved.add(t);
      }
    }

    // Compute ε-CLOSURE(move(S, a))
    currentStates = epsilonClosure(nfa, moved);
    trace.push(new Set(currentStates));
  }

  // Accept if any state in the final set is an accept state
  let accepted = false;
  for (const state of currentStates) {
    if (nfa.acceptStates.has(state)) {
      accepted = true;
      break;
    }
  }

  return { kind: 'nfa', trace, accepted };
}

// ═══════════════════════════════════════════════════════════
// §3. Quick DFA Acceptance Check
// ═══════════════════════════════════════════════════════════

/**
 * Simulate a string on a DFA and return whether it is accepted.
 *
 * δ*(q₀, w) ∈ F  ↔  w ∈ L(DFA)
 *
 * @param dfa - The DFA (or MinDFA).
 * @param input - The string to simulate.
 * @returns true if the string is accepted, false otherwise.
 */
export function simulateAccepts(
  dfa: MinDFA | { states: Set<StateId>; alphabet: Set<string>; transitions: Map<StateId, Map<string, StateId>>; startState: StateId; acceptStates: Set<StateId> },
  input: string
): boolean {
  let current = dfa.startState;

  for (const ch of input) {
    const next = dfa.transitions.get(current)?.get(ch);
    if (next === undefined) return false; // No transition → reject
    current = next;
  }

  return dfa.acceptStates.has(current);
}

// ═══════════════════════════════════════════════════════════
// §4. Breadth-Limited Accepted String Generation
// ═══════════════════════════════════════════════════════════

/**
 * Generate strings accepted by the given MinDFA, sampling across varying lengths.
 *
 * **Algorithm:** Breadth-limited BFS that does NOT track visited states.
 * Instead, it explores transitions level-by-level (by string length) and
 * collects accepted strings at each depth. A per-depth cap prevents
 * exponential blowup on Σ* languages.
 *
 * @param dfa - The MinDFA to generate strings for.
 * @param opts.maxLength - Maximum string length to explore (prevents infinite loop on r*).
 * @param opts.maxResults - Maximum number of strings to return.
 * @returns Array of accepted strings sampling multiple lengths.
 */
export function generateAccepted(
  dfa: MinDFA,
  opts: { maxLength: number; maxResults: number }
): string[] {
  const results: string[] = [];
  const alphabet = [...dfa.alphabet].sort();

  if (alphabet.length === 0) {
    // No alphabet → only ε is possible
    if (dfa.acceptStates.has(dfa.startState)) {
      results.push('');
    }
    return results;
  }

  // BFS queue: [state, path built so far]
  // We allow revisiting states at different depths to discover longer strings.
  let currentLevel: Array<[StateId, string]> = [[dfa.startState, '']];

  // Check ε (start state accepting)
  if (dfa.acceptStates.has(dfa.startState)) {
    results.push('');
    if (results.length >= opts.maxResults) return results;
  }

  // Maximum entries to expand per BFS level (prevents Σ* explosion)
  const MAX_LEVEL_SIZE = 64;

  for (let depth = 0; depth < opts.maxLength && results.length < opts.maxResults; depth++) {
    const nextLevel: Array<[StateId, string]> = [];

    for (const [currentState, path] of currentLevel) {
      for (const c of alphabet) {
        const nextState = dfa.transitions.get(currentState)?.get(c);
        if (nextState === undefined) continue;

        const newPath = path + c;

        if (dfa.acceptStates.has(nextState)) {
          // Avoid duplicate strings
          if (!results.includes(newPath)) {
            results.push(newPath);
            if (results.length >= opts.maxResults) return results;
          }
        }

        nextLevel.push([nextState, newPath]);
      }
    }

    // Cap the level size to avoid exponential blowup
    if (nextLevel.length > MAX_LEVEL_SIZE) {
      // Sample evenly across the level for diversity
      const sampled: Array<[StateId, string]> = [];
      const step = nextLevel.length / MAX_LEVEL_SIZE;
      for (let i = 0; i < MAX_LEVEL_SIZE; i++) {
        sampled.push(nextLevel[Math.floor(i * step)]);
      }
      currentLevel = sampled;
    } else {
      currentLevel = nextLevel;
    }
  }

  return results;
}

// ═══════════════════════════════════════════════════════════
// §5. Rejected String Generation
// ═══════════════════════════════════════════════════════════

/**
 * Generate strings rejected by the given MinDFA, in shortest-first order.
 *
 * Enumerates strings over the alphabet in BFS (length-first) order.
 * Simulates each string on the MinDFA; emits if the final state is non-accepting.
 *
 * @param dfa - The MinDFA.
 * @param opts.maxLength - Maximum string length.
 * @param opts.maxResults - Maximum number of rejected strings.
 * @returns Array of rejected strings in non-decreasing length order.
 */
export function generateRejected(
  dfa: MinDFA,
  opts: { maxLength: number; maxResults: number }
): string[] {
  const results: string[] = [];
  const alphabet = [...dfa.alphabet].sort();

  if (alphabet.length === 0) {
    // Only possible string is ε
    if (!dfa.acceptStates.has(dfa.startState)) {
      results.push('');
    }
    return results;
  }

  // BFS: enumerate all strings over the alphabet in length order
  const queue: string[] = [''];

  while (queue.length > 0 && results.length < opts.maxResults) {
    const current = queue.shift()!;

    // Simulate the string on the DFA
    if (!simulateAccepts(dfa, current)) {
      results.push(current);
      if (results.length >= opts.maxResults) return results;
    }

    // Generate next-level strings (if within length limit)
    if (current.length < opts.maxLength) {
      for (const c of alphabet) {
        queue.push(current + c);
      }
    }
  }

  return results;
}
