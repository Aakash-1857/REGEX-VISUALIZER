/**
 * StringGenerator.ts — Generate accepted and rejected strings for a MinDFA.
 *
 * **Algorithm:** BFS over MinDFA states, tracking the path string.
 *
 * For accepted strings:
 *   Queue: (StateId, pathSoFar)
 *   When an accept state is dequeued, emit pathSoFar.
 *   BFS guarantees shortest-first (non-decreasing length) ordering.
 *
 * For rejected strings:
 *   Enumerate strings in BFS order over the alphabet.
 *   Simulate each on the MinDFA; emit if rejected.
 *
 * ZERO React imports. Pure TypeScript.
 */

import type { MinDFA, StateId } from '../types/automata';

/**
 * Generate strings accepted by the given MinDFA, in shortest-first order.
 *
 * Uses BFS from the start state. Each queue entry is (currentState, pathSoFar).
 * When we dequeue a state that is accepting, we yield the path.
 *
 * @param dfa - The MinDFA to generate strings for.
 * @param opts.maxLength - Maximum string length to explore (prevents infinite loop on r*).
 * @param opts.maxResults - Maximum number of strings to return.
 * @returns Array of accepted strings in non-decreasing length order.
 */
export function generateAccepted(
  dfa: MinDFA,
  opts: { maxLength: number; maxResults: number }
): string[] {
  const results: string[] = [];
  const alphabet = [...dfa.alphabet].sort();

  // BFS queue: [state, path built so far]
  const queue: Array<[StateId, string]> = [[dfa.startState, '']];

  // Track visited (state, path length) to avoid revisiting identical BFS levels
  // Actually for BFS on DFA we just track visited states — but since the same state
  // can be reached with different paths (at different lengths), we must allow revisits
  // at different depths. We use a visited set of (state, length) pairs.
  // But this can explode. Instead: the DFA is deterministic, so each string
  // leads to exactly one state. We do BFS over strings, not states.
  // Optimization: BFS by state is sufficient since for shortest-first we only
  // care about first visit to each state.
  const visited = new Set<StateId>();

  // Check start state
  if (dfa.acceptStates.has(dfa.startState)) {
    results.push(''); // ε is accepted
    if (results.length >= opts.maxResults) return results;
  }
  visited.add(dfa.startState);

  while (queue.length > 0 && results.length < opts.maxResults) {
    const [currentState, path] = queue.shift()!;

    if (path.length >= opts.maxLength) continue;

    for (const c of alphabet) {
      const nextState = dfa.transitions.get(currentState)?.get(c);
      if (nextState === undefined) continue;

      const newPath = path + c;

      if (dfa.acceptStates.has(nextState) && !visited.has(nextState)) {
        results.push(newPath);
        if (results.length >= opts.maxResults) return results;
      }

      if (!visited.has(nextState)) {
        visited.add(nextState);
        queue.push([nextState, newPath]);
      }
    }
  }

  return results;
}

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

/**
 * Simulate a string on a DFA and return whether it is accepted.
 *
 * δ*(q₀, w) ∈ F  ↔  w ∈ L(DFA)
 *
 * @param dfa - The DFA (or MinDFA).
 * @param input - The string to simulate.
 * @returns true if the string is accepted, false otherwise.
 */
export function simulateAccepts(dfa: MinDFA | { states: Set<StateId>; alphabet: Set<string>; transitions: Map<StateId, Map<string, StateId>>; startState: StateId; acceptStates: Set<StateId> }, input: string): boolean {
  let current = dfa.startState;

  for (const ch of input) {
    const next = dfa.transitions.get(current)?.get(ch);
    if (next === undefined) return false; // No transition → reject
    current = next;
  }

  return dfa.acceptStates.has(current);
}

/**
 * Simulate a string step-by-step on a DFA, returning the trace of states visited.
 *
 * @param dfa - The DFA.
 * @param input - The string to simulate.
 * @returns Array of StateIds representing the trace [q₀, δ(q₀,w₁), δ*(q₀,w₁w₂), ...].
 */
export function simulateTrace(
  dfa: { transitions: Map<StateId, Map<string, StateId>>; startState: StateId; acceptStates: Set<StateId> },
  input: string
): { trace: StateId[]; accepted: boolean } {
  const trace: StateId[] = [dfa.startState];
  let current = dfa.startState;

  for (const ch of input) {
    const next = dfa.transitions.get(current)?.get(ch);
    if (next === undefined) {
      return { trace, accepted: false };
    }
    current = next;
    trace.push(current);
  }

  return { trace, accepted: dfa.acceptStates.has(current) };
}
